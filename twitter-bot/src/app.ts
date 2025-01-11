// -----------------------------------------------------------------
// ----------------------------- IMPORTS ----------------------------
import "dotenv/config";
import express from "express";
import { MongoClient, Collection } from "mongodb";
import * as anchor from "@coral-xyz/anchor";
import * as cron from "node-cron";
import { TwitterApi } from "twitter-api-v2";
import { Game } from "../utils/game";
import { Tweet, logError, logInfo } from "../utils";

// -----------------------------------------------------------------
// ----------------------------- CONSTANTS ----------------------------
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = "robet";
const COLLECTION_NAME = "bets";
const { PublicKey } = anchor.web3;
const PROGRAM_ID = new PublicKey(
  "8iMWoGnfjJHCGoYiVF176cQm1SkZVrX2V39RavfED8eX"
);

const app = express();

// -----------------------------------------------------------------
// ----------------------------- INITIALIZATION ----------------------------
let tweetsCollection: Collection<Tweet>;

// Initialize Twitter client with OAuth 1.0a User Context
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY || '',
  appSecret: process.env.TWITTER_API_SECRET || '',
  accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
  accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
}).v2;

// Validate Twitter credentials
async function validateTwitterCredentials() {
  try {
    const me = await twitterClient.me();
    logInfo(`Twitter client initialized for user: @${me.data.username}`);
  } catch (error) {
    logError("Twitter authentication failed:", error);
    process.exit(1);
  }
}

// Initialize Anchor connection and program
if (!process.env.SOLANA_RPC_URL) {
  throw new Error("SOLANA_RPC_URL is not set");
}
const connection = new anchor.web3.Connection(process.env.SOLANA_RPC_URL);
const adminWallet = anchor.web3.Keypair.fromSecretKey(
  Buffer.from(JSON.parse(process.env.ADMIN_PRIVATE_KEY || "[]"))
);
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(adminWallet),
  { preflightCommitment: "processed" }
);
anchor.setProvider(provider);
logInfo(`Admin public key: ${adminWallet.publicKey.toBase58()}`);
// Initialize the program
const program = new anchor.Program(
  require("../../solana-contracts/target/idl/game.json"),
  provider
) as anchor.Program<Game>;
// Initialize mongodb connection with db and collection
async function initializeMongoDB() {
  try {
    const client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);
    tweetsCollection = db.collection<Tweet>(COLLECTION_NAME);
    logInfo(`Connected to MongoDB - Database: ${DB_NAME}, Collection: ${COLLECTION_NAME}`);
  } catch (error) {
    logError("MongoDB connection error:", error);
    process.exit(1);
  }
}

// -----------------------------------------------------------------
// ----------------------------- FUNCTIONS ----------------------------
async function createBetOnChain(tweet: Tweet) {
  if (tweet.blink_url) {
    logInfo(`Bet already created for tweet ${tweet.tweet_id} but reply not sent`);
    return;
  }
  try {
    const bidId = tweet.bet_id;
    const [bidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId)],
      program.programId
    );

    await program.methods
      .createBid(bidId, tweet.question)
      .accounts({
        // @ts-ignore
        bid: bidPda,
        creator: adminWallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([adminWallet])
      .rpc();

    await tweetsCollection.updateOne(
      { tweet_id: tweet.tweet_id },
      {
        $set: {
          blink_url: `https://dial.to/developer?url=https%3A%2F%2Fblinks.amanraj.dev%2Fbid%3FbidId%3D${bidId}&cluster=devnet`,
          updated_at: new Date(),
        },
      }
    );

    logInfo(`Created bet on chain for tweet ${tweet.tweet_id}`);
  } catch (error) {
    logError("Error creating bet on chain:", error);
    throw error;
  }
}

async function replyToTweet(tweet: Tweet) {
  try {
    const replyText = `🎲 Your prediction has been turned into a bet!\n\nJoin and place your bets at ${tweet.blink_url}\n\n#Prediction #Betting`;

    const response = await twitterClient.tweet(replyText, {
      reply: { in_reply_to_tweet_id: tweet.tweet_id }
    });

    if (response.data) {
      logInfo(`Successfully replied to tweet ${tweet.tweet_id} with tweet ID: ${response.data.id}`);
      await tweetsCollection.updateOne(
        { tweet_id: tweet.tweet_id },
        { $set: { is_replied: true } }
      );
    } else {
      throw new Error("No response data from Twitter API");
    }
  } catch (error: any) {
    if (error.code === 401) {
      logError("Twitter authentication failed. Please check your API credentials.");
    } else if (error.code === 403) {
      logError("Twitter API rate limit exceeded or duplicate tweet.");
    } else {
      logError("Error replying to tweet:", error);
    }
    throw error;
  }
}

async function processPendingTweets() {
  try {
    const pendingTweets = await tweetsCollection
      .find({ is_replied: false })
      .toArray();
    console.log(pendingTweets);

    logInfo(`Found ${pendingTweets.length} pending tweets to process`);

    for (const tweet of pendingTweets) {
      try {
        await createBetOnChain(tweet);
        await replyToTweet(tweet);
        logInfo(`Successfully processed tweet ${tweet.tweet_id}`);
      } catch (error) {
        logError(`Failed to process tweet ${tweet.tweet_id}:`, error);
        continue;
      }
    }
  } catch (error) {
    logError("Error processing pending tweets:", error);
  }
}

// -----------------------------------------------------------------
// ----------------------------- CRON JOB ----------------------------
cron.schedule("*/30 * * * * *", () => {
  processPendingTweets();
});

// -----------------------------------------------------------------
// ----------------------------- ROUTES ----------------------------
app.get("/health", (_req, res) => {
  res.send("OK");
});

app.get("/", (_req, res) => {
  res.send("Robet Twitter Bot Service");
});

// -----------------------------------------------------------------
// ----------------------------- SERVER ----------------------------
async function startServer() {
  try {
    await initializeMongoDB();
    await validateTwitterCredentials();
    
    app.listen(PORT, () => {
      logInfo(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    logError("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();