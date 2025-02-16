// src/index.ts
import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";

// Import API routes
import marketRouter from "./routes/market";
import orderRouter from "./routes/order";
import userRouter from "./routes/user";
import "dotenv/config";

// Configure dotenv before using environment variables
dotenv.config({ path: '../.env' });

export const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());
// Routes
app.use("/api/market", marketRouter);
app.use("/api/order", orderRouter);
app.use("/api/users", userRouter);

console.log('MONGOURI IS ',process.env.MONGO_URI);
// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI!, {
  retryWrites: true,
  ssl: true,
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// Start server
export const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
