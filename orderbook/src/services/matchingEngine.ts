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
      priceFilter = incomingOrder.price;
      sortOption = { price: 1, createdAt: 1 };
    } else {
      priceFilter = incomingOrder.price;
      sortOption = { price: -1, createdAt: 1 };
    }

    const bestOpposingOrder = await Order.findOne({
      marketId: incomingOrder.marketId,
      side: oppositeSide,
      tokenType: incomingOrder.tokenType,
      status: { $in: ["OPEN", "PARTIAL"] },
      price:
        incomingOrder.side === "BUY"
          ? { $lte: priceFilter }
          : { $gte: priceFilter },
    }).sort(sortOption).exec();

    if (!bestOpposingOrder) {
      stillOpen = false;
      break;
    }

    const availableQty = bestOpposingOrder.quantity - bestOpposingOrder.filledQuantity;
    if (availableQty <= 0) {
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
  quantity: number,
  buyerLimitPrice: number
) {
  if (!buyerBal || !sellerBal) {
    console.error("User balance error during trade execution (balances not provided).");
    return;
  }

  // Get or create market balances from the passed-in objects
  let buyerMarket = buyerBal.markets.find(m => m.marketId === marketId);
  if (!buyerMarket) {
    buyerMarket = { marketId, yesTokens: 0, noTokens: 0, lockedCollateralYes: 0, lockedCollateralNo: 0 };
    buyerBal.markets.push(buyerMarket);
  }

  let sellerMarket = sellerBal.markets.find((m: { marketId: string; }) => m.marketId === marketId);
  if (!sellerMarket) {
    // Attempt to create if missing, though this shouldn't happen for a seller ideally
    console.warn(`No market balance found for seller ${sellerBal.userId} in market ${marketId}. Creating one.`);
    sellerMarket = { marketId, yesTokens: 0, noTokens: 0, lockedCollateralYes: 0, lockedCollateralNo: 0 };
    sellerBal.markets.push(sellerMarket);
  }

  // Calculate payment cost based on execution price
  const totalCost = price * quantity;
  
  // Calculate potential refund for the buyer due to price improvement
  const priceDifference = buyerLimitPrice - price;
  let refundAmount = 0;
  if (priceDifference > 0) {
    refundAmount = priceDifference * quantity;
  }

  if (tokenType === "YES") {
    if (sellerMarket.yesTokens >= quantity) {
      // Normal transfer from inventory
      sellerBal.availableUSD += totalCost;
      sellerMarket.yesTokens -= quantity;
      buyerMarket.yesTokens += quantity;
    } else {
      // Short sale: use available YES tokens and mint for the remainder
      const available = sellerMarket.yesTokens;
      const shortAmount = quantity - available;
      console.log(`[Trade Execution] Short Sale: Seller ${sellerBal.userId} has ${available} YES tokens, shorting ${shortAmount} more. Locked Collateral: ${sellerMarket.lockedCollateralYes}`);
      
      sellerBal.availableUSD += totalCost;
      if (available > 0) {
        sellerMarket.yesTokens -= available;
        buyerMarket.yesTokens += available;
      }
      buyerMarket.yesTokens += shortAmount;
      sellerMarket.noTokens += shortAmount;
      
      // Note: lockedCollateralYes is already set during order placement
      // and should not be modified during trade execution
    }
  } else if (tokenType === "NO") {
    if (sellerMarket.noTokens >= quantity) {
      // Normal transfer from inventory
      sellerBal.availableUSD += totalCost;
      sellerMarket.noTokens -= quantity;
      buyerMarket.noTokens += quantity;
    } else {
      // Short sale: use available NO tokens and mint for the remainder
      const available = sellerMarket.noTokens;
      const shortAmount = quantity - available;
      console.log(`[Trade Execution] Short Sale: Seller ${sellerBal.userId} has ${available} NO tokens, shorting ${shortAmount} more. Locked Collateral: ${sellerMarket.lockedCollateralNo}`);
      
      sellerBal.availableUSD += totalCost;
      if (available > 0) {
        sellerMarket.noTokens -= available;
        buyerMarket.noTokens += available;
      }
      buyerMarket.noTokens += shortAmount;
      sellerMarket.yesTokens += shortAmount;
      
      // Note: lockedCollateralNo is already set during order placement
      // and should not be modified during trade execution
    }
  }

  // Apply refund to buyer's balance if applicable
  if (refundAmount > 0) {
    buyerBal.availableUSD += refundAmount;
  }

  // Save updated balances
  try {
    await Promise.all([buyerBal.save(), sellerBal.save()]);
    console.log(`[Trade Execution] Balances saved for trade between ${buyerBal.userId} and ${sellerBal.userId}. Seller's locked collateral - YES: ${sellerMarket.lockedCollateralYes}, NO: ${sellerMarket.lockedCollateralNo}`);
  } catch(error) {
    console.error(`[Trade Execution] Error saving balances for trade between ${buyerBal.userId} and ${sellerBal.userId}:`, error);
  }
}
