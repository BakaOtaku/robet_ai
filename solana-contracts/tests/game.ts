import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Game } from "../target/types/game";

describe("bidding-program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Game as Program<Game>;

  it("Creates a bid", async () => {
    const bidId = "test_bid_1";
    const [bidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId)],
      program.programId
    );

    await program.methods
      .createBid(bidId, "Will SOL reach $100?")
      .accountsStrict({
        bid: bidPda,
        creator: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const bid = await program.account.bid.fetch(bidPda);
    expect(bid.id).to.equal(bidId);
    expect(bid.creator.toString()).to.equal(
      provider.wallet.publicKey.toString()
    );
    expect(bid.yesVotes.toNumber()).to.equal(0);
    expect(bid.noVotes.toNumber()).to.equal(0);
  });

  it("Places a bid", async () => {
    const bidId = "test_bid_1";
    const bidder = anchor.web3.Keypair.generate();

    const [bidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId)],
      program.programId
    );

    const [userBidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_bid"),
        bidder.publicKey.toBuffer(),
        Buffer.from(bidId),
      ],
      program.programId
    );

    // Airdrop SOL to bidder
    const signature = await provider.connection.requestAirdrop(
      bidder.publicKey,
      1000000000
    );
    await provider.connection.confirmTransaction(signature);

    await program.methods
      .placeBid(bidId, true)
      .accountsStrict({
        bid: bidPda,
        userBid: userBidPda,
        bidder: bidder.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bidder])
      .rpc();

    const bid = await program.account.bid.fetch(bidPda);
    expect(bid.yesVotes.toNumber()).to.equal(1);
    expect(bid.noVotes.toNumber()).to.equal(0);
  });

  it("Resolves a bid", async () => {
    const bidId = "test_bid_1";
    const [bidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId)],
      program.programId
    );

    await program.methods
      .resolveBid(bidId, true)
      .accountsStrict({
        bid: bidPda,
        resolver: provider.wallet.publicKey,
      })
      .rpc();

    const bid = await program.account.bid.fetch(bidPda);
    expect(bid.status.resolved).to.exist;
    expect(bid.outcome).to.be.true;
  });
});
