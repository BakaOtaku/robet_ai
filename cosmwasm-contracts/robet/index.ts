import { Coin, DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import {
  SigningCosmWasmClient,
  CosmWasmClient,
    } from "@cosmjs/cosmwasm-stargate";
import { GasPrice } from "@cosmjs/stargate";
import 'dotenv/config'
/////////////////////////////////////////////////
// Types matching your contract's messages
/////////////////////////////////////////////////

// Match your "InstantiateMsg" structure from Rust
interface InstantiateMsg {
  manager: string;
}

// Match your "ExecuteMsg" structure from Rust
type ExecuteMsg =
  | { CreateBet: { description: string; end_time: number } }
  | { PlaceBet: { bet_id: number; outcome: boolean } }
  | { ResolveBet: { bet_id: number; outcome: boolean } };

// Match your "QueryMsg" structure from Rust
type QueryMsg =
  | { GetBet: { bet_id: number } };

// The BetDetail and BetInfo to match your query response
interface BetDetail {
  bettor: string;
  amount: number;
}

interface BetInfo {
  id: number;
  description: string;
  end_time: number;
  resolved: boolean;
  outcome: boolean | null;
  total_yes: number;
  total_no: number;
  bets_yes: BetDetail[];
  bets_no: BetDetail[];
}

/////////////////////////////////////////////////
// Configuration
/////////////////////////////////////////////////

// Example configuration (CHANGE THESE to match your environment)
const RPC_ENDPOINT = "https://rpc.xion-testnet-1.burnt.com:443"; // e.g. "https://rpc.uni.juno.deuslabs.fi"
const CHAIN_ID = "xion-testnet-1";                       // e.g. "uni-3"
const CONTRACT_CODE_ID = 1848;                          // The code ID on chain after uploading
const WALLET_MNEMONIC = process.env.MNEMONIC!;
const DENOM = "uxion";                                  // The token denom used for betting
const contractAddress = "xion13vucjv0hu9srmseqygrdatuxqd8ek69xxx0pv2p6ntv54w3pqxgsmkl5nk";
// Gas settings (adjust to your chain's typical fees)
const gasPrice = GasPrice.fromString("0.025uxion");

async function main() {
  /////////////////////////////////////////////////
  // 1. Create a wallet from mnemonic
  /////////////////////////////////////////////////
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(WALLET_MNEMONIC, {
    prefix: "xion", // or "juno", "cosmos", "stars", etc., depending on your chain
  });

  // Offline signer for the first account in the wallet
  const [account] = await wallet.getAccounts();
  console.log("Using address:", account.address);

  /////////////////////////////////////////////////
  // 2. Create a SigningCosmWasmClient
  /////////////////////////////////////////////////
  const client = await SigningCosmWasmClient.connectWithSigner(
    RPC_ENDPOINT,
    wallet,
    {
      gasPrice: gasPrice,
    }
  );

  /////////////////////////////////////////////////
  // 3. Instantiate the contract
  //    (skip if already instantiated and you have an address)
  /////////////////////////////////////////////////
  // If you've already instantiated the contract on chain, set:
  // const contractAddress = "wasm1xyzabc...";
  //
  // Otherwise, we instantiate it now:
  //
//   const instantiateMsg: InstantiateMsg = {
//     manager: account.address,
//   };
//   const label = "my-betting-contract-" + Math.floor(Math.random() * 10000);

//   // Instantiate the code with code_id = CONTRACT_CODE_ID
//   const instantiateResult = await client.instantiate(
//     account.address,        // sender
//     CONTRACT_CODE_ID,       // code ID
//     instantiateMsg,         // init msg
//     label,                  // label
//     "auto"                  // fee (or use a specific Gas or coins)
//   );

//   const contractAddress = instantiateResult.contractAddress;
//   console.log("Contract instantiated at:", contractAddress);

  /////////////////////////////////////////////////
  // 4. Execute: Create Bet
  /////////////////////////////////////////////////
  const createBetMsg: ExecuteMsg = {
    CreateBet: {
      description: "Will the price of ATOM be above $10 tomorrow?",
      end_time: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours from now
    },
  };

  const createBetResult = await client.execute(
    account.address,     // sender
    contractAddress,
    createBetMsg,
    "auto"
  );

  // Extract bet_id from the response attributes
  const betId = createBetResult.events
    .find(event => event.type === "wasm")
    ?.attributes
    .find(attr => attr.key === "bet_id")
    ?.value;

  if (!betId) {
    throw new Error("Could not find bet_id in response");
  }

  console.log("Created bet with ID:", betId);

  // Use the extracted betId for subsequent operations
  const placeYesBetMsg: ExecuteMsg = {
    PlaceBet: {
      bet_id: parseInt(betId),  // Convert string to number
      outcome: true,
    },
  };


  const yesBetFunds: Coin[] = [
    { denom: DENOM, amount: "10000" },
  ];

  const placeYesBetResult = await client.execute(
    account.address,
    contractAddress,
    placeYesBetMsg,
    "auto",
    undefined,
    yesBetFunds
  );
  console.log("Place YES Bet result:", placeYesBetResult);

  // Place NO bet (as a different scenario):
  //   If you have another wallet or the same wallet but want to bet NO.
  //   We'll do it with the same wallet just to demonstrate.
  const placeNoBetMsg: ExecuteMsg = {
    PlaceBet: {
      bet_id: parseInt(betId),
      outcome: false,
    },
  };

  const noBetFunds: Coin[] = [
    { denom: DENOM, amount: "5000" },
  ];

  const placeNoBetResult = await client.execute(
    account.address,
    contractAddress,
    placeNoBetMsg,
    "auto",
    undefined,
    noBetFunds
  );
  console.log("Place NO Bet result:", placeNoBetResult);

  /////////////////////////////////////////////////
  // 6. (Optional) Resolve Bet
  //    We can only do this after end_time has passed
  /////////////////////////////////////////////////
  // Let's assume time has passed and we can now resolve.
  // We'll pretend outcome = true (YES).
  const resolveBetMsg: ExecuteMsg = {
    ResolveBet: {
      bet_id: parseInt(betId),
      outcome: true,
    },
  };

  const resolveBetResult = await client.execute(
    account.address,
    contractAddress,
    resolveBetMsg,
    "auto"
  );
  console.log("Resolve Bet result:", resolveBetResult);

  /////////////////////////////////////////////////
  // 7. Query: GetBet
  /////////////////////////////////////////////////
  const queryGetBet: QueryMsg = {
    GetBet: { bet_id: parseInt(betId) },
  };

  // Alternatively, you can use the raw query client if desired:
    // const readonlyClient = await CosmWasmClient.connect(RPC_ENDPOINT);
    // const betInfo = await readonlyClient.queryContractSmart(contractAddress, queryGetBet);
  
  const betInfo = await client.queryContractSmart(
    contractAddress,
    queryGetBet
  );

  console.log("Queried Bet info:", betInfo);

  // Done!
}

// Execute the script
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
