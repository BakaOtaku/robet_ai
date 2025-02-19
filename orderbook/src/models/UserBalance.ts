import { Schema, model, Document } from "mongoose";

/**
 * Tracks a user's off-chain "Yes" / "No" tokens for each market,
 * plus how much collateral they've locked for short positions.
 *
 * In a real Solana integration, these might be on-chain token accounts;
 * here we keep a simplified off-chain record for demonstration.
 */
export interface IUserMarketBalance {
  marketId: string;
  yesTokens: number;  // how many Yes tokens the user holds for that market
  noTokens: number;   // how many No tokens the user holds
  lockedCollateral: number; // how much $ is locked for short positions in that market
}

export interface IUserBalance extends Document {
  userId: string;       // e.g. wallet address (Solana/EVM/Cosmos)
  chainId: string;      // blockchain identifier (solana, evm, cosmos, etc)
  availableUSD: number; // how much $ the user can freely use
  markets: IUserMarketBalance[];    // array of per-market balances
}

const UserMarketBalanceSchema = new Schema<IUserMarketBalance>({
  marketId: { type: String, required: true },
  yesTokens: { type: Number, default: 0 },
  noTokens: { type: Number, default: 0 },
  lockedCollateral: { type: Number, default: 0 },
}, { _id: false });

const UserBalanceSchema = new Schema<IUserBalance>({
  userId: { type: String, required: true },
  chainId: { type: String, required: true },
  availableUSD: { type: Number, default: 0 },
  markets: { type: [UserMarketBalanceSchema], default: [] },
});

// Composite unique index so that a wallet address on a given chain is unique.
UserBalanceSchema.index({ userId: 1, chainId: 1 }, { unique: true });

export const UserBalance = model<IUserBalance>("UserBalance", UserBalanceSchema);
