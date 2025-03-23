import { Order, IOrder } from "../models/Order";
import { Trade } from "../models/Trade";
import { UserBalance } from "../models/UserBalance";
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

    console.log("bestOpposingOrder", bestOpposingOrder);
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

    await bestOpposingOrder.save();
    await incomingOrder.save();

    // Execute the trade and adjust user token balances.
    if (incomingOrder.side === "BUY") {
      await executeTrade(
        incomingOrder.userId,
        bestOpposingOrder.userId,
        incomingOrder.marketId,
        incomingOrder.tokenType,
        executionPrice,
        matchQty
      );
    } else {
      await executeTrade(
        bestOpposingOrder.userId,
        incomingOrder.userId,
        incomingOrder.marketId,
        incomingOrder.tokenType,
        executionPrice,
        matchQty
      );
    }
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
  buyerId: string,
  sellerId: string,
  marketId: string,
  tokenType: "YES" | "NO",
  price: number,
  quantity: number
) {
  const [buyerBal, sellerBal] = await Promise.all([
    UserBalance.findOne({ userId: buyerId }),
    UserBalance.findOne({ userId: sellerId })
  ]);
  if (!buyerBal || !sellerBal) {
    console.error("User balance error during trade execution.");
    return;
  }

  // Get or create market balances.
  let buyerMarket = buyerBal.markets.find(m => m.marketId === marketId);
  if (!buyerMarket) {
    buyerMarket = { marketId, yesTokens: 0, noTokens: 0, lockedCollateralYes: 0, lockedCollateralNo: 0 };
    buyerBal.markets.push(buyerMarket);
  }
  let sellerMarket = sellerBal.markets.find(m => m.marketId === marketId);
  if (!sellerMarket) {
    sellerMarket = { marketId, yesTokens: 0, noTokens: 0, lockedCollateralYes: 0, lockedCollateralNo: 0 };
    sellerBal.markets.push(sellerMarket);
  }

  // Payment: Buyer pays seller immediate cost.
  const totalCost = price * quantity;
  if (buyerBal.availableUSD < totalCost) {
    console.error("Buyer lacks sufficient funds for the trade!");
    return;
  }
  buyerBal.availableUSD -= totalCost;
  sellerBal.availableUSD += totalCost;

  if (tokenType === "YES") {
    if (sellerMarket.yesTokens >= quantity) {
      // Normal transfer from inventory.
      sellerMarket.yesTokens -= quantity;
      buyerMarket.yesTokens += quantity;
    } else {
      // Short sale: use available YES tokens and mint for the remainder.
      const available = sellerMarket.yesTokens;
      const shortAmount = quantity - available;
      if (available > 0) {
        sellerMarket.yesTokens -= available;
        buyerMarket.yesTokens += available;
      }
      // Mint additional YES tokens to provide to buyer.
      buyerMarket.yesTokens += shortAmount;
      // Credit seller with the opposite token (NO) for the short portion.
      sellerMarket.noTokens += shortAmount;
    }
  } else if (tokenType === "NO") {
    if (sellerMarket.noTokens >= quantity) {
      sellerMarket.noTokens -= quantity;
      buyerMarket.noTokens += quantity;
    } else {
      const available = sellerMarket.noTokens;
      const shortAmount = quantity - available;
      if (available > 0) {
        sellerMarket.noTokens -= available;
        buyerMarket.noTokens += available;
      }
      // Mint additional NO tokens to supply buyer.
      buyerMarket.noTokens += shortAmount;
      // Credit seller with YES tokens for the shorted amount.
      sellerMarket.yesTokens += shortAmount;
    }
  }

  await Promise.all([buyerBal.save(), sellerBal.save()]);
}
