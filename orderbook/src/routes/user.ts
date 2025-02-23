import { Router } from "express";
import { UserBalance } from "../models/UserBalance";

const userRouter = Router();


/**
 * GET /api/users/:userId
 * Retrieve a user's balance.
 * The chainId should be provided as a query parameter (e.g. ?chainId=solana).
 */
userRouter.get("/:userId", async (req: any, res: any) => {
  try {
    const { userId } = req.params;
    const { chainId } = req.query;
    
    if (!chainId) {
      return res.status(400).json({ success: false, error: "chainId query parameter is required" });
    }
    
    const userBalance = await UserBalance.findOne({ userId, chainId });
    if (!userBalance) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    return res.json({ success: true, balance: userBalance });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/users/deposit
 * Deposit funds into a given user's available balance.
 * If the user does not exist, a new user is created with the deposited amount.
 * Expected request body: { userId, chainId, amount }
 */
userRouter.post("/deposit", async (req: any, res: any) => {
  try {
    const { userId, chainId, amount } = req.body;
    
    if (!userId || !chainId || amount === undefined) {
      return res.status(400).json({ success: false, error: "userId, chainId, and amount are required" });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ success: false, error: "Deposit amount must be greater than 0" });
    }
    
    let userBalance = await UserBalance.findOne({ userId, chainId });
    if (!userBalance) {
      // Create a new user record if one does not exist
      userBalance = await UserBalance.create({
        userId,
        chainId,
        availableUSD: amount,
        markets: []
      });
    } else {
      // Add deposit amount to the existing user's available funds
      userBalance.availableUSD += amount;
      await userBalance.save();
    }
    
    return res.json({ success: true, balance: userBalance });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/users/withdraw
 * Withdraw funds from a user's available balance.
 * Expected request body: { userId, chainId, amount }
 */
userRouter.post("/withdraw", async (req: any, res: any) => {
  try {
    const { userId, chainId, amount } = req.body;
    
    if (!userId || !chainId || amount === undefined) {
      return res.status(400).json({ success: false, error: "userId, chainId, and amount are required" });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ success: false, error: "Withdrawal amount must be greater than 0" });
    }
    
    const userBalance = await UserBalance.findOne({ userId, chainId });
    if (!userBalance) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    
    if (userBalance.availableUSD < amount) {
      return res.status(400).json({ success: false, error: "Insufficient funds" });
    }
    
    userBalance.availableUSD -= amount;
    await userBalance.save();
    
    return res.json({ success: true, balance: userBalance });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default userRouter; 