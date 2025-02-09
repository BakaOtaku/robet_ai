import { Router } from "express";
import { UserBalance } from "../models/UserBalance";

const userRouter = Router();

// POST /api/users - Create a new user with initial balance
userRouter.post("/", async (req: any, res: any) => {
  try {
    const { userId, initialUSD } = req.body;
    
    const newUser = await UserBalance.create({
      userId,
      availableUSD: initialUSD,
      markets: []
    });

    return res.json({ success: true, user: newUser });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

// GET /api/users/:userId - Get user balance
userRouter.get("/:userId", async (req: any, res: any) => {
  try {
    const userBalance = await UserBalance.findOne({ userId: req.params.userId });
    if (!userBalance) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    return res.json({ success: true, balance: userBalance });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error });
  }
});

export default userRouter; 