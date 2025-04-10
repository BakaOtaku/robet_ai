import { Schema, model, Document } from "mongoose";

/**
 * Tracks a user's off-chain positions per market.
 * We now record separate collateral amounts for short-selling YES vs. NO,
 * and also lock tokens when selling owned inventory.
 */
export interface IUserMarketBalance {
  marketId: string;
  yesTokens: number;  // number of YES tokens held (available)
  noTokens: number;   // number of NO tokens held (available)
  lockedYesTokens: number; // YES tokens locked in open SELL orders
  lockedNoTokens: number;  // NO tokens locked in open SELL orders
  lockedCollateralYes: number; // collateral locked for short-selling YES tokens
  lockedCollateralNo: number;  // collateral locked for short-selling NO tokens
}

export interface IUserBalance extends Document {
  userId: string;       // e.g. wallet address
  chainId: string;      // blockchain identifier
  availableUSD: number; // funds that can be immediately used
  markets: IUserMarketBalance[];    // per-market positions and collateral
}

const UserMarketBalanceSchema = new Schema<IUserMarketBalance>({
  marketId: { type: String, required: true },
  yesTokens: { type: Number, default: 0 },
  noTokens: { type: Number, default: 0 },
  lockedYesTokens: { type: Number, default: 0 }, // Added
  lockedNoTokens: { type: Number, default: 0 }, // Added
  lockedCollateralYes: { type: Number, default: 0 },
  lockedCollateralNo: { type: Number, default: 0 },
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
