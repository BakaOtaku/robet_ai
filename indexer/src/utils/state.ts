import fs from "fs";
import path from "path";
import { serverLogger } from "./logger";

// Define the state interface
interface IndexerState {
  sonic: {
    lastProcessedBlock: string; // Using string for BigInt compatibility
    startBlock: string;
  };
  xion: {
    lastProcessedBlock: number;
    startBlock: number;
  };
  lastUpdated: string;
}

// Default starting blocks for each chain
// These values should be set to known blocks where your contract was deployed
const DEFAULT_STATE: IndexerState = {
  sonic: {
    lastProcessedBlock: "22446679",
    startBlock: "22446679",
  },
  xion: {
    lastProcessedBlock: 12743190,
    startBlock: 12743190,
  },
  lastUpdated: new Date().toISOString(),
};

// State file path
const STATE_FILE = path.join(process.cwd(), "indexer-state.json");

/**
 * Load the indexer state from disk
 */
export function loadState(): IndexerState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf8");
      const state = JSON.parse(data) as IndexerState;
      serverLogger.info(
        `Loaded indexer state: Sonic block ${state.sonic.lastProcessedBlock}, Xion block ${state.xion.lastProcessedBlock}`
      );
      return state;
    } else {
      serverLogger.warn(
        `No state file found, starting with default state from Sonic block ${DEFAULT_STATE.sonic.startBlock}, Xion block ${DEFAULT_STATE.xion.startBlock}`
      );
      saveState(DEFAULT_STATE);
      return DEFAULT_STATE;
    }
  } catch (error) {
    serverLogger.error(`Failed to load state file:`, error);
    return DEFAULT_STATE;
  }
}

/**
 * Save the indexer state to disk
 */
export function saveState(state: IndexerState): void {
  try {
    state.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    serverLogger.debug(
      `Saved indexer state: Sonic block ${state.sonic.lastProcessedBlock}, Xion block ${state.xion.lastProcessedBlock}`
    );
  } catch (error) {
    serverLogger.error(`Failed to save state file:`, error);
  }
}

/**
 * Update the state for a specific chain
 */
export function updateSonicState(lastProcessedBlock: bigint): void {
  const state = loadState();
  state.sonic.lastProcessedBlock = lastProcessedBlock.toString();
  saveState(state);
}

/**
 * Update the Xion state
 */
export function updateXionState(lastProcessedBlock: number): void {
  const state = loadState();
  state.xion.lastProcessedBlock = lastProcessedBlock;
  saveState(state);
}

/**
 * Get the latest state
 */
export function getState(): IndexerState {
  return loadState();
}
