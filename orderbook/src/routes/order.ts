// routes/order.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { Order, OrderTokenType } from "../models/Order";
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
    let marketBalance = userBalance.markets.find((m) => m.marketId === marketId);
    if (!marketBalance) {
      marketBalance = {
        marketId,
        yesTokens: 0,
        noTokens: 0,
        lockedCollateralYes: 0,
        lockedCollateralNo: 0,
      };
      userBalance.markets.push(marketBalance);
    }

    // For SELL orders, enforce collateral if the seller does not hold enough tokens.
    if (side === "SELL") {
      if (tokenType === "YES") {
        const ownedYes = marketBalance.yesTokens;
        if (quantity > ownedYes) {
          const shortAmount = quantity - ownedYes;
          const requiredCollateral = shortAmount; // $1 per shorted YES share
          if (userBalance.availableUSD < requiredCollateral) {
            return res.status(400).json({
              success: false,
              error: `Insufficient funds for short-selling YES tokens. Requires $${requiredCollateral} collateral.`,
            });
          }
          userBalance.availableUSD -= requiredCollateral;
          marketBalance.lockedCollateralYes += requiredCollateral;
        }
      } else if (tokenType === "NO") {
        const ownedNo = marketBalance.noTokens;
        if (quantity > ownedNo) {
          const shortAmount = quantity - ownedNo;
          const requiredCollateral = shortAmount; // $1 per shorted NO share
          if (userBalance.availableUSD < requiredCollateral) {
            return res.status(400).json({
              success: false,
              error: `Insufficient funds for short-selling NO tokens. Requires $${requiredCollateral} collateral.`,
            });
          }
          userBalance.availableUSD -= requiredCollateral;
          marketBalance.lockedCollateralNo += requiredCollateral;
        }
      }
    }
    
    // (For BUY orders, the buyer's available funds will be checked during trade execution.)

    // Save any user balance updates due to collateral locking before order creation.
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
    console.log("newOrder", newOrder);

    // Attempt to match the order.
    await matchOrders(newOrder);
    console.log("newOrder after matching", newOrder);

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

export default orderRouter;
