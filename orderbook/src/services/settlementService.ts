// services/settlementService.ts
import { Market } from "../models/Market";
import { UserBalance } from "../models/UserBalance";
import { Order } from "../models/Order";
import mongoose from "mongoose";

export async function settleMarket(marketId: string, outcome: "YES" | "NO") {
  const market = await Market.findOne({ marketId });
  if (!market) throw new Error("Market not found");
  if (market.settled) throw new Error("Market already settled");

  // --- Phase 1: Cancel Open Orders & Calculate BUY Refunds ---

  const openOrders = await Order.find({
    marketId: marketId,
    status: { $in: ["OPEN", "PARTIAL"] },
  });

  // Map to store BUY order refunds per user
  const buyRefunds = new Map<string, number>();
  const orderCancellationPromises: Promise<any>[] = [];

  for (const order of openOrders) {
    const unfilledQuantity = order.quantity - order.filledQuantity;
    if (unfilledQuantity <= 0) continue;

    if (order.side === "BUY") {
      const refund = unfilledQuantity * order.price;
      buyRefunds.set(order.userId, (buyRefunds.get(order.userId) || 0) + refund);
    }
    // For SELL orders, we assume the matching/order management logic
    // handles releasing locks associated with the unfilled portion upon cancellation/filling.
    // Settlement phase will deal with locks remaining for *filled* portions.

    order.status = "CANCELLED";
    orderCancellationPromises.push(order.save());
  }

  // Wait for all orders to be marked as cancelled
  await Promise.all(orderCancellationPromises);
  console.log(`[Settlement ${marketId}] Cancelled ${openOrders.length} open/partial orders.`);

  // --- Phase 2: Process User Balances and Final Settlement ---

  // We fetch all users. In a high-scale scenario, filter for users active in the market.
  const allUsers = await UserBalance.find({});
  const userBalanceUpdatePromises: Promise<any>[] = [];

  for (const ub of allUsers) {
    const m = ub.markets.find(x => x.marketId === marketId);
    if (!m) continue; // User did not participate in this market

    // 1. Apply BUY order refunds calculated in Phase 1
    const refund = buyRefunds.get(ub.userId);
    if (refund) {
      ub.availableUSD += refund;
    }

    // --- Corrected handling of remaining locked tokens ---
    // These should represent tokens locked for SELL orders that were cancelled.
    // Move them back to the available balance *before* final payout.
    if (m.lockedYesTokens > 0) {
        m.yesTokens += m.lockedYesTokens;
        m.lockedYesTokens = 0;
    }
    if (m.lockedNoTokens > 0) {
        m.noTokens += m.lockedNoTokens;
        m.lockedNoTokens = 0;
    }
    // --- End Corrected Handling ---


    // --- IMPORTANT ASSUMPTION REMAINS ---
    // At this point, m.lockedCollateralYes/m.lockedCollateralNo ONLY represent collateral
    // held against *filled* short positions awaiting outcome.

    // 2. Apply final outcome payout and collateral handling
    if (outcome === "YES") {
      // Pay $1 per winning YES token (now includes previously locked ones)
      ub.availableUSD += m.yesTokens;
      // Refund collateral for winning SELL NO shorts (if any collateral remains locked)
      ub.availableUSD += m.lockedCollateralNo;
      // Collateral for losing SELL YES shorts (m.lockedCollateralYes) is forfeited (not added back).
    } else { // outcome === "NO"
      // Pay $1 per winning NO token (now includes previously locked ones)
      ub.availableUSD += m.noTokens;
      // Refund collateral for winning SELL YES shorts (if any collateral remains locked)
      ub.availableUSD += m.lockedCollateralYes;
      // Collateral for losing SELL NO shorts (m.lockedCollateralNo) is forfeited (not added back).
    }

    // 3. Reset all market-specific balances and locks for this user
    m.yesTokens = 0;
    m.noTokens = 0;
    m.lockedYesTokens = 0; // Should already be 0, reset for safety
    m.lockedNoTokens = 0;  // Should already be 0, reset for safety
    m.lockedCollateralYes = 0;
    m.lockedCollateralNo = 0;

    // Mark market subdocument as modified and add save to promises
    ub.markModified('markets');
    userBalanceUpdatePromises.push(ub.save());
  }

  // Wait for all user balances to be updated
  await Promise.all(userBalanceUpdatePromises);
  console.log(`[Settlement ${marketId}] Updated final balances for participating users.`);

  // --- Update Market Status ---
  market.outcome = outcome;
  market.settled = true;
  await market.save();
  console.log(`[Settlement ${marketId}] Market marked as settled with outcome: ${outcome}.`);
}
