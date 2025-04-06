// routes/order.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { IOrder, Order, OrderTokenType } from "../models/Order";
import { UserBalance } from "../models/UserBalance";
import { matchOrders } from "../services/matchingEngine";
import { verifySignature } from "../middleware/verifySignature";

const orderRouter = Router();

/**
 * POST /api/order – Limit order endpoint for all 4 actions.
 */
orderRouter.post("/", verifySignature, async (req: any, res: any) => {
  try {
    let { marketId, userId, side, price, quantity } = req.body;
    const tokenType: OrderTokenType = req.body.tokenType || "YES";

    userId = userId.toLowerCase();

    if (price < 0 || price > 1) {
      return res
        .status(400)
        .json({ success: false, error: "Price must be between 0 and 1." });
    }
    if (quantity <= 0) {
      return res
        .status(400)
        .json({ success: false, error: "Quantity must be > 0." });
    }

    // Load user balance and per-market record
    const userBalance = await UserBalance.findOne({ userId });
    if (!userBalance) {
      return res.status(400).json({ success: false, error: "User not found." });
    }
    // Find the index of the market balance, or add a new one if not found
    let marketBalanceIndex = userBalance.markets.findIndex((m) => m.marketId === marketId);
    if (marketBalanceIndex === -1) {
      const newMarketBalance = {
        marketId,
        yesTokens: 0,
        noTokens: 0,
        lockedCollateralYes: 0,
        lockedCollateralNo: 0,
        lockedYesTokens: 0,
        lockedNoTokens: 0,
      };
      userBalance.markets.push(newMarketBalance);
      marketBalanceIndex = userBalance.markets.length - 1; // Index of the newly added market
    }

    // --- Fund Locking Logic ---
    if (side === "BUY") {
      const requiredFunds = price * quantity;
      if (userBalance.availableUSD < requiredFunds) {
        return res.status(400).json({
          success: false,
          error: `Insufficient funds for BUY order. Requires $${requiredFunds.toFixed(2)}, available: $${userBalance.availableUSD.toFixed(2)}. `,
        });
      }
      // Deduct funds at order placement
      userBalance.availableUSD -= requiredFunds;
      // TODO: Add a mechanism to track these locked funds (e.g., a new field `lockedUSD`)
      //       and release them upon order cancellation/completion.
      console.log(`BUY Order: Locking $${requiredFunds.toFixed(2)} from user ${userId}. New available USD: $${userBalance.availableUSD.toFixed(2)}`);

    } else if (side === "SELL") {
      // Use the index to access the market balance object directly
      const currentMarketBalance = userBalance.markets[marketBalanceIndex];

      // Logic for locking assets for SELL orders
      if (tokenType === "YES") {
        const ownedYes = currentMarketBalance.yesTokens;
        if (quantity <= ownedYes) {
          // Lock existing YES tokens
          currentMarketBalance.yesTokens -= quantity;
          currentMarketBalance.lockedYesTokens = (currentMarketBalance.lockedYesTokens || 0) + quantity; // Initialize if undefined
        } else {
          // Lock collateral for short selling YES tokens
          const shortAmount = quantity - ownedYes; // Amount to short
          const requiredCollateral = shortAmount; // $1 per shorted YES share
          if (userBalance.availableUSD < requiredCollateral) {
            return res.status(400).json({
              success: false,
              error: `Insufficient funds for short-selling YES tokens. Requires $${requiredCollateral} collateral, available: $${userBalance.availableUSD.toFixed(2)}.`,
            });
          }
          // Lock owned tokens first, if any
          if (ownedYes > 0) {
             currentMarketBalance.yesTokens -= ownedYes;
             currentMarketBalance.lockedYesTokens = (currentMarketBalance.lockedYesTokens || 0) + ownedYes;
          }
          // Lock collateral for the short portion
          userBalance.availableUSD -= requiredCollateral;
          currentMarketBalance.lockedCollateralYes = (currentMarketBalance.lockedCollateralYes || 0) + requiredCollateral; // Initialize if undefined
        }
      } else if (tokenType === "NO") {
        const ownedNo = currentMarketBalance.noTokens;
        if (quantity <= ownedNo) {
          // Lock existing NO tokens
          currentMarketBalance.noTokens -= quantity;
          currentMarketBalance.lockedNoTokens = (currentMarketBalance.lockedNoTokens || 0) + quantity; // Initialize if undefined
        } else {
          // Lock collateral for short selling NO tokens
          const shortAmount = quantity - ownedNo; // Amount to short
          const requiredCollateral = shortAmount; // $1 per shorted NO share
          if (userBalance.availableUSD < requiredCollateral) {
            return res.status(400).json({
              success: false,
              error: `Insufficient funds for short-selling NO tokens. Requires $${requiredCollateral} collateral, available: $${userBalance.availableUSD.toFixed(2)}.`,
            });
          }
          // Lock owned tokens first, if any
          if (ownedNo > 0) {
             currentMarketBalance.noTokens -= ownedNo;
             currentMarketBalance.lockedNoTokens = (currentMarketBalance.lockedNoTokens || 0) + ownedNo;
          }
           // Lock collateral for the short portion
          userBalance.availableUSD -= requiredCollateral;
          currentMarketBalance.lockedCollateralNo = (currentMarketBalance.lockedCollateralNo || 0) + requiredCollateral; // Initialize if undefined
        }
      }
    }
    userBalance.markModified('markets');
    // Save user balance updates (fund/collateral/token locking)
    await userBalance.save();


    // Create the limit order.
    const orderId = uuidv4();
    const newOrder = await Order.create({
      orderId,
      marketId,
      userId,
      side,
      tokenType,
      price,
      quantity,
      filledQuantity: 0,
      status: "OPEN",
    });

    // Attempt to match the order.
    await matchOrders(newOrder);

    return res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/order - Get orders for a market
orderRouter.get("/", async (req: any, res: any) => {
  try {
    const { marketId } = req.query;
    if (!marketId) {
      return res
        .status(400)
        .json({ success: false, error: "marketId is required" });
    }

    // Query the Order model for orders with this marketId
    const orders = await Order.find({
      marketId,
      status: { $in: ["OPEN", "PARTIAL"] }, // Only return active orders
    }).sort({ createdAt: -1 }); // Sort by newest first

    return res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

// GET /api/order/book - Get orderbook data by market and token type
orderRouter.get("/book", async (req: any, res: any) => {
  try {
    const { marketId, tokenType = "YES" } = req.query;
    
    if (!marketId) {
      return res
        .status(400)
        .json({ success: false, error: "marketId is required" });
    }
    
    if (tokenType !== "YES" && tokenType !== "NO") {
      return res
        .status(400)
        .json({ success: false, error: "tokenType must be YES or NO" });
    }

    // Find all active orders for this market and token type
    const orders = await Order.find({
      marketId,
      tokenType,
      status: { $in: ["OPEN", "PARTIAL"] }
    });

    // Separate into buy and sell orders
    const buyOrders = orders
      .filter(order => order.side === "BUY")
      .sort((a, b) => b.price - a.price); // Sort by price descending

    const sellOrders = orders
      .filter(order => order.side === "SELL")
      .sort((a, b) => a.price - b.price); // Sort by price ascending

    // Group orders by price level for the orderbook display
    const aggregatePriceLevels = (orders: IOrder[]) => {
      const priceLevels: Record<string, {
        price: number;
        totalQuantity: number;
        orders: number;
      }> = {};
      
      orders.forEach(order => {
        const price = order.price.toFixed(3);
        const remainingQuantity = order.quantity - order.filledQuantity;
        
        if (!priceLevels[price]) {
          priceLevels[price] = {
            price: parseFloat(price),
            totalQuantity: 0,
            orders: 0
          };
        }
        
        priceLevels[price].totalQuantity += remainingQuantity;
        priceLevels[price].orders += 1;
      });
      
      return Object.values(priceLevels);
    };

    // Get the spread if there are both buy and sell orders
    const getBestPrices = () => {
      const bestBid = buyOrders.length > 0 ? buyOrders[0].price : null;
      const bestAsk = sellOrders.length > 0 ? sellOrders[0].price : null;
      
      if (bestBid !== null && bestAsk !== null && bestBid > 0) {
        return {
          bestBid,
          bestAsk,
          spread: bestAsk - bestBid,
          spreadPercentage: ((bestAsk / bestBid) - 1) * 100
        };
      }
      
      return { bestBid, bestAsk, spread: null, spreadPercentage: null };
    };

    // Return structured orderbook data
    return res.json({
      success: true,
      marketId,
      tokenType,
      buyLevels: aggregatePriceLevels(buyOrders),
      sellLevels: aggregatePriceLevels(sellOrders),
      ...getBestPrices()
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

export default orderRouter;
