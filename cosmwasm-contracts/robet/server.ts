import express from 'express';
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GasPrice } from "@cosmjs/stargate";
import 'dotenv/config';

const app = express();
app.use(express.json());

// Configuration
const RPC_ENDPOINT = "https://rpc.xion-testnet-1.burnt.com:443";
const WALLET_MNEMONIC = process.env.MNEMONIC!;
const contractAddress = "xion13vucjv0hu9srmseqygrdatuxqd8ek69xxx0pv2p6ntv54w3pqxgsmkl5nk";
const gasPrice = GasPrice.fromString("0.025uxion");

// Types
type ExecuteMsg =
  | { CreateBet: { description: string; end_time: number } }
  | { ResolveBet: { bet_id: number; outcome: boolean } };

// Initialize wallet and client
let client: SigningCosmWasmClient;
let walletAddress: string;

async function initializeClient() {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(WALLET_MNEMONIC, {
    prefix: "xion",
  });
  
  const [account] = await wallet.getAccounts();
  walletAddress = account.address;
  
  client = await SigningCosmWasmClient.connectWithSigner(
    RPC_ENDPOINT,
    wallet,
    { gasPrice }
  );
  
  console.log("Client initialized with address:", walletAddress);
}

// Initialize the client when server starts
initializeClient().catch(console.error);

// Create Bet endpoint
app.post('/create-bet', async (req: any, res: any) => {
  try {
    const { description, endTime } = req.body;
    
    if (!description || !endTime) {
      return res.status(400).json({ error: 'Description and endTime are required' });
    }

    const createBetMsg: ExecuteMsg = {
      CreateBet: {
        description,
        end_time: Math.floor(endTime / 1000), // Convert to Unix timestamp
      },
    };

    const result = await client.execute(
      walletAddress,
      contractAddress,
      createBetMsg,
      "auto"
    );

    const betId = result.events
      .find(event => event.type === "wasm")
      ?.attributes
      .find(attr => attr.key === "bet_id")
      ?.value;

    res.json({
      success: true,
      betId: parseInt(betId || '0'),
      transactionHash: result.transactionHash
    });

  } catch (error) {
    console.error('Error creating bet:', error);
    res.status(500).json({ error: 'Failed to create bet', details: error });
  }
});

// Resolve Bet endpoint
app.post('/resolve-bet', async (req: any, res: any) => {
  try {
    const { betId, outcome } = req.body;
    
    if (betId === undefined || outcome === undefined) {
      return res.status(400).json({ error: 'BetId and outcome are required' });
    }

    const resolveBetMsg: ExecuteMsg = {
      ResolveBet: {
        bet_id: parseInt(betId),
        outcome: Boolean(outcome)
      }
    };

    const result = await client.execute(
      walletAddress,
      contractAddress,
      resolveBetMsg,
      "auto"
    );

    res.json({
      success: true,
      transactionHash: result.transactionHash
    });

  } catch (error) {
    console.error('Error resolving bet:', error);
    res.status(500).json({ error: 'Failed to resolve bet', details: error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 