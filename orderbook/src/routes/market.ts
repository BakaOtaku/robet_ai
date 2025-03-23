// routes/market.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { Market } from "../models/Market";
import { Trade } from "../models/Trade";
import { Order } from "../models/Order";
import { UserBalance } from "../models/UserBalance";
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
    const { marketId, tokenType } = req.query;
    if (!marketId) {
      return res.status(400).json({ success: false, error: "marketId is required" });
    }

    // Build query with optional tokenType filter
    const query: any = { marketId };
    if (tokenType && (tokenType === 'YES' || tokenType === 'NO')) {
      query.tokenType = tokenType;
    }

    // Query the Trade model with filters
    const trades = await Trade.find(query).sort({ executedAt: -1 });
    return res.json({ success: true, trades });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

// GET /api/market/all - Get all markets with platform statistics
marketRouter.get("/all", async (req: any, res: any) => {
  try {
    // Query the Market model for all markets
    const allMarkets = await Market.find();
    
    // Get platform statistics
    const uniqueUsers = await UserBalance.distinct('userId');
    const totalUniqueUsers = uniqueUsers.length;
    
    const activeEvents = await Market.countDocuments({ settled: false });
    
    const totalOrders = await Order.countDocuments();
    
    // Get the latest trade for each market to calculate price percentage
    const marketsWithData = await Promise.all(
      allMarkets.map(async (market) => {
        // Find the most recent YES trade for this market
        const latestYesTrade = await Trade.findOne({ 
          marketId: market.marketId,
          tokenType: "YES" 
        }).sort({ executedAt: -1 }).limit(1);
        
        // Find the most recent NO trade for this market
        const latestNoTrade = await Trade.findOne({ 
          marketId: market.marketId,
          tokenType: "NO" 
        }).sort({ executedAt: -1 }).limit(1);
        
        // Calculate price percentages based on the latest trades or default to 50%
        const yesPricePercentage = latestYesTrade ? Math.round(latestYesTrade.price * 100) : 50;
        const noPricePercentage = latestNoTrade ? Math.round(latestNoTrade.price * 100) : 50;
        
        // Count total trades for this market
        const totalTrades = await Trade.countDocuments({ marketId: market.marketId });
        
        // Return market data with percentage
        return {
          ...market.toObject(),
          yesPricePercentage,
          noPricePercentage,
          totalTrades
        };
      })
    );
    
    return res.json({
      success: true,
      statistics: {
        totalUniqueUsers,
        activeEvents,
        totalOrders
      },
      markets: marketsWithData
    });
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
