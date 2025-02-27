import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";
import { indexSonicDeposits, client as sonicClient } from "./sonic";
import { indexXionDeposits, processTransaction, queryTransactionDetails, TransactionResponse } from "./xion";
import { serverLogger } from "./utils/logger";
import { getState } from "./utils/state";
import { getUserBalance, getUserTransactions } from "./services/dbService";

// MongoDB connection string
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || "test";
const COLLECTION_NAME = "userbalances";

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Connect to MongoDB
let mongoClient: MongoClient;
let collection: any;

// Connect to MongoDB with retry logic
async function connectToMongoDB(
  retries = 5,
  delay = 2000
): Promise<MongoClient> {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI environment variable is not set");
    }

    serverLogger.info(
      `Connecting to MongoDB with URI from environment variables`
    );
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    serverLogger.success("Connected to MongoDB successfully");
    return client;
  } catch (error) {
    if (retries <= 0) {
      serverLogger.error(
        "Failed to connect to MongoDB after multiple attempts:",
        error
      );
      throw error;
    }

    serverLogger.warn(
      `Failed to connect to MongoDB. Retrying in ${delay}ms... (${retries} attempts left)`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    return connectToMongoDB(retries - 1, delay);
  }
}

// Home endpoint
app.get("/", (req, res) => {
  const state = getState();
  res.json({
    status: "ok",
    message: "Robet Indexer API",
    lastProcessedBlocks: {
      sonic: state.sonic.lastProcessedBlock,
      xion: state.xion.lastProcessedBlock,
    },
  });
});

// Get user balance endpoint
app.get("/balance/:address", (req, res) => {
  const address = req.params.address;
  serverLogger.info(`Looking up balance for address: ${address}`);

  getUserBalance(collection, address)
    .then((balance) => {
      res.json(balance);
    })
    .catch((error) => {
      serverLogger.error(`Error getting user balance:`, error);
      res.status(500).json({
        success: false,
        error: "Error retrieving balance",
      });
    });
});

// Test endpoint to process a known transaction
app.get("/test/transaction", (req, res) => {
  serverLogger.info("Processing test transaction");

  // Use the transaction hash that we know works when processed directly
  const txHash = "C2C01D3A9532A0B34708459CBEA697A39D459063397E126DBAC22CA1882FDA60";
  serverLogger.info(`Testing with specific transaction hash: ${txHash}`);

  // First query transaction details
  queryTransactionDetails(txHash)
    .then((txData: TransactionResponse | null) => {
      if (!txData) {
        return Promise.reject(new Error("Failed to retrieve transaction data"));
      }
      
      // Process the transaction with the data
      return processTransaction(txData, txHash, collection);
    })
    .then((result: any) => {
      res.json({
        success: result.success,
        message: result.message,
        transaction: txHash,
        details: "This transaction should be processed successfully"
      });
    })
    .catch((error: Error) => {
      serverLogger.error("Error processing test transaction:", error);
      res.status(500).json({
        success: false,
        error: "Error processing test transaction",
        transaction: txHash,
        errorDetails: error.message
      });
    });
});

// Process specific transaction hash
app.get("/process/:hash", (req, res) => {
  const txHash = req.params.hash;
  serverLogger.info(`Processing transaction: ${txHash}`);

  // First query transaction details
  queryTransactionDetails(txHash)
    .then((txData: TransactionResponse | null) => {
      if (!txData) {
        return Promise.reject(new Error("Failed to retrieve transaction data"));
      }
      
      // Process the transaction with the data
      return processTransaction(txData, txHash, collection);
    })
    .then((result: any) => {
      res.json(result);
    })
    .catch((error: Error) => {
      serverLogger.error(`Error processing transaction:`, error);
      res.status(500).json({
        success: false,
        error: "Error processing transaction",
      });
    });
});

// Get state endpoint
app.get("/state", (req, res) => {
  const state = getState();
  res.json({
    status: "ok",
    state,
  });
});

// Get all transactions for a user
app.get("/transactions/:address", (req, res) => {
  const address = req.params.address;
  serverLogger.info(`Looking up transactions for address: ${address}`);

  getUserTransactions(collection, address)
    .then((transactions) => {
      res.json({
        success: true,
        address,
        transactions,
      });
    })
    .catch((error) => {
      serverLogger.error(`Error getting user transactions:`, error);
      res.status(500).json({
        success: false,
        error: "Error retrieving transactions",
      });
    });
});

// Function to poll for deposits (runs periodically)
async function pollDeposits() {
  try {
    serverLogger.info("Polling for new deposits from both chains");

    // Poll Sonic deposits
    try {
      await indexSonicDeposits(collection);
    } catch (sonicError) {
      serverLogger.error("Error polling Sonic deposits:", sonicError);
    }

    // Poll Xion deposits
    try {
      await indexXionDeposits(collection);
    } catch (xionError) {
      serverLogger.error("Error polling Xion deposits:", xionError);
    }
  } catch (error) {
    serverLogger.error("Error in polling function:", error);
  }
}

// Function to rapidly catch up to the current block height
async function catchUpToLatestBlocks() {
  serverLogger.info("Starting rapid catch-up mode to sync to latest blocks");

  // Process a single chain's blocks in catch-up mode
  async function processChainBlocks(chainName: string, indexFunction: any) {
    serverLogger.info(`Starting catch-up for ${chainName} chain`);
    let moreBlocksToProcess = true;
    let batchCount = 0;

    while (moreBlocksToProcess) {
      try {
        batchCount++;
        if (batchCount % 10 === 0) {
          serverLogger.highlight(
            `${chainName} catch-up: Processed ${batchCount} batches so far`
          );
        }

        serverLogger.info(
          `Catching up ${chainName} blocks (batch ${batchCount})...`
        );
        moreBlocksToProcess = await indexFunction(collection, true);

        // Small delay to prevent overwhelming the node
        if (moreBlocksToProcess) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        serverLogger.error(`Error in ${chainName} catch-up:`, error);
        moreBlocksToProcess = false;
      }
    }

    serverLogger.success(
      `${chainName} catch-up completed after ${batchCount} batches!`
    );
    return chainName;
  }

  // Process both chains in parallel
  try {
    await Promise.all([
      processChainBlocks("Sonic", indexSonicDeposits),
      processChainBlocks("Xion", indexXionDeposits),
    ]);

    serverLogger.success(
      "All chains catch-up completed! Now at latest blocks."
    );
  } catch (error) {
    serverLogger.error("Error during parallel catch-up:", error);
  }
}

// Main function to start the server and run initial checks
async function main() {
  try {
    // Connect to MongoDB with retry
    mongoClient = await connectToMongoDB();

    const db = mongoClient.db(DB_NAME);
    collection = db.collection(COLLECTION_NAME);

    // Start Express server
    app.listen(port, () => {
      serverLogger.success(`Server running on port ${port}`);
    });

    // Get current state
    const state = getState();

    // Check if we need to catch up (more than 20,000 blocks behind)
    try {
      const currentSonicBlock = await sonicClient.getBlockNumber();
      const lastProcessedSonic = BigInt(state.sonic.lastProcessedBlock);
      const sonicGap = currentSonicBlock - lastProcessedSonic;

      if (sonicGap > BigInt(20000)) {
        serverLogger.highlight(
          `Large block gap detected (${sonicGap.toString()} blocks). Starting catch-up mode.`
        );
        await catchUpToLatestBlocks();
      } else {
        // Run initial blockchain checks
        serverLogger.info("Running initial blockchain checks");
        await pollDeposits();
      }
    } catch (error) {
      serverLogger.error("Error checking block gap:", error);
      // Still run initial checks even if gap check fails
      await pollDeposits();
    }

    // Set up recurring polling every 30 seconds
    setInterval(pollDeposits, 30000);
  } catch (error) {
    serverLogger.error("Error starting server:", error);
    process.exit(1);
  }
}

// Start the server
main();
