import { StargateClient, IndexedTx, Coin } from "@cosmjs/stargate";
import { MongoClient } from "mongodb";

// Replace with your node's RPC endpoint
const rpcEndpoint = "https://rpc.xion-testnet-1.burnt.com:443";

// Contract address to monitor
const contractAddress =
  "xion1yyw2u9c7lvv4my77gdw3n9rxz6nekymq4gq26w39c6m6nh9txlhs73pnht";

// Track the last processed height
let lastProcessedHeight = 0;

// Helper functions
function isDepositTransaction(tx: IndexedTx): boolean {
  console.log(tx);
  return tx.events.some(
    (event) =>
      event.type === "transfer" &&
      event.attributes.some(
        (attr) => attr.key === "recipient" && attr.value === contractAddress
      )
  );
}

function getSenderFromTx(tx: IndexedTx): string {
  const transferEvent = tx.events.find((event) => event.type === "transfer");
  return (
    transferEvent?.attributes.find((attr) => attr.key === "sender")?.value || ""
  );
}

function getAmountFromTx(tx: IndexedTx): bigint {
  const transferEvent = tx.events.find((event) => event.type === "transfer");
  const amount =
    transferEvent?.attributes.find((attr) => attr.key === "amount")?.value ||
    "0";
  return BigInt(amount.replace(/[^0-9]/g, ""));
}

function convertToUSD(balance: readonly Coin[]): number {
  return balance.reduce((total, coin) => {
    return total + Number(coin.amount) / 1e6;
  }, 0);
}

export async function checkAndUpdateXionBalances(collection: any) {
  try {
    const client = await StargateClient.connect(rpcEndpoint);

    const currentHeight = await client.getHeight();
    const fromBlock = lastProcessedHeight || currentHeight - 100;

    console.log(
      `[${new Date().toISOString()}] Scanning Xion blocks ${fromBlock} to ${currentHeight}`
    );

    for (let height = fromBlock; height <= currentHeight; height++) {
      const block = await client.getBlock(height);
      const blockResults = await client.searchTx(`tx.height=${height}`);
      // console.log(blockResults);

      for (const tx of blockResults) {
        if (isDepositTransaction(tx)) {
          const sender = getSenderFromTx(tx);
          const amount = getAmountFromTx(tx);

          const balance = await client.getAllBalances(sender);
          const balanceInUSD = convertToUSD(balance);

          const query = {
            userId: sender.toLowerCase(),
            chainId: "xion-testnet-1",
          };

          const existing = await collection.findOne(query);
          if (!existing) {
            const newDoc = {
              userId: sender.toLowerCase(),
              chainId: "xion-testnet-1",
              availableCollateral: amount.toString(),
              lockedCollateral: "0",
              yesTokens: 0,
              noTokens: 0,
              availableUSD: balanceInUSD.toString(),
              lastUpdated: new Date(),
            };
            await collection.insertOne(newDoc);
            console.log(
              `[${new Date().toISOString()}] New Xion user balance: User=${sender} USD=${balanceInUSD}`
            );
          } else {
            await collection.updateOne(query, {
              $set: {
                availableCollateral: amount.toString(),
                availableUSD: balanceInUSD.toString(),
                lastUpdated: new Date(),
              },
            });
            console.log(
              `[${new Date().toISOString()}] Updated Xion user balance: User=${sender} USD=${balanceInUSD}`
            );
          }
        }
      }
    }

    lastProcessedHeight = currentHeight;
    client.disconnect();
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error processing Xion events:`,
      error
    );
  }
}
