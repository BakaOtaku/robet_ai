// services/settlementService.ts
import { Market } from "../models/Market";
import { UserBalance } from "../models/UserBalance";

export async function settleMarket(marketId: string, outcome: "YES" | "NO") {
  const market = await Market.findOne({ marketId });
  if (!market) throw new Error("Market not found");

  // Loop over all UserBalances to settle market positions.
  const allUsers = await UserBalance.find({});
  for (const ub of allUsers) {
    const m = ub.markets.find(x => x.marketId === marketId);
    if (!m) continue; // no participation

    if (outcome === "YES") {
      // Holders of YES tokens receive $1 each.
      ub.availableUSD += m.yesTokens;
      // Refund collateral from SELL NO orders.
      ub.availableUSD += m.lockedCollateralNo;
      // Collateral from SELL YES orders is forfeited.
      
      // Reset market-specific tokens and collateral.
      m.yesTokens = 0;
      m.noTokens = 0;
      m.lockedCollateralYes = 0;
      m.lockedCollateralNo = 0;
    } else {
      // outcome === "NO"
      ub.availableUSD += m.noTokens;
      // Refund collateral from SELL YES orders.
      ub.availableUSD += m.lockedCollateralYes;
      // Collateral from SELL NO orders is forfeited.
      m.yesTokens = 0;
      m.noTokens = 0;
      m.lockedCollateralYes = 0;
      m.lockedCollateralNo = 0;
    }
    
    await ub.save();
  }

  market.outcome = outcome;
  market.settled = true;
  await market.save();
}
