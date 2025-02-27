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
import { sonicLogger } from "./utils/logger";
import { getState, updateSonicState } from "./utils/state";
import { processUserDeposit, ChainTransaction } from "./services/dbService";

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

// Chain identifier
export const CHAIN_ID = "sonicBlazeTestnet";

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
    sonicLogger.info(`Scanning blocks ${fromBlock.toString()} to ${toBlock.toString()}`);

    const rawLogs = await client.getLogs({
      address: CONTRACT_ADDRESS as Address,
      event: depositEventAbi,
      fromBlock,
      toBlock,
    });

    if (rawLogs.length > 0) {
      sonicLogger.success(`Found ${rawLogs.length} deposit events between blocks ${fromBlock.toString()}-${toBlock.toString()}`);
    } else {
      sonicLogger.debug(`No deposit events found between blocks ${fromBlock.toString()}-${toBlock.toString()}`);
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
    sonicLogger.error(`Error fetching deposit events:`, error);
    return [];
  }
}

// Function to index Sonic deposits
export async function indexSonicDeposits(collection: any, catchupMode = false) {
  try {
    // Get current state from state manager
    const state = getState();
    const lastProcessedBlock = BigInt(state.sonic.lastProcessedBlock);
    
    // Get the current block height
    const currentBlock = await client.getBlockNumber();
    
    // Calculate block gap
    const blockGap = currentBlock - lastProcessedBlock;
    
    // Dynamically adjust the number of blocks to process based on the gap
    // Normal mode: max 1000-5000 blocks, Catchup mode: up to 10000 blocks
    let maxBlocksToProcess = BigInt(1000);
    
    if (blockGap > BigInt(100000)) {
      maxBlocksToProcess = catchupMode ? BigInt(10000) : BigInt(5000);
    } else if (blockGap > BigInt(50000)) {
      maxBlocksToProcess = catchupMode ? BigInt(5000) : BigInt(3000);
    } else if (blockGap > BigInt(10000)) {
      maxBlocksToProcess = catchupMode ? BigInt(3000) : BigInt(2000);
    }
    
    const toBlock = currentBlock < lastProcessedBlock + maxBlocksToProcess 
      ? currentBlock 
      : lastProcessedBlock + maxBlocksToProcess;
    
    // If we're already at the latest block, don't do anything
    if (lastProcessedBlock >= currentBlock) {
      sonicLogger.debug(`Already at the latest block ${currentBlock.toString()}`);
      return false; // Return false to indicate no more blocks to process
    }
    
    // Get the events for the range
    sonicLogger.info(`Indexing blocks ${(lastProcessedBlock + BigInt(1)).toString()} to ${toBlock.toString()} (${maxBlocksToProcess.toString()} blocks max)`);
    const events = await getDepositEvents(lastProcessedBlock + BigInt(1), toBlock);
    
    if (events.length > 0) {
      sonicLogger.highlight(`Processing ${events.length} deposit events`);
      await processDepositEvents(events, collection);
    }
    
    // Update the state to the last processed block
    updateSonicState(toBlock);
    
    // Return true if there are more blocks to process
    return currentBlock > toBlock;
  } catch (error) {
    sonicLogger.error(`Error indexing Sonic deposits:`, error);
    return false;
  }
}

// Function to process deposit events and update the database
async function processDepositEvents(events: DepositEvent[], collection: any) {
  for (const event of events) {
    try {
      const { user, token, amount, txHash, blockNumber } = event;
      
      // Convert amount from wei to USD (assuming 1 token = 1 USD for now)
      const depositAmountInUSD = Number(amount) / Number(10) ** Number(18);
      
      sonicLogger.info(`Processing deposit: User=${user.slice(0, 15)}... | Amount=${depositAmountInUSD} USD | TxHash=${txHash.slice(0, 10)}...`);
      
      // Prepare transaction record for database
      const transaction: ChainTransaction = {
        txHash,
        blockHeight: blockNumber.toString(),
        timestamp: new Date().toISOString(),
        amount: amount.toString(),
        type: "deposit",
        token: token as string,
        chainId: CHAIN_ID
      };
      
      // Use the centralized database service to process this deposit
      await processUserDeposit(
        collection,
        user,
        CHAIN_ID,
        amount.toString(),
        depositAmountInUSD,
        transaction
      );
      
    } catch (err) {
      sonicLogger.error(`Error processing deposit for user ${event.user.slice(0, 15)}...:`, err);
    }
  }
}
