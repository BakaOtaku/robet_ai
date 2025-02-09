import { Order, IOrder } from "../models/Order";
import { Trade } from "../models/Trade";
import { UserBalance } from "../models/UserBalance";
import { v4 as uuidv4 } from "uuid";

/**
 * matchOrders attempts to match the incomingOrder with existing opposite-side orders.
 * It can produce multiple partial fills if there's more than one opposing order in the book.
 */
export async function matchOrders(incomingOrder: IOrder): Promise<void> {
  let remainingQty = incomingOrder.quantity - incomingOrder.filledQuantity;
  let stillOpen = true;

  while (stillOpen && remainingQty > 0) {
    // Find the best opposing order
    const oppositeSide = incomingOrder.side === "BUY" ? "SELL" : "BUY";

    // For a BUY, we want SELL orders with price <= incomingOrder.price
    // sorted by the lowest price first
    // For a SELL, we want BUY orders with price >= incomingOrder.price
    // sorted by highest price first
    let priceFilter;
    let sortOption: any;

    if (incomingOrder.side === "BUY") {
      // For a BUY order, we want SELL orders with price <= our bid
      priceFilter = incomingOrder.price;
      sortOption = { price: 1, createdAt: 1 }; // best = lowest price
    } else {
      // For a SELL order, we want BUY orders with price >= our ask
      priceFilter = incomingOrder.price;
      sortOption = { price: -1, createdAt: 1 }; // best = highest price
    }

    const bestOpposingOrder = await Order.findOne({
      marketId: incomingOrder.marketId,
      side: oppositeSide,
      status: { $in: ["OPEN", "PARTIAL"] },
      price: incomingOrder.side === "BUY" ? { $lte: priceFilter } : { $gte: priceFilter }
    }).sort(sortOption).exec();
    console.log("bestOpposingOrder", bestOpposingOrder);
    if (!bestOpposingOrder) {
      // No matching orders
      stillOpen = false;
      break;
    }

    // Determine the available quantity on that opposing order
    const availableQty = bestOpposingOrder.quantity - bestOpposingOrder.filledQuantity;
    if (availableQty <= 0) {
      // If for some reason it's fully filled, mark it
      bestOpposingOrder.status = "FILLED";
      await bestOpposingOrder.save();
      continue;
    }

    // The trade quantity is the min of what's available and what we still need
    const matchQty = Math.min(remainingQty, availableQty);

    // Determine the execution price
    // Usually for a limit-order book, the execution price is the resting order's price
    // or there could be different logic. We'll use the resting order's price.
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

    // Update the filled quantities
    incomingOrder.filledQuantity += matchQty;
    bestOpposingOrder.filledQuantity += matchQty;

    // Update order statuses
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

    // -----------------------------------------------------------
    // Now handle the balance changes for buyer & seller
    // including minting new Yes tokens if the SELL side is short.
    // -----------------------------------------------------------
    if (incomingOrder.side === "BUY") {
      await executeTrade(
        incomingOrder.userId,
        bestOpposingOrder.userId,
        incomingOrder.marketId,
        executionPrice,
        matchQty
      );
    } else {
      await executeTrade(
        bestOpposingOrder.userId,
        incomingOrder.userId,
        incomingOrder.marketId,
        executionPrice,
        matchQty
      );
    }

    // Decrement remainingQty
    remainingQty -= matchQty;
  }
}

/**
 * executeTrade handles the actual economic outcomes of the matched trade:
 * - The buyer pays price * qty from availableUSD
 * - The seller receives that amount
 * - If the seller is shorting, new Yes tokens are "minted" to the buyer,
 *   and the seller effectively gets No tokens plus must keep collateral locked.
 * - If the seller is selling existing tokens, we just transfer them from seller to buyer, no new minting needed.
 */
async function executeTrade(
  buyerId: string,
  sellerId: string,
  marketId: string,
  price: number,
  quantity: number
) {
  // Load the user balances
  const [buyerBal, sellerBal] = await Promise.all([
    UserBalance.findOne({ userId: buyerId }),
    UserBalance.findOne({ userId: sellerId })
  ]);
  if (!buyerBal || !sellerBal) {
    // In real code, handle error properly
    return;
  }

  // Get or create the buyer's & seller's per-market records
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

  // Buyer pays the seller => price * quantity
  const totalCost = price * quantity;
  if (buyerBal.availableUSD < totalCost) {
    // real system: revert / throw
    console.error("Buyer does not have enough USD to pay for the trade!");
  } else {
    buyerBal.availableUSD -= totalCost;
    sellerBal.availableUSD += totalCost;
  }

  // Check if the seller is actually shorting these shares or selling from inventory
  // If seller has at least 'quantity' yesTokens, that means they are selling from their inventory
  // Otherwise, the difference is newly minted shares.
  if (sellerMarket.yesTokens >= quantity) {
    // The seller is just transferring existing tokens to the buyer
    sellerMarket.yesTokens -= quantity;
    buyerMarket.yesTokens += quantity;
  } else {
    // The seller has some existing tokens, but not enough
    // Sell the ones they have, short the rest
    const alreadyOwned = sellerMarket.yesTokens;
    const shortAmount = quantity - alreadyOwned;

    // Transfer the portion they already own
    if (alreadyOwned > 0) {
      sellerMarket.yesTokens -= alreadyOwned;
      buyerMarket.yesTokens += alreadyOwned;
    }

    // The remainder is short => minted new shares to buyer
    // For each minted share:
    // - Buyer gets 1 Yes token
    // - Seller must have $1 locked
    //   The difference between locked $1 and the sale price is the immediate PnL to the seller
    buyerMarket.yesTokens += shortAmount;

    // The seller's lockedCollateral for this market was already incremented in the place-order step.
    // We do NOT increment it here again, or we'll double-count.  
    // However, if the short amount ended up smaller than we anticipated, we might want to release some collateral. 
    // (For partial matches, the user locked full collateral for the entire short order, but only matched partially.)
    // Let's do that logic:

    const totalShortLocked = sellerMarket.lockedCollateral;
    // total short shares requested was 'quantity' (or more). 
    // We'll see how many are actually shorted in this match => 'shortAmount'
    // If the entire SELL order doesn't fill, there could be leftover locked collateral. 
    // We'll only finalize collateral usage after the order is fully matched or canceled.

    // For now, we won't do immediate partial release. 
    // A more advanced approach can recalc lockedCollateral = total short shares outstanding for that market.
  }

  // Save the updated user balances
  await buyerBal.save();
  await sellerBal.save();
}
