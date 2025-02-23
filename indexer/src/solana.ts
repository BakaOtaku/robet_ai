import * as anchor from "@coral-xyz/anchor";
import { Game } from "../utils/game";

const fetchSolanaEvents = async () => {
  if (!process.env.SOLANA_RPC_URL) {
    throw new Error("SOLANA_RPC_URL is not set");
  }
  const connection = new anchor.web3.Connection(process.env.SOLANA_RPC_URL);
  const adminWallet = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(process.env.ADMIN_PRIVATE_KEY || "[]"))
  );
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(adminWallet),
    { preflightCommitment: "processed" }
  );
  anchor.setProvider(provider);
  console.log(`Admin public key: ${adminWallet.publicKey.toBase58()}`);

  const program = new anchor.Program(
    require("../utils/idl.json"),
    provider
  ) as anchor.Program<Game>;

  // const bidAccount = await program.account.bid.fetch(bid.bid.toBase58());
  // console.log(bidAccount);

  // const userBidAccount = await program.account.userBid.fetch(
  //   userBid.userBid.toBase58()
  // );
  // console.log(userBidAccount);
};

export { fetchSolanaEvents };
