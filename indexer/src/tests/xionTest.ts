import { StargateClient } from "@cosmjs/stargate";
import { queryTransactionDetails } from "../xion";
import dotenv from "dotenv";
dotenv.config();

const rpcEndpoint = "https://rpc.xion-testnet-1.burnt.com:443";

// Contract address to monitor
const contractAddress =
  "xion1ys6n97h8y9s8ncmlqhjh2wswn8mgqul45j9fatqznvkfeuyqm6pqfwf3sw";

/**
 * Find transactions involving the contract in a specific block
 */
async function findTransactionsInBlock(blockHeight: number) {
  try {
    console.log(`Searching for transactions in block ${blockHeight}`);
    // Standard approach for other blocks
    // Connect to the client
    const client = await StargateClient.connect(rpcEndpoint);

    // Get the block
    const block = await client.getBlock(blockHeight);
    console.log(
      `Block ${blockHeight} contains ${block.txs.length} transactions`
    );

    // Process each transaction in this block
    const contractTxs = [];
    for (const txData of block.txs) {
      // Convert the transaction data to a hash
      const crypto = require("crypto");
      const txHash = crypto
        .createHash("sha256")
        .update(Buffer.from(txData))
        .digest("hex")
        .toUpperCase();
      console.log(`Checking tx hash ${txHash} in block ${blockHeight}`);

      // Get detailed transaction data
      const txDetails = await queryTransactionDetails(txHash);
      console.log(txDetails);

      if (txDetails) {
        // Check if this transaction involves our contract
        const isContractTx = txDetails.tx?.body?.messages?.some(
          (msg: any) =>
            msg["@type"] === "/cosmwasm.wasm.v1.MsgExecuteContract" &&
            msg.contract === contractAddress
        );

        if (isContractTx) {
          console.log(
            `FOUND CONTRACT TRANSACTION: ${txHash} in block ${blockHeight}`
          );
          contractTxs.push({
            hash: txHash,
            height: blockHeight,
            details: txDetails,
          });
        }
      }
    }

    return contractTxs;
  } catch (error) {
    console.error(`Error searching in block ${blockHeight}:`, error);
    return [];
  }
}

async function runTests() {
  console.log("STARTING XION INDEXER TESTS");

  // Find block for our known transaction
  const knownTxBlock = 12745232;

  if (knownTxBlock) {
    // Test block scanning
    console.log("\n=== TESTING BLOCK SCANNING ===");
    const contractTxs = await findTransactionsInBlock(knownTxBlock);
    console.log(
      `Found ${contractTxs.length} contract transactions in block ${knownTxBlock}`
    );
  }

  console.log("\nTESTS COMPLETED");
}

// Run the tests
runTests().catch(console.error);
