// routes/order.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { Order, OrderTokenType } from "../models/Order";
import { UserBalance } from "../models/UserBalance";
import { matchOrders } from "../services/matchingEngine";
import { verifySignature } from "../middleware/verifySignature";

const orderRouter = Router();

// POST /api/order - now includes signature verification middleware
orderRouter.post("/", verifySignature, async (req: any, res: any) => {
  try {
    // Read parameters including tokenType (defaults to "YES")
    let { marketId, userId, side, price, quantity } = req.body;
    const tokenType: OrderTokenType = req.body.tokenType || "YES";

    userId = userId.toLowerCase();

    // Basic checks
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

    // Load user balance
    const userBalance = await UserBalance.findOne({ userId });
    if (!userBalance) {
      return res.status(400).json({ success: false, error: "User not found." });
    }

    // Attempt to find or create userMarketBalance record for this market
    let marketBalance = userBalance.markets.find(
      (m) => m.marketId === marketId
    );
    if (!marketBalance) {
      // If user hasn't interacted with this market yet, create an entry
      marketBalance = {
        marketId,
        yesTokens: 0,
        noTokens: 0,
        lockedCollateral: 0,
      };
      userBalance.markets.push(marketBalance);
    }

    if (side === "BUY") {
      // For BUY orders, we could check that userBalance.availableUSD >= possible cost.
      // Detailed balance checks can be deferred until matching and execution.
    } else {
      // For SELL orders:
      if (tokenType === "YES") {
        // SELLing Yes‑Tokens: user may be shorting if they don't have enough yesTokens.
        const ownedYes = marketBalance.yesTokens;
        if (quantity > ownedYes) {
          const shortAmount = quantity - ownedYes;
          const requiredCollateral = shortAmount; // $1 per shorted token
          if (userBalance.availableUSD < requiredCollateral) {
            return res.status(400).json({
              success: false,
              error: `Insufficient funds to short ${shortAmount} tokens. Requires $${requiredCollateral}.`,
            });
          }
          // Lock collateral for short position.
          userBalance.availableUSD -= requiredCollateral;
          marketBalance.lockedCollateral += requiredCollateral;
        }
      } else if (tokenType === "NO") {
        // Secondary market sale of No‑Tokens: ensure the seller owns enough.
        if (marketBalance.noTokens < quantity) {
          return res.status(400).json({
            success: false,
            error: `Insufficient NO‑token balance to sell ${quantity} tokens.`,
          });
        }
      }
    }

    // Save userBalance updates (and collateral adjustments)
    await userBalance.save();

    // Create a new order including tokenType
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
    console.log("newOrder", newOrder);

    // Attempt to match the order
    await matchOrders(newOrder);

    console.log("newOrder", newOrder);

    return res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

// POST /api/order/market - Market order endpoint
orderRouter.post("/market", verifySignature, async (req: any, res: any) => {
  try {
    // Read parameters (no price needed for market orders)
    let { marketId, userId, side, quantity } = req.body;
    const tokenType: OrderTokenType = req.body.tokenType || "YES";

    userId = userId.toLowerCase();

    // Basic checks
    if (quantity <= 0) {
      return res
        .status(400)
        .json({ success: false, error: "Quantity must be > 0." });
    }

    // Load user balance
    const userBalance = await UserBalance.findOne({ userId });
    if (!userBalance) {
      return res.status(400).json({ success: false, error: "User not found." });
    }

    // Find or create userMarketBalance record for this market
    let marketBalance = userBalance.markets.find(
      (m) => m.marketId === marketId
    );
    if (!marketBalance) {
      marketBalance = {
        marketId,
        yesTokens: 0,
        noTokens: 0,
        lockedCollateral: 0,
      };
      userBalance.markets.push(marketBalance);
    }

    // Check if there's enough liquidity for the market order
    const oppositeSide = side === "BUY" ? "SELL" : "BUY";
    const sortOption = side === "BUY" ? { price: 1 as 1 } : { price: -1 as -1 };
    
    const availableOrders = await Order.find({
      marketId,
      side: oppositeSide,
      tokenType,
      status: { $in: ["OPEN", "PARTIAL"] }
    }).sort(sortOption);

    // Calculate total available liquidity
    let availableLiquidity = 0;
    for (const order of availableOrders) {
      availableLiquidity += (order.quantity - order.filledQuantity);
    }

    let remainingForLimitOrder = 0;
    let marketOrderQty = quantity;
    let limitOrderPrice = null;

    if (availableLiquidity < quantity) {
      // Set up quantities for market and limit portions
      marketOrderQty = availableLiquidity;
      remainingForLimitOrder = quantity - availableLiquidity;
      
      // For limit order, use last filled price or default to market extremes
      limitOrderPrice = availableOrders.length > 0 ? 
        availableOrders[availableOrders.length - 1].price : 
        (side === "BUY" ? 0.5 : 0.5); // Default to 0.5 if no orders
    }

    // For SELL orders, check token availability or setup collateral for shorting
    if (side === "SELL") {
      if (tokenType === "YES") {
        // Selling Yes-Tokens: may require shorting
        const ownedYes = marketBalance.yesTokens;
        if (quantity > ownedYes) {
          const shortAmount = quantity - ownedYes;
          const requiredCollateral = shortAmount; // $1 per shorted token
          if (userBalance.availableUSD < requiredCollateral) {
            return res.status(400).json({
              success: false,
              error: `Insufficient funds to short ${shortAmount} tokens. Requires $${requiredCollateral}.`,
            });
          }
          // Lock collateral for short position
          userBalance.availableUSD -= requiredCollateral;
          marketBalance.lockedCollateral += requiredCollateral;
        }
      } else if (tokenType === "NO") {
        // Secondary market sale of No-Tokens
        if (marketBalance.noTokens < quantity) {
          return res.status(400).json({
            success: false,
            error: `Insufficient NO-token balance to sell ${quantity} tokens.`,
          });
        }
      }
    } else if (side === "BUY") {
      // For BUY orders, calculate the maximum possible cost and check balance
      let estimatedMaxCost = 0;
      let remainingQty = quantity;
      
      for (const order of availableOrders) {
        const fillQty = Math.min(remainingQty, order.quantity - order.filledQuantity);
        estimatedMaxCost += fillQty * order.price;
        remainingQty -= fillQty;
        
        if (remainingQty <= 0) break;
      }
      
      if (userBalance.availableUSD < estimatedMaxCost) {
        return res.status(400).json({
          success: false,
          error: `Insufficient funds. Maximum estimated cost: $${estimatedMaxCost.toFixed(2)}`
        });
      }
    }

    // Save user balance updates
    await userBalance.save();

    // Create a market order for the available liquidity
    let marketOrderResult = null;
    if (marketOrderQty > 0) {
      const orderId = uuidv4();
      const marketPrice = side === "BUY" ? 1 : 0;
      const newOrder = await Order.create({
        orderId,
        marketId,
        userId,
        side,
        tokenType,
        price: marketPrice,
        quantity: marketOrderQty,
        filledQuantity: 0,
        status: "OPEN",
      });

      // Execute the market order immediately
      await matchOrders(newOrder);
      marketOrderResult = newOrder;
    }

    // Create a limit order for any remaining quantity
    let limitOrderResult = null;
    if (remainingForLimitOrder > 0 && limitOrderPrice !== null) {
      const limitOrderId = uuidv4();
      const limitOrder = await Order.create({
        orderId: limitOrderId,
        marketId,
        userId,
        side,
        tokenType,
        price: limitOrderPrice,
        quantity: remainingForLimitOrder,
        filledQuantity: 0,
        status: "OPEN",
      });
      
      // Try to match the limit order (it may or may not fill)
      await matchOrders(limitOrder);
      limitOrderResult = limitOrder;
    }

    return res.json({ 
      success: true, 
      marketOrder: marketOrderResult, 
      limitOrder: limitOrderResult,
      message: remainingForLimitOrder > 0 ? 
        `Partially filled as market order (${marketOrderQty}), remainder (${remainingForLimitOrder}) placed as limit order.` : 
        "Fully executed as market order."
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
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

export default orderRouter;
