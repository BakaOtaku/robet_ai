import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { calculateFee, GasPrice, coin, StargateClient } from "@cosmjs/stargate";
import {
  SigningCosmWasmClient,
  CosmWasmClient,
} from "@cosmjs/cosmwasm-stargate";

// Contract details
const CONTRACT_ADDRESS =
  "xion1yyw2u9c7lvv4my77gdw3n9rxz6nekymq4gq26w39c6m6nh9txlhs73pnht";
const RPC_ENDPOINT = "https://rpc.xion-testnet-1.burnt.com:443";

// Native token denomination (uxion = microxion, where 1 XION = 1,000,000 uxion)
const DENOM = "uxion";

// You can use a fixed mnemonic for testing instead of generating a new one each time
// This way you can fund it once from the faucet and reuse it
const TEST_MNEMONIC =
  "bird tongue horror outer execute true reward panda apology canyon federal kite brain ripple mechanic";

async function main() {
  try {
    console.log("Starting Xion transfer test");
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

    // Query contract config to get admin wallet
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

      // Prepare transfer
      const amount = "100000"; // 0.1 XION
      const gasPrice = GasPrice.fromString("0.025uxion");
      const fee = calculateFee(200000, gasPrice);

      console.log(
        `Sending transfer of ${amount} ${DENOM} to admin wallet: ${adminWallet}`
      );

      // Send tokens directly to admin wallet
      const result = await signingClient.sendTokens(
        myAddress,
        adminWallet,
        [coin(amount, DENOM)],
        fee,
        "Testing indexer - direct transfer"
      );

      console.log("Transfer transaction completed!");
      console.log(`Transaction hash: ${result.transactionHash}`);
      console.log(`Gas used: ${result.gasUsed}`);

      // Check balance after transfer
      const balanceAfter = await queryClient.getAllBalances(myAddress);
      console.log(`Final account balances: ${JSON.stringify(balanceAfter)}`);

      // Now attempt to call the contract's deposit_token function (this will fail, but useful for debugging)
      console.log(
        "\n----- Attempting contract deposit (expected to fail) -----"
      );
      console.log("This section is for contract debugging purposes only");

      try {
        // Prepare deposit message
        const depositAmount = "50000"; // 0.05 XION

        // Try the deposit_token message format from the contract code
        const depositMsg = {
          deposit_token: {
            token_address: DENOM,
            amount: depositAmount,
          },
        };

        console.log(
          `Attempting deposit of ${depositAmount} ${DENOM} to contract`
        );
        console.log(`Using message: ${JSON.stringify(depositMsg)}`);

        // Execute the deposit transaction
        const funds = [coin(depositAmount, DENOM)];

        const depositResult = await signingClient.execute(
          myAddress,
          CONTRACT_ADDRESS,
          depositMsg,
          fee,
          "",
          funds
        );

        console.log("Deposit successful (unexpected)!");
        console.log(`Transaction hash: ${depositResult.transactionHash}`);
      } catch (error: any) {
        console.log("Contract deposit failed with error (as expected):");
        console.log("Error message:", error.message);
        console.log(
          "\nShare this error with your contract developer to fix the issue with native token handling"
        );
        console.log(
          "The issue is likely in the token_address validation in the contract code"
        );
      }
    } catch (queryError) {
      console.error("Error during operation:", queryError);
    }
  } catch (err) {
    console.error("Error during test:", err);
  }
}

main()
  .then(() => console.log("Test completed"))
  .catch(console.error);
