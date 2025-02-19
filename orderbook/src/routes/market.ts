// routes/market.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { Market } from "../models/Market";
import { Trade } from "../models/Trade";
import { settleMarket } from "../services/settlementService";

const marketRouter = Router();

// POST /api/market
marketRouter.post("/", async (req: any, res: any) => {
  try {
    const { question, creator, resolutionDate } = req.body;
    const marketId = uuidv4();

    const newMarket = await Market.create({
      marketId,
      question,
      creator,
      resolutionDate,
    });

    return res.json({ success: true, market: newMarket });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

// GET /api/trades - Get trades for a market
marketRouter.get("/trades", async (req: any, res: any) => {
  try {
    const { marketId } = req.query;
    if (!marketId) {
      return res.status(400).json({ success: false, error: "marketId is required" });
    }

    // Query the Trade model for trades with this marketId
    const trades = await Trade.find({ marketId });
    return res.json({ success: true, trades });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

// GET /api/market/active - Get all active markets
marketRouter.get("/active", async (req: any, res: any) => {
  try {
    // Query the Market model for markets that are not settled
    const activeMarkets = await Market.find({ settled: false });
    return res.json({ success: true, markets: activeMarkets });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

// POST /api/settle - Settle a market
marketRouter.post("/settle", async (req: any, res: any) => {
  try {
    const { marketId, outcome } = req.body;
    if (!marketId || !outcome) {
      return res.status(400).json({ success: false, error: "marketId and outcome are required" });
    }

    const market = await Market.findOne({ marketId });
    if (!market) {
      return res.status(404).json({ success: false, error: "Market not found" });
    }

    // Call the settlement service to update the market and user balances.
    await settleMarket(marketId, outcome);

    // Re-fetch the updated market from the database.
    const updatedMarket = await Market.findOne({ marketId });

    return res.json({ success: true, market: updatedMarket });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

// GET /api/market/:marketId - Get a specific market by marketId
marketRouter.get("/:marketId", async (req: any, res: any) => {
  try {
    const { marketId } = req.params;
    const market = await Market.findOne({ marketId });

    if (!market) {
      return res.status(404).json({ success: false, error: "Market not found" });
    }

    return res.json({ success: true, market });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

export default marketRouter;
