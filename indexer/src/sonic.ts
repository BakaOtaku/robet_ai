import {
  Address,
  createPublicClient,
  defineChain,
  getContract,
  http,
  parseAbiItem,
  decodeEventLog,
} from "viem";
import abi from "../utils/evm/abi.json";
import { DepositEvent } from "../utils";

// Define Sonic Blaze Testnet chain
export const sonicBlazeTestnet = defineChain({
  id: 57_054,
  name: "Sonic Blaze Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Sonic",
    symbol: "S",
  },
  rpcUrls: {
    default: { http: ["https://rpc.blaze.soniclabs.com"] },
  },
  blockExplorers: {
    default: {
      name: "Sonic Blaze Testnet Explorer",
      url: "https://testnet.sonicscan.org/",
    },
  },
  testnet: true,
});
// Create HTTP client
export const client = createPublicClient({
  chain: sonicBlazeTestnet,
  transport: http(),
});

// Contract setup
const CONTRACT_ADDRESS = "0x6781dBfdbD6a2803E1698c6e705659D3b597f643";

export const contract = getContract({
  address: CONTRACT_ADDRESS as Address,
  abi: abi,
  client,
});

// Define the specific event structure
const depositEventAbi = parseAbiItem(
  "event Deposited(address indexed user, address indexed token, uint256 amount)"
);

// Function to fetch deposit events
export async function getDepositEvents(
  fromBlock: bigint,
  toBlock: bigint
): Promise<DepositEvent[]> {
  try {
    console.log(`[${new Date().toISOString()}] Scanning blocks ${fromBlock} to ${toBlock}`);

    const rawLogs = await client.getLogs({
      address: CONTRACT_ADDRESS as Address,
      event: depositEventAbi,
      fromBlock,
      toBlock,
    });

    if (rawLogs.length > 0) {
      console.log(`[${new Date().toISOString()}] Found ${rawLogs.length} deposit events`);
    }

    return rawLogs.map((log) => {
      const decoded = decodeEventLog({
        abi: [depositEventAbi],
        data: log.data,
        topics: log.topics,
      });

      return {
        user: decoded.args.user as string,
        token: decoded.args.token as string,
        amount: decoded.args.amount as bigint,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching deposit events:`, error);
    return [];
  }
}

// Test function to check specific transaction
export async function testSpecificBlock() {
  try {
    const targetBlock = BigInt(22447538);
    console.log(`Testing block ${targetBlock}`);

    const events = await getDepositEvents(targetBlock, targetBlock);
    console.log("Found events:", events);

    // Also try getting the specific transaction receipt
    const receipt = await client.getTransactionReceipt({
      hash: "0x1220b7b7d5051ee4086f522de81ce9b0bf743c29e9f15c39506932057942656f",
    });

    console.log("Transaction receipt logs:", receipt.logs);

    if (receipt.logs.length > 0) {
      const decoded = decodeEventLog({
        abi: [depositEventAbi],
        data: receipt.logs[0].data,
        topics: receipt.logs[0].topics,
      });
      console.log("Decoded specific transaction:", decoded);
    }
  } catch (error) {
    console.error("Error in test:", error);
  }
}

// Function to check and update user balances
export async function checkAndUpdateBalances(
  events: DepositEvent[],
  collection: any
) {
  for (const event of events) {
    try {
      const query = {
        userId: event.user.toLowerCase(),
        token: event.token.toLowerCase(),
      };
      const existing = await collection.findOne(query);
      const newBalance = event.amount.toString();

      if (!existing) {
        const newDoc = {
          userId: event.user.toLowerCase(),
          token: event.token.toLowerCase(),
          availableCollateral: newBalance,
          lockedCollateral: "0",
          yesTokens: 0,
          noTokens: 0,
          lastUpdated: new Date(),
          lastTxHash: event.txHash,
          blockNumber: event.blockNumber.toString(),
        };
        await collection.insertOne(newDoc);
        console.log(
          `[${new Date().toISOString()}] New deposit: User=${event.user} Token=${event.token} Amount=${newBalance}`
        );
      } else {
        await collection.updateOne(
          query,
          {
            $set: {
              availableCollateral: newBalance,
              lastUpdated: new Date(),
              lastTxHash: event.txHash,
              blockNumber: event.blockNumber.toString(),
            },
          }
        );
        console.log(
          `[${new Date().toISOString()}] Updated deposit: User=${event.user} Token=${event.token} Amount=${newBalance}`
        );
      }
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Failed to process deposit for user ${event.user}:`,
        err
      );
    }
  }
}
