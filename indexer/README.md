# Robet AI Blockchain Indexer

A multi-chain indexer for tracking user deposits across Sonic and Xion blockchains.

## What This Does

This indexer monitors deposit events on two different blockchains and consolidates them into a single database with consistent balance tracking:

- **Sonic Indexer**: Tracks deposits on the Sonic Blaze Testnet (EVM-compatible chain)
- **Xion Indexer**: Tracks deposits on the Xion Testnet (Cosmos SDK chain)
- **Unified Database**: All deposits are converted to USD value and stored in MongoDB

## How It Works

1. **Blockchain Monitoring**: The system polls each blockchain for new blocks and scans for deposit events
2. **Smart Indexing**: Dynamically adjusts the block range size based on how far behind it is
3. **Rapid Catch-Up**: Processes large chunks of blocks in parallel when starting from scratch
4. **Resilient Design**: Includes MongoDB connection retry logic and error handling

### Catch-Up Mechanism

When the indexer starts, it checks if there's a large gap between the last processed block and the current block height:

```
If gap > 20,000 blocks:
   → Enter "catch-up mode"
   → Process larger chunks (up to 10,000 blocks at once for Sonic, 2,000 for Xion)
   → Process both chains in parallel using Promise.all
   → Show progress updates every 10 batches
   → Use a shorter delay between requests (100ms vs normal 200ms)
```

This makes syncing from scratch much faster. Once caught up, it switches to regular polling every 30 seconds.

### Duplicate Prevention

To prevent processing the same blocks multiple times (which would duplicate balance updates), each user document tracks the last indexed block for each chain with a `lastBlockIndexed` field. This allows the system to:

1. Skip already processed blocks when restarting the indexer
2. Safely resume indexing from where it left off
3. Avoid duplicate transactions and balance updates

## Getting Started

### Prerequisites

- Node.js v16+
- MongoDB 4.4+
- Yarn

### Setup

1. Clone the repository
2. Install dependencies:

```
yarn install
```

3. Create a `.env` file with your configuration:

```
MONGO_URI=mongodb://localhost:27017
DB_NAME=robet
PORT=3000
```

### Running the Indexer

Start in development mode:

```
yarn dev
```

Start in production mode:

```
yarn build
yarn start
```

## API Endpoints

- `GET /` - Status of the indexer
- `GET /state` - Current indexing state (last processed blocks)
- `GET /balance/:address` - Get user balance
- `GET /transactions/:address` - Get user transaction history
- `GET /process/:hash` - Manually process a specific transaction

## Architecture

- `src/app.ts` - Main application, Express server setup, and indexing coordination
- `src/sonic.ts` - Sonic chain-specific indexing logic
- `src/xion.ts` - Xion chain-specific indexing logic
- `src/services/dbService.ts` - Database operations for both chains
- `src/utils/` - Utilities for logging, state management, etc.

## Database Schema

User documents follow this structure:

```js
{
  _id: ObjectId,
  userId: "0x123...", // User wallet address
  chainId: "sonicBlazeTestnet", // Original chain ID for compatibility
  availableCollateral: "3280000000000000000",
  lockedCollateral: "0",
  yesTokens: 0,
  noTokens: 0,
  availableUSD: "3.28",
  lastUpdated: ISODate("2023-02-23T14:25:09.489Z"),
  lastBlockIndexed: { // Tracks last indexed block per chain
    "sonicBlazeTestnet": 12345678,
    "xion": 8901234
  },
  transactions: [
    {
      txHash: "0xabc...",
      blockHeight: "12345678",
      timestamp: "2023-02-23T14:25:09.489Z",
      amount: "3280000000000000000",
      type: "deposit",
      token: "0x...",
      chainId: "sonicBlazeTestnet"
    }
  ],
  markets: [...]
}
```

```bash
yarn
yarn run dev
```
