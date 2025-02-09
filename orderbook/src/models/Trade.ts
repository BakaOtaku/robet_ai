import { Schema, model, Document } from "mongoose";

export interface ITrade extends Document {
  tradeId: string;
  marketId: string;
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
  executedAt: Date;
}

const TradeSchema = new Schema<ITrade>({
  tradeId: { type: String, required: true, unique: true },
  marketId: { type: String, required: true },
  buyOrderId: { type: String, required: true },
  sellOrderId: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  executedAt: { type: Date, default: Date.now }
});

export const Trade = model<ITrade>("Trade", TradeSchema);
