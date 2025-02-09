import mongoose from "mongoose";

export interface IMarket extends mongoose.Document {
  marketId: string;            // Unique ID
  question: string;            // e.g., "Will Candidate X win?"
  creator: string;             // user who created the market
  createdAt: Date;
  resolutionDate: Date;        // when outcome is known
  trades: {
    tradeId: string;
    buyOrderId: string;
    sellOrderId: string;
    price: number;
    quantity: number;
    timestamp: Date;
  }[];
  outcome?: "YES" | "NO" | null; // final outcome
  settled: boolean;
}

const marketSchema = new mongoose.Schema<IMarket>({
  marketId: { type: String, required: true, unique: true },
  question: { type: String, required: true },
  creator: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  resolutionDate: { type: Date, required: true },
  trades: [{ 
    tradeId: String,
    buyOrderId: String,
    sellOrderId: String,
    price: Number,
    quantity: Number,
    timestamp: Date
  }],
  outcome: { type: String, enum: ['YES', 'NO'], default: null },
  settled: { type: Boolean, default: false }
});

export const Market = mongoose.model<IMarket>("Market", marketSchema);
