import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { calculateFee, GasPrice, StargateClient, coin } from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";

// Network configuration
const RPC_ENDPOINT = "https://rpc.xion-testnet-1.burnt.com:443";
const DENOM = "uxion";

// Wallet configuration - replace this with your own mnemonic phrase
const SENDER_MNEMONIC = "spray unveil couch swamp improve paddle torch march expand ability digital extra spike tilt unable";

async function transferXion(
  amount: string,
  recipientAddress: string,
  mnemonic: string = SENDER_MNEMONIC
) {
  try {
    console.log(`Starting transfer of ${amount} uxion to ${recipientAddress}`);
    
    // Create wallet from mnemonic
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: "xion",
    });
    
    // Get sender address
    const accounts = await wallet.getAccounts();
    const senderAddress = accounts[0].address;
    console.log(`Sender address: ${senderAddress}`);
    
    // Check account balance before transfer
    const queryClient = await StargateClient.connect(RPC_ENDPOINT);
    const balances = await queryClient.getAllBalances(senderAddress);
    console.log(`Account balances before transfer: ${JSON.stringify(balances)}`);
    
    // Make sure account has enough balance
    const xionBalance = balances.find(coin => coin.denom === DENOM);
    if (!xionBalance || parseInt(xionBalance.amount) < parseInt(amount)) {
      console.error(`Insufficient balance. You have ${xionBalance?.amount || 0} ${DENOM} but tried to send ${amount} ${DENOM}`);
      return;
    }
    
    // Create signing client
    const signingClient = await SigningCosmWasmClient.connectWithSigner(
      RPC_ENDPOINT,
      wallet
    );
    
    // Calculate fee
    const gasPrice = GasPrice.fromString("0.025uxion");
    const fee = calculateFee(200000, gasPrice);
    
    // Execute the transfer using bank module
    console.log(`Sending ${amount} ${DENOM} to ${recipientAddress}`);
    const result = await signingClient.sendTokens(
      senderAddress,
      recipientAddress,
      [coin(amount, DENOM)],
      fee
    );
    
    console.log("Transfer completed successfully!");
    console.log(`Transaction hash: ${result.transactionHash}`);
    console.log(`Gas used: ${result.gasUsed}`);
    
    // Check balance after transfer
    const balanceAfter = await queryClient.getAllBalances(senderAddress);
    console.log(`Account balances after transfer: ${JSON.stringify(balanceAfter)}`);
    
    return result;
  } catch (error: any) {
    console.error("Error transferring tokens:", error.message);
    throw error;
  }
}

// Example usage - command line arguments
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log("Usage: ts-node xionTransfer.ts <amount> <recipient_address>");
    console.log("Example: ts-node xionTransfer.ts 500000 xion1e4r843fzdujf4xa46n7j7kuptlvq59kpk9ky750c65c89vvxdw2q8jelsm");
    process.exit(1);
  }
  
  const amount = args[0];
  const recipient = args[1];
  
  try {
    await transferXion(amount, recipient);
  } catch (error) {
    console.error("Failed to transfer tokens:", error);
    process.exit(1);
  }
}

// Run the transfer if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for use in other scripts
export { transferXion }; 