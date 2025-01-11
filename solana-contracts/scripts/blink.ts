import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { Program } from "@coral-xyz/anchor";

import anchor from "@coral-xyz/anchor";
const { PublicKey, Connection, clusterApiUrl, Transaction } = anchor.web3;
const { Keypair } = anchor.web3;

import fs from "fs";
import path from "path";
import { Game } from "../target/types/game";

// -----------------------------------------------------------------------------
// 1) Load IDL + create an Anchor Program instance
// -----------------------------------------------------------------------------
const IDL_PATH = path.join(__dirname, "./game.json");
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));

// Replace with your real program ID:
// const PROGRAM_ID = new PublicKey(
//   "8iMWoGnfjJHCGoYiVF176cQm1SkZVrX2V39RavfED8eX"
// );

// Minimal provider that doesn't sign on the server
const connection = new Connection(clusterApiUrl("devnet"));
const dummyKeypair = Keypair.generate();
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(dummyKeypair),
  { preflightCommitment: "processed" }
);

const program = new Program(idl, provider) as Program<Game>;

// -----------------------------------------------------------------------------
// 2) Express Setup
// -----------------------------------------------------------------------------
const app = express();
app.use(
  cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization", "Accept-Encoding"],
    methods: ["GET", "POST", "PUT", "OPTIONS"],
  })
);
app.use(bodyParser.json());

// Add this middleware to set common headers for all responses
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Action-Version", "2.1.3");
  res.setHeader("X-Blockchain-Ids", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
  next();
});

// -----------------------------------------------------------------------------
// 3) CREATE BID ENDPOINTS
// -----------------------------------------------------------------------------

app.get("/create-bid", async (req, res) => {
  try {
    const actionMetadata = {
      type: "action",
      icon: "https://github.com/user-attachments/assets/6a5fd3c0-8e9c-4cfe-9d85-bcf177b2b4ba",
      title: "🎲 Create Prediction Market",
      description:
        "Create a new prediction market where users can bet with SOL.",
      label: "Create Market",
      links: {
        actions: [
          {
            label: "📝 Create Prediction",
            href: `/create-bid?bidId={bidId}&bidContent={bidContent}`,
            style: {
              primary: true,
              color: "#14F195",
            },
            parameters: [
              {
                name: "bidId",
                label: "🔑 Market ID",
                placeholder: "e.g., sol-100-eoy",
                required: true,
              },
              {
                name: "bidContent",
                label: "❓ Prediction Question",
                placeholder: "e.g., Will SOL reach $100 by end of year?",
                required: true,
                multiline: true,
                rows: 2,
              },
            ],
          },
        ],
      },
    };
    res.status(200).json(actionMetadata);
  } catch (error) {
    res.status(500).json({
      error: `GET /create-bid Error: ${error.message}`,
    });
  }
});

app.post("/create-bid", async (req, res) => {
  try {
    const { account } = req.body;
    const { bidId, bidContent } = req.query;

    if (!account || !bidId || !bidContent) {
      return res.status(400).json({
        message: "Missing fields: account, bidId, bidContent",
      });
    }

    const [bidPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId as string)],
      program.programId
    );

    const ix = await program.methods
      .createBid(bidId as string, bidContent as string)
      .accountsStrict({
        bid: bidPda,
        creator: new PublicKey(account),
        systemProgram: PublicKey.default,
      })
      .instruction();

    const userPubkey = new PublicKey(account);
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: userPubkey,
      recentBlockhash: blockhash,
    });
    transaction.add(ix);

    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = serializedTx.toString("base64");

    res.status(200).json({
      transaction: base64Tx,
      message: `Creating prediction market: "${bidContent}"`,
    });
  } catch (error) {
    res.status(500).json({
      error: `POST /create-bid Error: ${error.message}`,
    });
  }
});

// -----------------------------------------------------------------------------
// 4) PLACE BID ENDPOINTS
// -----------------------------------------------------------------------------

// GET /bid - Return blink metadata for an existing bid, plus "Yes"/"No" actions
app.get("/bid", async (req, res) => {
  try {
    const { bidId } = req.query;
    if (!bidId) {
      return res.status(400).json({ message: "Missing ?bidId=..." });
    }

    // Derive the PDA & fetch the bid info
    const [bidPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId as string)],
      program.programId
    );

    let bidAccount;
    try {
      bidAccount = await program.account.bid.fetch(bidPda);
    } catch (fetchErr) {
      return res.status(404).json({ message: "Prediction market not found" });
    }

    // Format numbers
    const yesVotes = bidAccount.yesVotes
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const noVotes = bidAccount.noVotes
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const totalAmount = (
      Number(bidAccount.totalAmount) / 1_000_000_000
    ).toFixed(2);

    // Calculate total votes and percentages
    const totalVotes = Number(bidAccount.yesVotes) + Number(bidAccount.noVotes);
    const yesPercentage =
      totalVotes > 0
        ? ((Number(bidAccount.yesVotes) / totalVotes) * 100).toFixed(1)
        : "0";
    const noPercentage =
      totalVotes > 0
        ? ((Number(bidAccount.noVotes) / totalVotes) * 100).toFixed(1)
        : "0";

    const createdDate = new Date(
      bidAccount.createdAt * 1000
    ).toLocaleDateString();

    // Determine status & winner info
    let statusStr,
      winnerStr = "";
    let bettingInfo = "";

    if (typeof bidAccount.status.resolved === "object") {
      statusStr = "🔒 Resolved";
      const outcome = bidAccount.outcome ? "YES" : "NO";
      const reward = (
        Number(bidAccount.rewardPerWinner) / 1_000_000_000
      ).toFixed(2);
      winnerStr = `
🏆 Winning Side: ${outcome}\n
💰 Reward per winner: ${reward} SOL\n
📊 Total Pool: ${(Number(bidAccount.totalAmount) / 1_000_000_000).toFixed(
        2
      )} SOL`;
    } else {
      statusStr = "🟢 Open for Betting";
      bettingInfo = `
📊 **Current Stats**
━━━━━━━━━━━━━━━━━━━━━━
✅ Yes Bets: ${yesVotes} (${yesPercentage}%)\n
❌ No Bets: ${noVotes} (${noPercentage}%)\n
💰 Total Pool: ${totalAmount} SOL\n

ℹ️ Each bet costs 0.01 SOL
🎁 Winners split the total pool!
`;
    }

    const description = `
${winnerStr}
${bettingInfo}

━━━━━━━━━━━━━━━━━━━━━━

👤 Created by: ${bidAccount.creator
      .toString()
      .slice(0, 4)}...${bidAccount.creator.toString().slice(-4)}\n
📅 Created: ${createdDate}\n
🏷️ Status: ${statusStr}
    `.trim();

    const isOpen = typeof bidAccount.status.open === "object";
    let actions = [];

    if (isOpen) {
      actions = [
        {
          label: "✅ Bet Yes (0.01 SOL)",
          href: `/bid?bidId=${bidId}&vote=true`,
          style: {
            primary: true,
            color: "#14F195",
          },
        },
        {
          label: "❌ Bet No (0.01 SOL)",
          href: `/bid?bidId=${bidId}&vote=false`,
          style: {
            color: "#FF3B3B",
          },
        },
      ];
    } else if (typeof bidAccount.status.resolved === "object") {
      // Add claim button for resolved bids
      const reward = (
        Number(bidAccount.rewardPerWinner) / 1_000_000_000
      ).toFixed(2);
      actions = [
        {
          label: `🎉 Claim ${reward} SOL Reward`,
          href: `/claim-reward?bidId=${bidId}`,
          style: {
            primary: true,
            color: "#14F195",
          },
        },
      ];
    }

    const actionMetadata = {
      type: "action",
      icon: "https://github.com/user-attachments/assets/6a5fd3c0-8e9c-4cfe-9d85-bcf177b2b4ba",
      title: `📝 ${bidAccount.content}`,
      description,
      label: isOpen ? "Place Your Bet" : "Market Resolved",
      links: {
        actions: actions,
      },
    };

    res.status(200).json(actionMetadata);
  } catch (error) {
    res.status(500).json({
      error: `GET /bid Error: ${error.message}`,
    });
  }
});

app.post("/bid", async (req, res) => {
  try {
    const { account } = req.body;
    const { bidId, vote } = req.query;

    if (!account || !bidId || vote === undefined) {
      return res.status(400).json({
        message: "Missing fields: account, bidId, vote=true/false",
      });
    }

    const voteBool = vote === "true";

    const [bidPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId as string)],
      program.programId
    );
    const [userBidPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_bid"),
        new PublicKey(account).toBuffer(),
        Buffer.from(bidId as string),
      ],
      program.programId
    );

    const ix = await program.methods
      .placeBid(bidId as string, voteBool)
      .accountsStrict({
        bid: bidPda,
        userBid: userBidPda,
        bidder: new PublicKey(account),
        systemProgram: PublicKey.default,
      })
      .instruction();

    const userPubkey = new PublicKey(account);
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: userPubkey,
      recentBlockhash: blockhash,
    });
    transaction.add(ix);

    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = serializedTx.toString("base64");

    res.status(200).json({
      transaction: base64Tx,
      message: `Placing ${voteBool ? "YES" : "NO"} bet (0.01 SOL)`,
    });
  } catch (error) {
    res.status(500).json({
      error: `POST /bid Error: ${error.message}`,
    });
  }
});

app.options("/bid", (req, res) => {
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.sendStatus(200);
});

// Add claim reward endpoint
// GET /claim-reward - Show reward claim info
app.get("/claim-reward", async (req, res) => {
  try {
    const { bidId } = req.query;
    if (!bidId) {
      return res.status(400).json({ message: "Missing ?bidId=..." });
    }

    const [bidPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId as string)],
      program.programId
    );

    const bidAccount = await program.account.bid.fetch(bidPda);
    const reward = (Number(bidAccount.rewardPerWinner) / 1_000_000_000).toFixed(
      2
    );

    const actionMetadata = {
      type: "action",
      icon: "https://github.com/user-attachments/assets/6a5fd3c0-8e9c-4cfe-9d85-bcf177b2b4ba",
      title: "🎉 Claim Your Reward",
      description: `
💰 Available Reward: ${reward} SOL

This will claim your reward from the prediction market:
"${bidAccount.content}"

Winners who voted ${
        bidAccount.outcome ? "YES" : "NO"
      } can claim their share of the pool.
`.trim(),
      label: "Claim Reward",
      links: {
        actions: [
          {
            label: `🎉 Claim ${reward} SOL`,
            href: `/claim-reward?bidId=${bidId}`,
            style: {
              primary: true,
              color: "#14F195",
            },
          },
        ],
      },
    };

    res.status(200).json(actionMetadata);
  } catch (error) {
    res.status(500).json({
      error: `GET /claim-reward Error: ${error.message}`,
    });
  }
});

app.post("/claim-reward", async (req, res) => {
  try {
    const { account } = req.body;
    const { bidId } = req.query;

    if (!account || !bidId) {
      return res.status(400).json({
        message: "Missing fields: account, bidId",
      });
    }

    const [bidPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId as string)],
      program.programId
    );
    const [userBidPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_bid"),
        new PublicKey(account).toBuffer(),
        Buffer.from(bidId as string),
      ],
      program.programId
    );

    const ix = await program.methods
      .claimReward(bidId as string)
      .accountsStrict({
        bid: bidPda,
        userBid: userBidPda,
        claimer: new PublicKey(account),
      })
      .instruction();

    const userPubkey = new PublicKey(account);
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: userPubkey,
      recentBlockhash: blockhash,
    });
    transaction.add(ix);

    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = serializedTx.toString("base64");

    res.status(200).json({
      transaction: base64Tx,
      message: "Claiming your reward",
    });
  } catch (error) {
    res.status(500).json({
      error: `POST /claim-reward Error: ${error.message}`,
    });
  }
});

// -----------------------------------------------------------------------------
// 5) Start Server
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Prediction market server listening on port ${PORT}`);
});
