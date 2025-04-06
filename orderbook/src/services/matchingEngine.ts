import { Order, IOrder } from "../models/Order";
import { Trade } from "../models/Trade";
import { IUserBalance, UserBalance } from "../models/UserBalance";
import { v4 as uuidv4 } from "uuid";

/**
 * matchOrders attempts to match the incoming order with existing orders on the opposite side.
 */
export async function matchOrders(incomingOrder: IOrder): Promise<void> {
  let remainingQty = incomingOrder.quantity - incomingOrder.filledQuantity;
  let stillOpen = true;

  while (stillOpen && remainingQty > 0) {
    const oppositeSide = incomingOrder.side === "BUY" ? "SELL" : "BUY";
    let priceFilter;
    let sortOption: any;

    if (incomingOrder.side === "BUY") {
      priceFilter = { $lte: incomingOrder.price };
      sortOption = { price: 1, createdAt: 1 };
    } else {
      priceFilter = { $gte: incomingOrder.price };
      sortOption = { price: -1, createdAt: 1 };
    }

    const bestOpposingOrder = await Order.findOne({
      marketId: incomingOrder.marketId,
      side: oppositeSide,
      tokenType: incomingOrder.tokenType,
      status: { $in: ["OPEN", "PARTIAL"] },
      price: priceFilter,
      userId: { $ne: incomingOrder.userId }
    }).sort(sortOption).exec();

    if (!bestOpposingOrder) {
      stillOpen = false;
      break;
    }

    const availableQty = bestOpposingOrder.quantity - bestOpposingOrder.filledQuantity;
    if (availableQty <= 0) {
      console.warn(`[Matching Engine] Found opposing order ${bestOpposingOrder.orderId} with zero available quantity. Marking as FILLED.`);
      bestOpposingOrder.status = "FILLED";
      await bestOpposingOrder.save();
      continue;
    }

    const matchQty = Math.min(remainingQty, availableQty);
    const executionPrice = bestOpposingOrder.price;

    // Create a Trade record.
    const tradeId = uuidv4();
    await Trade.create({
      tradeId,
      marketId: incomingOrder.marketId,
      buyOrderId: incomingOrder.side === "BUY" ? incomingOrder.orderId : bestOpposingOrder.orderId,
      sellOrderId: incomingOrder.side === "SELL" ? incomingOrder.orderId : bestOpposingOrder.orderId,
      price: executionPrice,
      quantity: matchQty,
      tokenType: incomingOrder.tokenType
    });

    // Update order fill quantities and statuses.
    incomingOrder.filledQuantity += matchQty;
    bestOpposingOrder.filledQuantity += matchQty;
    incomingOrder.status = incomingOrder.filledQuantity === incomingOrder.quantity ? "FILLED" : "PARTIAL";
    bestOpposingOrder.status = bestOpposingOrder.filledQuantity === bestOpposingOrder.quantity ? "FILLED" : "PARTIAL";

    // Save orders *before* executing the trade balance changes
    await bestOpposingOrder.save();
    await incomingOrder.save(); // Save incoming order status update

    // Execute the trade and adjust user token balances.
    const buyerId = incomingOrder.side === "BUY" ? incomingOrder.userId : bestOpposingOrder.userId;
    const sellerId = incomingOrder.side === "SELL" ? incomingOrder.userId : bestOpposingOrder.userId;
    const buyerLimitPrice = incomingOrder.side === "BUY" ? incomingOrder.price : bestOpposingOrder.price;

    // Fetch the latest balances just before executing the trade
    const [buyerBal, sellerBal] = await Promise.all([
      UserBalance.findOne({ userId: buyerId }).exec(),
      UserBalance.findOne({ userId: sellerId }).exec()
    ]);

    if (!buyerBal || !sellerBal) {
      console.error(`[Trade Execution] Could not find balances for buyer ${buyerId} or seller ${sellerId}. Aborting trade.`);
      // Decide how to handle this - potentially revert order status updates?
      // For now, just log and continue the loop hoping the next match works,
      // but this indicates a serious issue.
      remainingQty = 0; // Stop trying to fill this incoming order if balances are missing
      break; 
    }

    await executeTrade(
      buyerBal, // Pass fetched buyer balance
      sellerBal, // Pass fetched seller balance
      incomingOrder.marketId,
      incomingOrder.tokenType,
      executionPrice,
      matchQty,
      buyerLimitPrice
    );

    remainingQty -= matchQty;

    // Update incoming order status after processing a match
    if (remainingQty <= 0) {
      incomingOrder.status = "FILLED";
      stillOpen = false; // No more quantity left to match
    } else {
      incomingOrder.status = "PARTIAL";
    }
    // Save the latest status of the incoming order within the loop
    await incomingOrder.save();
  }

  // If the loop finished because no more matches were found (stillOpen = false)
  // but the order wasn't fully filled, ensure its status is OPEN or PARTIAL.
  if (remainingQty > 0 && incomingOrder.status !== "FILLED") {
     incomingOrder.status = incomingOrder.filledQuantity > 0 ? "PARTIAL" : "OPEN";
     // Save the final status if it wasn't fully filled and the loop exited
     await incomingOrder.save();
  }
}

/**
 * executeTrade handles payment and token transfers.
 *
 * Immediate Payment: The buyer pays price × quantity at execution.
 * Token Transfers:
 *  - For YES trades:
 *      • If seller has enough YES tokens, transfer those.
 *      • Otherwise, use available tokens and "short" the remainder:
 *          – Mint the extra YES tokens to deliver to the buyer.
 *          – Credit the seller with minted NO tokens.
 *  - For NO trades (symmetric):
 *      • If seller has enough NO tokens, transfer those.
 *      • Otherwise, use available NO tokens and short the remainder:
 *          – Mint extra NO tokens to deliver to the buyer.
 *          – Credit the seller with minted YES tokens.
 *
 * Note: The necessary collateral for short sales is already locked at order time.
 */
async function executeTrade(
  buyerBal: IUserBalance,
  sellerBal: IUserBalance,
  marketId: string,
  tokenType: "YES" | "NO",
  price: number,
  quantity: number, // This is the matchQty
  buyerLimitPrice: number
) {
  if (!buyerBal || !sellerBal) {
    console.error("User balance error during trade execution (balances not provided).");
    return;
  }

  // Get or create market balances and initialize locked fields if missing
  let buyerMarket = buyerBal.markets.find(m => m.marketId === marketId);
  if (!buyerMarket) {
    buyerMarket = { marketId, yesTokens: 0, noTokens: 0, lockedYesTokens: 0, lockedNoTokens: 0, lockedCollateralYes: 0, lockedCollateralNo: 0 };
    buyerBal.markets.push(buyerMarket);
  } else {
      // Ensure locked fields exist for buyer (though less critical)
      buyerMarket.lockedYesTokens = buyerMarket.lockedYesTokens || 0;
      buyerMarket.lockedNoTokens = buyerMarket.lockedNoTokens || 0;
      buyerMarket.lockedCollateralYes = buyerMarket.lockedCollateralYes || 0;
      buyerMarket.lockedCollateralNo = buyerMarket.lockedCollateralNo || 0;
  }


  let sellerMarket = sellerBal.markets.find((m: { marketId: string; }) => m.marketId === marketId);
  if (!sellerMarket) {
    console.warn(`No market balance found for seller ${sellerBal.userId} in market ${marketId}. Creating one.`);
    sellerMarket = { marketId, yesTokens: 0, noTokens: 0, lockedYesTokens: 0, lockedNoTokens: 0, lockedCollateralYes: 0, lockedCollateralNo: 0 };
    sellerBal.markets.push(sellerMarket);
  } else {
     // Ensure locked fields exist and initialize to 0 if undefined
     sellerMarket.lockedYesTokens = sellerMarket.lockedYesTokens || 0;
     sellerMarket.lockedNoTokens = sellerMarket.lockedNoTokens || 0;
     sellerMarket.lockedCollateralYes = sellerMarket.lockedCollateralYes || 0;
     sellerMarket.lockedCollateralNo = sellerMarket.lockedCollateralNo || 0;
  }

  // Calculate payment cost based on execution price
  const totalCost = price * quantity;

  // Calculate potential refund for the buyer due to price improvement
  const priceDifference = buyerLimitPrice - price;
  let refundAmount = 0;
  if (priceDifference > 0) {
    refundAmount = priceDifference * quantity;
  }

  // --- Seller Asset Handling ---
  sellerBal.availableUSD += totalCost; // Seller always receives payment for the trade

  if (tokenType === "YES") {
    if (sellerMarket.lockedYesTokens >= quantity) {
      // Trade filled from seller's locked YES tokens
      sellerMarket.lockedYesTokens -= quantity;
      buyerMarket.yesTokens += quantity;
    } else {
      // Trade filled partially/fully via short sale (collateral was locked)
      let remainingToShort = quantity;
      // Use any available locked tokens first (can happen in partial fills)
      if (sellerMarket.lockedYesTokens > 0) {
          const useLocked = Math.min(quantity, sellerMarket.lockedYesTokens);
          console.log(`[Trade Execution] Seller ${sellerBal.userId} using ${useLocked} remaining locked YES tokens.`);
          sellerMarket.lockedYesTokens -= useLocked;
          buyerMarket.yesTokens += useLocked;
          remainingToShort -= useLocked;
      }

      if (remainingToShort > 0) {
          // This portion must be covered by locked collateral (short sale)
          console.log(`[Trade Execution] Seller ${sellerBal.userId} fulfilling ${remainingToShort} YES via short sale using locked collateral.`);
          if (sellerMarket.lockedCollateralYes < remainingToShort) {
              console.error(`[Trade Execution Error] Seller ${sellerBal.userId} has insufficient lockedCollateralYes (${sellerMarket.lockedCollateralYes}) to cover short sale of ${remainingToShort} YES.`);
              // TODO: Handle this critical error state - potentially revert trade?
              return; // Stop processing this trade execution
          }
          // DO NOT consume the locked collateral here. It remains locked until settlement.

          // Mint YES for buyer
          buyerMarket.yesTokens += remainingToShort;
          // Mint NO for seller
          sellerMarket.noTokens += remainingToShort; // Seller receives the opposite token
      }
    }
  } else if (tokenType === "NO") {
    if (sellerMarket.lockedNoTokens >= quantity) {
      // Trade filled from seller's locked NO tokens
      sellerMarket.lockedNoTokens -= quantity;
      buyerMarket.noTokens += quantity;
    } else {
       // Trade filled partially/fully via short sale (collateral was locked)
      let remainingToShort = quantity;
      // Use any available locked tokens first
      if (sellerMarket.lockedNoTokens > 0) {
          const useLocked = Math.min(quantity, sellerMarket.lockedNoTokens);
          sellerMarket.lockedNoTokens -= useLocked;
          buyerMarket.noTokens += useLocked;
          remainingToShort -= useLocked;
      }

      if (remainingToShort > 0) {
          // This portion must be covered by locked collateral (short sale)
          console.log(`[Trade Execution] Seller ${sellerBal.userId} fulfilling ${remainingToShort} NO via short sale using locked collateral.`);
          if (sellerMarket.lockedCollateralNo < remainingToShort) {
              console.error(`[Trade Execution Error] Seller ${sellerBal.userId} has insufficient lockedCollateralNo (${sellerMarket.lockedCollateralNo}) to cover short sale of ${remainingToShort} NO.`);
              // TODO: Handle this critical error state
              return; // Stop processing this trade execution
          }
          // DO NOT consume the locked collateral here. It remains locked until settlement.

          // Mint NO for buyer
          buyerMarket.noTokens += remainingToShort;
          // Mint YES for seller
          sellerMarket.yesTokens += remainingToShort; // Seller receives the opposite token
      }
    }
  }

  // --- Buyer Asset Handling ---
  // Note: Buyer funds were already locked at order placement.
  // We just need to apply the refund if the execution price was better than their limit price.
  if (refundAmount > 0) {
    buyerBal.availableUSD += refundAmount;
    // TODO: Need to ensure the originally locked buyer funds are correctly marked as 'used' or removed from a 'lockedUSD' field.
  }

  // --- Final Save ---
  // Mark markets as modified since nested properties were changed
  buyerBal.markModified('markets');
  sellerBal.markModified('markets');

  try {
    await Promise.all([buyerBal.save(), sellerBal.save()]);
    console.log(`[Trade Execution] Balances saved for trade. Seller: ${sellerBal.userId}, Buyer: ${buyerBal.userId}. Seller Locked - YES Tokens: ${sellerMarket.lockedYesTokens}, NO Tokens: ${sellerMarket.lockedNoTokens}, YES Collateral: ${sellerMarket.lockedCollateralYes}, NO Collateral: ${sellerMarket.lockedCollateralNo}`);
  } catch(error) {
    console.error(`[Trade Execution] Error saving balances for trade between ${buyerBal.userId} and ${sellerBal.userId}:`, error);
    // TODO: Consider how to handle save failures - potential inconsistency
  }
}
