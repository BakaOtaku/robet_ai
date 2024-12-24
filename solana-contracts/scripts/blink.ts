//////////////////////////////////////////////
// server.js
//////////////////////////////////////////////
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
const PROGRAM_ID = new PublicKey(
  "8iMWoGnfjJHCGoYiVF176cQm1SkZVrX2V39RavfED8eX"
);

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

// Remove individual CORS headers from endpoints since they're now set globally

// -----------------------------------------------------------------------------
// 3) CREATE BID ENDPOINTS (From your original script)
//    GET /create-bid and POST /create-bid
// -----------------------------------------------------------------------------

// GET /create-bid - Show user an Action for creating a new bid
app.get("/create-bid", async (req, res) => {
  try {
    const actionMetadata = {
      type: "action",
      icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
      title: "🎲 Create a New Bid",
      description: "Start a new prediction market by creating a bid.",
      label: "Create Bid",
      links: {
        actions: [
          {
            label: "📝 Create New Bid",
            href: `/create-bid?bidId={bidId}&bidContent={bidContent}`,
            style: {
              primary: true,
              color: "#14F195", // Solana green
            },
            parameters: [
              {
                name: "bidId",
                label: "🔑 Unique Bid ID",
                placeholder: "e.g., sol-100-eoy",
                required: true,
              },
              {
                name: "bidContent",
                label: "❓ Your Prediction Question",
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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(actionMetadata);
  } catch (error) {
    res.status(500).json({
      error: `GET /create-bid Error: ${error.message}`,
      headers: {
        "X-Action-Version": "2.1.3",
        "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      },
    });
  }
});

// POST /create-bid - Returns a transaction to create a new bid
app.post("/create-bid", async (req, res) => {
  try {
    const { account } = req.body;
    const { bidId, bidContent } = req.query;

    if (!account || !bidId || !bidContent) {
      return res.status(400).json({
        message: "Missing fields: account, bidId, bidContent",
      });
    }

    // Derive the PDA
    const [bidPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId as string)],
      program.programId
    );

    // Build the createBid instruction
    const ix = await program.methods
      .createBid(bidId as string, bidContent as string)
      .accountsStrict({
        bid: bidPda,
        creator: new PublicKey(account),
        systemProgram: PublicKey.default,
      })
      .instruction();

    // Create the transaction
    const userPubkey = new PublicKey(account);
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: userPubkey,
      recentBlockhash: blockhash,
    });
    transaction.add(ix);

    // Return base64
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = serializedTx.toString("base64");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      transaction: base64Tx,
      message: `Creating bid (“${bidId}”).`,
    });
  } catch (error) {
    res.status(500).json({
      error: `POST /create-bid Error: ${error.message}`,
      headers: {
        "X-Action-Version": "2.1.3",
        "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      },
    });
  }
});

// Preflight OPTIONS for /create-bid
app.options("/create-bid", (req, res) => {
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.sendStatus(200);
});

// -----------------------------------------------------------------------------
// 4) PLACE BID ENDPOINTS
//    GET /bid - Show existing Bid info + actions to "Vote Yes" or "Vote No"
//    POST /bid - Returns a transaction for placeBid(bidId, vote)
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
      return res.status(404).json({ message: "Bid not found on chain" });
    }

    // Format numbers with commas
    const yesVotes = bidAccount.yesVotes
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const noVotes = bidAccount.noVotes
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

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

    // Format creation date
    const createdDate = new Date(
      bidAccount.createdAt * 1000
    ).toLocaleDateString();

    const statusStr =
      typeof bidAccount.status.open === "object" ? "🟢 Open" : "🔒 Resolved";
    const description = `
🎲 Bid #${bidId}

📊 **Current Results**
━━━━━━━━━━━━━━━━━━━���━━
✅ Yes Votes: ${yesVotes} (${yesPercentage}%)
❌ No Votes: ${noVotes} (${noPercentage}%)

ℹ️ **Bid Details**
━━━━━━━━━━━━━━━━━━━━━━

👤 Created by: ${bidAccount.creator
      .toString()
      .slice(0, 4)}...${bidAccount.creator.toString().slice(-4)}

📅 Created: ${createdDate}

🏷️ Status: ${statusStr}
    `.trim();

    const isOpen = bidAccount.status === 0;

    const actionMetadata = {
      type: "action",
      icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
      title: `📝 Question: ${bidAccount.content}`,
      description,
      label: "Cast Your Vote",
      links: {
        actions: [
          {
            label: "✅ Vote Yes",
            href: `/bid?bidId=${bidId}&vote=true`,
            style: {
              primary: true,
              color: "#14F195", // Solana green
            },
            disabled: !isOpen,
          },
          {
            label: "❌ Vote No",
            href: `/bid?bidId=${bidId}&vote=false`,
            style: {
              color: "#FF3B3B", // Solana red
            },
            disabled: !isOpen,
          },
        ],
      },
    };

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(actionMetadata);
  } catch (error) {
    res.status(500).json({
      error: `GET /bid Error: ${error.message}`,
      headers: {
        "X-Action-Version": "2.1.3",
        "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      },
    });
  }
});

// POST /bid - Return a transaction for placeBid(bidId, vote)
app.post("/bid", async (req, res) => {
  try {
    // The user’s wallet pubkey in the body
    const { account } = req.body;
    // The bidId + vote in the query
    const { bidId, vote } = req.query;

    if (!account || !bidId || vote === undefined) {
      return res.status(400).json({
        message: "Missing fields: account, bidId, vote=true/false",
      });
    }

    // Convert "vote" string to bool
    const voteBool = vote === "true";

    // Derive PDAs
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

    // Build the placeBid instruction
    const ix = await program.methods
      .placeBid(bidId as string, voteBool)
      .accountsStrict({
        bid: bidPda,
        userBid: userBidPda,
        bidder: new PublicKey(account),
        systemProgram: PublicKey.default,
      })
      .instruction();

    // Construct Transaction
    const userPubkey = new PublicKey(account);
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: userPubkey,
      recentBlockhash: blockhash,
    });
    transaction.add(ix);

    // Return base64
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = serializedTx.toString("base64");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      transaction: base64Tx,
      message: `Placing bid on (“${bidId}”) with vote=${voteBool}`,
    });
  } catch (error) {
    res.status(500).json({
      error: `POST /bid Error: ${error.message}`,
      headers: {
        "X-Action-Version": "2.1.3",
        "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      },
    });
  }
});

// Preflight OPTIONS for /bid
app.options("/bid", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.sendStatus(200);
});

// Add a global error handler
app.use((error, req, res, next) => {
  res.status(500).json({
    error: error.message || "Internal Server Error",
    headers: {
      "X-Action-Version": "2.1.3",
      "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    },
  });
});

// -----------------------------------------------------------------------------
// 5) Start Server
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Blink server listening on port ${PORT}`);
});
