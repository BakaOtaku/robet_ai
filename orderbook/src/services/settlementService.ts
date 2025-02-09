// services/settlementService.ts
import { Market } from "../models/Market";
import { UserBalance } from "../models/UserBalance";

export async function settleMarket(marketId: string, outcome: "YES" | "NO") {
  const market = await Market.findOne({ marketId });
  if (!market) throw new Error("Market not found");


  // We loop over all UserBalances:
  const allUsers = await UserBalance.find({});
  for (const ub of allUsers) {
    console.log("ub", ub);
    const m = ub.markets.find(x => x.marketId === marketId);
    if (!m) continue; // user has no position in this market

    if (outcome === "YES") {
      // user’s yesTokens are each worth $1
      ub.availableUSD += m.yesTokens;
      // The lockedCollateral from short-sellers is effectively transferred to these yesToken holders
      // That means we reduce lockedCollateral for short-sellers. 
      // We just set lockedCollateral = 0 here, but in a real system, you'd track how it's distributed exactly.
      m.yesTokens = 0; 
      m.noTokens = 0; 
      m.lockedCollateral = 0; 
    } else {
      // outcome === "NO"
      // user’s noTokens are each worth $1
      ub.availableUSD += m.noTokens;
      m.yesTokens = 0;
      m.noTokens = 0;
      m.lockedCollateral = 0;
    }

    await ub.save();
  }

  market.outcome = outcome;
  market.settled = true;
  await market.save();
}
