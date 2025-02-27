import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { calculateFee, GasPrice, coin, StargateClient } from "@cosmjs/stargate";
import {
  SigningCosmWasmClient,
  CosmWasmClient,
} from "@cosmjs/cosmwasm-stargate";
import axios from "axios";

// Contract details
const CONTRACT_ADDRESS =
  "xion1ys6n97h8y9s8ncmlqhjh2wswn8mgqul45j9fatqznvkfeuyqm6pqfwf3sw";
const RPC_ENDPOINT = "https://rpc.xion-testnet-1.burnt.com:443";
const LCD_ENDPOINT = "https://api.xion-testnet-1.burnt.com";

// Native token denomination (uxion = microxion, where 1 XION = 1,000,000 uxion)
const DENOM = "uxion";

// You can use a fixed mnemonic for testing instead of generating a new one each time
// This way you can fund it once from the faucet and reuse it
const TEST_MNEMONIC =
  "spray unveil couch swamp improve paddle torch march expand ability digital extra spike tilt unable";

// Function to query transaction details from the LCD/REST API endpoint
async function queryTransactionDetails(txHash: string) {
  try {
    console.log(`Querying transaction details from LCD API for hash: ${txHash}`);
    const response = await axios.get(`${LCD_ENDPOINT}/cosmos/tx/v1beta1/txs/${txHash}`);
    return response.data;
  } catch (error: any) {
    console.error("Error querying transaction details:", error.message);
    return null;
  }
}

// Function to extract deposit events from transaction data
function extractDepositEvents(txData: any) {
  if (!txData || !txData.tx_response || !txData.tx_response.events) {
    return [];
  }

  // Find all deposit events
  const depositEvents = txData.tx_response.events.filter(
    (event: any) => event.type === "wasm-deposit_token"
  );

  if (depositEvents.length === 0) {
    console.log("No deposit events found in transaction");
    return [];
  }

  // Format deposit events for indexer processing
  return depositEvents.map((event: any) => {
    const attributes: Record<string, string> = {};
    
    // Convert attributes array to object for easier access
    event.attributes.forEach((attr: any) => {
      attributes[attr.key] = attr.value;
    });

    return {
      contractAddress: attributes._contract_address || "",
      user: attributes.user || "",
      amount: attributes.amount || "",
      tokenAddress: attributes.token_address || "",
      tokenType: attributes.token_type || "",
      timestamp: attributes.timestamp || "",
    };
  });
}

async function main() {
  try {
    console.log("Starting Xion contract deposit test");
    console.log(`Contract address: ${CONTRACT_ADDRESS}`);
    console.log(`RPC endpoint: ${RPC_ENDPOINT}`);

    // Create wallet from mnemonic
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, {
      prefix: "xion",
    });

    // Get accounts in the wallet
    const accounts = await wallet.getAccounts();
    const myAddress = accounts[0].address;
    console.log(`Wallet address: ${myAddress}`);

    // Connect to clients
    const queryClient = await StargateClient.connect(RPC_ENDPOINT);
    const cosmWasmClient = await CosmWasmClient.connect(RPC_ENDPOINT);

    // Query contract config
    try {
      console.log("Querying contract configuration...");
      const queryResult = await cosmWasmClient.queryContractSmart(
        CONTRACT_ADDRESS,
        { get_config: {} }
      );
      console.log("Contract config:", queryResult);

      // Extract admin wallet
      const adminWallet = queryResult.admin_wallet;
      console.log(`Admin wallet from contract: ${adminWallet}`);

      // Check account balance
      const balances = await queryClient.getAllBalances(myAddress);
      console.log(`Initial account balances: ${JSON.stringify(balances)}`);

      if (!balances.some((c) => c.denom === DENOM && parseInt(c.amount) > 0)) {
        console.log(
          "Account has no balance. Please fund it using the Xion testnet faucet."
        );
        return;
      }

      // Create signing client
      const signingClient = await SigningCosmWasmClient.connectWithSigner(
        RPC_ENDPOINT,
        wallet
      );

      // Prepare contract deposit
      const depositAmount = "10000"; // 0.1 XION
      const gasPrice = GasPrice.fromString("0.025uxion");
      const fee = calculateFee(200000, gasPrice);

      // Create deposit message for the contract
      const depositMsg = {
        deposit_token: {
          token_address: DENOM,
          amount: depositAmount,
        },
      };

      console.log(`Sending deposit of ${depositAmount} ${DENOM} to contract`);
      console.log(`Using message: ${JSON.stringify(depositMsg)}`);

      // Execute the deposit transaction
      const funds = [coin(depositAmount, DENOM)];

      const result = await signingClient.execute(
        myAddress,
        CONTRACT_ADDRESS,
        depositMsg,
        fee,
        "",
        funds
      );

      console.log("Contract deposit transaction completed!");
      console.log(`Transaction hash: ${result.transactionHash}`);
      console.log(`Gas used: ${result.gasUsed}`);

      // Wait for transaction to be indexed
      console.log("\nWaiting for transaction to be indexed...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get detailed transaction data for indexer
      console.log("\n----- QUERYING TRANSACTION FOR INDEXER -----");
      const txData = await queryTransactionDetails(result.transactionHash);
      
      if (txData) {
        console.log("Transaction height:", txData.tx_response.height);
        console.log("Transaction timestamp:", txData.tx_response.timestamp);
        
        // Extract and process deposit events for indexer
        const depositEvents = extractDepositEvents(txData);
        
        if (depositEvents.length > 0) {
          console.log("\n----- DEPOSIT EVENTS FOR INDEXER -----");
          depositEvents.forEach((event: any, index: number) => {
            console.log(`\nDeposit Event #${index + 1}:`);
            console.log("  Contract Address:", event.contractAddress);
            console.log("  User:", event.user);
            console.log("  Amount:", event.amount);
            console.log("  Token Address:", event.tokenAddress);
            console.log("  Token Type:", event.tokenType);
            console.log("  Timestamp:", event.timestamp);
            
            // Example of how to format for indexer database
            const indexerRecord = {
              transaction_hash: result.transactionHash,
              block_height: txData.tx_response.height,
              block_timestamp: txData.tx_response.timestamp,
              contract_address: event.contractAddress,
              user_address: event.user,
              amount: event.amount,
              token: event.tokenAddress,
              token_type: event.tokenType,
              event_timestamp: event.timestamp
            };
            
            console.log("\nIndexer Record (for database):");
            console.log(JSON.stringify(indexerRecord, null, 2));
          });
        } else {
          console.log("No deposit events found to index");
        }
      } else {
        console.log("Failed to retrieve transaction data for indexing");
      }

      // Check balance after deposit
      const balanceAfter = await queryClient.getAllBalances(myAddress);
      console.log(`\nFinal account balances: ${JSON.stringify(balanceAfter)}`);
    } catch (error: any) {
      console.error("Error during operation:", error.message);
    }
  } catch (err) {
    console.error("Error during test:", err);
  }
}

main()
  .then(() => console.log("Test completed"))
  .catch(console.error);
