import "dotenv/config";
import express from "express";
import { MongoClient } from "mongodb";
import { client, getDepositEvents, checkAndUpdateBalances } from "./sonic";

const app = express();
const port = process.env.PORT || 4560;

// connect to [xnb2.mongodb.net > test > userbalances]
const mongoClient = new MongoClient(process.env.MONGO_URI!);
const db = mongoClient.db("test");
const collection = db.collection("userbalances");

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Indexer Server is running");
});

app.get("/balance/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const balance = await collection.findOne({ userId: address });
  res.json(balance);
});

// Function to poll for new deposits
async function pollDeposits() {
  try {
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - BigInt(1000);

    const events = await getDepositEvents(fromBlock, currentBlock);
    if (events.length > 0) {
      await checkAndUpdateBalances(events, collection);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Polling error:`, error);
  }
}

const main = async () => {
  try {
    await mongoClient.connect();
    console.log(`[${new Date().toISOString()}] Connected to MongoDB`);

    setInterval(pollDeposits, 10000);

    app.listen(port, () => {
      console.log(
        `[${new Date().toISOString()}] Server running on port ${port}`
      );
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Server startup failed:`, err);
    process.exit(1);
  }
};

main();
