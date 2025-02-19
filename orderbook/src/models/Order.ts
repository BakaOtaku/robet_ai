import { Schema, model, Document } from "mongoose";

export type OrderSide = "BUY" | "SELL";
export type OrderTokenType = "YES" | "NO";

export interface IOrder extends Document {
  orderId: string;
  marketId: string;
  userId: string;        // e.g. Solana pubkey
  side: OrderSide;       // BUY or SELL (for the YES token)
  tokenType: OrderTokenType;
  price: number;         // 0 <= price <= 1
  quantity: number;      // shares
  filledQuantity: number;
  status: "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED";
  createdAt: Date;
}

const OrderSchema = new Schema<IOrder>({
  orderId: { type: String, required: true, unique: true },
  marketId: { type: String, required: true },
  userId: { type: String, required: true },
  side: { type: String, enum: ["BUY", "SELL"], required: true },
  tokenType: { type: String, enum: ["YES", "NO"], default: "YES" },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  filledQuantity: { type: Number, default: 0 },
  status: { type: String, default: "OPEN" },
  createdAt: { type: Date, default: Date.now }
});

export const Order = model<IOrder>("Order", OrderSchema);
