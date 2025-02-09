// routes/order.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { Order } from "../models/Order";
import { UserBalance } from "../models/UserBalance";
import { matchOrders } from "../services/matchingEngine";

const orderRouter = Router();

// POST /api/order
orderRouter.post("/", async (req: any, res: any) => {
  try {
    const { marketId, userId, side, price, quantity } = req.body;

    // Basic checks
    if (price < 0 || price > 1) {
      return res.status(400).json({ success: false, error: "Price must be between 0 and 1." });
    }
    if (quantity <= 0) {
      return res.status(400).json({ success: false, error: "Quantity must be > 0." });
    }

    // Load user balance
    const userBalance = await UserBalance.findOne({ userId });
    if (!userBalance) {
      return res.status(400).json({ success: false, error: "User not found." });
    }

    // Attempt to find or create userMarketBalance record for this market
    let marketBalance = userBalance.markets.find(m => m.marketId === marketId);
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
      // No immediate collateral lock needed here. 
      // Collateral usage is determined during matching (the buyer pays if matched).
      // But we can do a check that userBalance.availableUSD >= possible cost
      // We'll do a deeper check in the matching function (partial fills, etc.)
    } else {
      // side === "SELL" => user is selling "Yes" tokens
      // 1) Check how many tokens user already owns
      // 2) If quantity > ownedYes, user is shorting the difference
      const ownedYes = marketBalance.yesTokens;
      if (quantity > ownedYes) {
        const shortAmount = quantity - ownedYes;
        // We need $1 * shortAmount collateral
        const requiredCollateral = shortAmount;
        if (userBalance.availableUSD < requiredCollateral) {
          return res.status(400).json({
            success: false,
            error: `Insufficient funds to short ${shortAmount} shares. Need $${requiredCollateral}.`
          });
        }
        // Lock it
        userBalance.availableUSD -= requiredCollateral;
        marketBalance.lockedCollateral += requiredCollateral;
      }
      // If quantity <= ownedYes, no additional collateral is needed 
      // (user is just selling existing tokens).
    }

    // Save userBalance updates
    await userBalance.save();

    // Create a new order
    const orderId = uuidv4();
    const newOrder = await Order.create({
      orderId,
      marketId,
      userId,
      side,
      price,
      quantity,
      filledQuantity: 0,
      status: "OPEN"
    });

    // Attempt to match
    await matchOrders(newOrder);

    return res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

export default orderRouter;
