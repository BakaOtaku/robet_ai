import { Order, IOrder } from "../models/Order";
import { Trade } from "../models/Trade";
import { UserBalance } from "../models/UserBalance";
import { v4 as uuidv4 } from "uuid";

/**
 * matchOrders attempts to match the incomingOrder with existing orders on the opposite side,
 * having the same tokenType. It can produce multiple partial fills.
 */
export async function matchOrders(incomingOrder: IOrder): Promise<void> {
  let remainingQty = incomingOrder.quantity - incomingOrder.filledQuantity;
  let stillOpen = true;

  while (stillOpen && remainingQty > 0) {
    const oppositeSide = incomingOrder.side === "BUY" ? "SELL" : "BUY";

    let priceFilter;
    let sortOption: any;

    if (incomingOrder.side === "BUY") {
      // For a BUY, we want SELL orders with price <= incomingOrder.price, lowest price first.
      priceFilter = incomingOrder.price;
      sortOption = { price: 1, createdAt: 1 };
    } else {
      // For a SELL, we want BUY orders with price >= incomingOrder.price, highest price first.
      priceFilter = incomingOrder.price;
      sortOption = { price: -1, createdAt: 1 };
    }

    // Filter by marketId, side, status, price condition, and the same tokenType.
    const bestOpposingOrder = await Order.findOne({
      marketId: incomingOrder.marketId,
      side: oppositeSide,
      tokenType: incomingOrder.tokenType,
      status: { $in: ["OPEN", "PARTIAL"] },
      price: incomingOrder.side === "BUY" ? { $lte: priceFilter } : { $gte: priceFilter }
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

    // Create a Trade record
    const tradeId = uuidv4();
    await Trade.create({
      tradeId,
      marketId: incomingOrder.marketId,
      buyOrderId: incomingOrder.side === "BUY" ? incomingOrder.orderId : bestOpposingOrder.orderId,
      sellOrderId: incomingOrder.side === "SELL" ? incomingOrder.orderId : bestOpposingOrder.orderId,
      price: executionPrice,
      quantity: matchQty
    });

    // Update filled quantities and order statuses
    incomingOrder.filledQuantity += matchQty;
    bestOpposingOrder.filledQuantity += matchQty;

    if (bestOpposingOrder.filledQuantity === bestOpposingOrder.quantity) {
      bestOpposingOrder.status = "FILLED";
    } else {
      bestOpposingOrder.status = "PARTIAL";
    }
    if (incomingOrder.filledQuantity === incomingOrder.quantity) {
      incomingOrder.status = "FILLED";
      stillOpen = false;
    } else {
      incomingOrder.status = "PARTIAL";
    }

    await bestOpposingOrder.save();
    await incomingOrder.save();

    // Execute the trade using the tokenType from the order.
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
 * executeTrade handles the payment and token transfers.
 *
 * - The buyer pays (price × quantity).
 * - For Yes‑Token trades:
 *    • If the seller has enough YES tokens (from prior inventory), they are transferred.
 *    • Otherwise, the available YES tokens are transferred and the remaining qty is "minted":
 *      the buyer gets new YES tokens and the seller is credited with the same quantity of NO tokens.
 * - For No‑Token (secondary) trades:
 *    • Seller must already hold the NO tokens, and they are transferred to the buyer.
 */
async function executeTrade(
  buyerId: string,
  sellerId: string,
  marketId: string,
  tokenType: "YES" | "NO",
  price: number,
  quantity: number
) {
  // Load both users' balances
  const [buyerBal, sellerBal] = await Promise.all([
    UserBalance.findOne({ userId: buyerId }),
    UserBalance.findOne({ userId: sellerId })
  ]);
  if (!buyerBal || !sellerBal) {
    console.error("User balance error during trade execution.");
    return;
  }

  // Get or create per-market records for both buyer and seller.
  let buyerMarket = buyerBal.markets.find(m => m.marketId === marketId);
  if (!buyerMarket) {
    buyerMarket = { marketId, yesTokens: 0, noTokens: 0, lockedCollateral: 0 };
    buyerBal.markets.push(buyerMarket);
  }
  let sellerMarket = sellerBal.markets.find(m => m.marketId === marketId);
  if (!sellerMarket) {
    sellerMarket = { marketId, yesTokens: 0, noTokens: 0, lockedCollateral: 0 };
    sellerBal.markets.push(sellerMarket);
  }

  // Payment: Buyer pays seller: totalCost = price × quantity.
  const totalCost = price * quantity;
  if (buyerBal.availableUSD < totalCost) {
    console.error("Buyer lacks sufficient funds for the trade!");
    return;
  }
  buyerBal.availableUSD -= totalCost;
  sellerBal.availableUSD += totalCost;

  if (tokenType === "YES") {
    // The trade is for Yes‑Tokens.
    if (sellerMarket.yesTokens >= quantity) {
      // Seller transfers tokens from inventory.
      sellerMarket.yesTokens -= quantity;
      buyerMarket.yesTokens += quantity;
    } else {
      // Not enough tokens in inventory: seller is short.
      const alreadyOwned = sellerMarket.yesTokens;
      const shortAmount = quantity - alreadyOwned;
      if (alreadyOwned > 0) {
        sellerMarket.yesTokens -= alreadyOwned;
        buyerMarket.yesTokens += alreadyOwned;
      }
      // Mint the remaining tokens:
      buyerMarket.yesTokens += shortAmount;
      // And credit the seller with newly created NO tokens (their short position).
      sellerMarket.noTokens = (sellerMarket.noTokens || 0) + shortAmount;
    }
  } else if (tokenType === "NO") {
    // For a secondary market trade of NO‑Tokens:
    if (sellerMarket.noTokens < quantity) {
      console.error("Seller does not hold enough NO‑Tokens.");
      return;
    }
    sellerMarket.noTokens -= quantity;
    buyerMarket.noTokens += quantity;
  }

  // Save updated user balances
  await Promise.all([buyerBal.save(), sellerBal.save()]);
}
