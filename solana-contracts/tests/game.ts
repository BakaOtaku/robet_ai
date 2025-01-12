import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Game } from "../target/types/game";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

describe("bidding-program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Game as Program<Game>;

  let yesVoter: Keypair;
  let noVoter: Keypair;

  // Generate unique bid ID using timestamp
  const generateUniqueBidId = () => {
    return `bid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  };

  const transferSol = async (to: Keypair, amount: number) => {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: to.publicKey,
        lamports: amount,
      })
    );

    await sendAndConfirmTransaction(provider.connection, transaction, [
      provider.wallet.payer,
    ]);
  };

  before(async () => {
    // Create keypairs
    yesVoter = Keypair.generate();
    noVoter = Keypair.generate();

    // Transfer 0.1 SOL to each voter from provider
    const fundingAmount = LAMPORTS_PER_SOL / 10;
    await transferSol(yesVoter, fundingAmount);
    await transferSol(noVoter, fundingAmount);
  });

  it("Creates a bid", async () => {
    const bidId = "b15efdaac-3e6b-4684"
    const [bidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId)],
      program.programId
    );

    await program.methods
      .createBid(bidId, "Will trump speak against wokeism in the next 15 minutes?")
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
    expect(bid.totalAmount.toNumber()).to.equal(0);
  });

  it("Places bids and distributes rewards", async () => {
    const bidId = "a06efdaac-3e6b-4684";
    const [bidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId)],
      program.programId
    );

    // Create bid
    await program.methods
      .createBid(bidId, "Will trump speak against wokeism in the next 15 minutes?")
      .accountsStrict({
        bid: bidPda,
        creator: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Place YES vote
    const [yesBidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_bid"),
        yesVoter.publicKey.toBuffer(),
        Buffer.from(bidId),
      ],
      program.programId
    );

    await program.methods
      .placeBid(bidId, true)
      .accountsStrict({
        bid: bidPda,
        userBid: yesBidPda,
        bidder: yesVoter.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([yesVoter])
      .rpc();

    // Place NO vote
    const [noBidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_bid"),
        noVoter.publicKey.toBuffer(),
        Buffer.from(bidId),
      ],
      program.programId
    );

    await program.methods
      .placeBid(bidId, false)
      .accountsStrict({
        bid: bidPda,
        userBid: noBidPda,
        bidder: noVoter.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([noVoter])
      .rpc();

    // Verify bid state
    let bid = await program.account.bid.fetch(bidPda);
    expect(bid.yesVotes.toNumber()).to.equal(1);
    expect(bid.noVotes.toNumber()).to.equal(1);
    // 0.02 SOL (2 bids * 0.01 SOL)
    expect(bid.totalAmount.toNumber()).to.equal(20_000_000);

    // Resolve bid with YES as winner
    await program.methods
      .resolveBid(bidId, true)
      .accountsStrict({
        bid: bidPda,
        resolver: provider.wallet.publicKey,
      })
      .rpc();

    bid = await program.account.bid.fetch(bidPda);
    expect(bid.status.resolved).to.exist;
    expect(bid.outcome).to.be.true;
    // 0.02 SOL for the single winner
    expect(bid.rewardPerWinner.toNumber()).to.equal(20_000_000);

    // Claim reward for yes voter
    const initialBalance = await provider.connection.getBalance(
      yesVoter.publicKey
    );

    await program.methods
      .claimReward(bidId)
      .accountsStrict({
        bid: bidPda,
        userBid: yesBidPda,
        claimer: yesVoter.publicKey,
      })
      .signers([yesVoter])
      .rpc();

    const finalBalance = await provider.connection.getBalance(
      yesVoter.publicKey
    );
    expect(finalBalance - initialBalance).to.be.approximately(20_000_000, 5000);
  });

  it("Resolves a bid", async () => {
    const bidId = "abc-def";
    const [bidPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), Buffer.from(bidId)],
      program.programId
    );

    await program.methods.resolveBid(bidId, true).accountsStrict({
      bid: bidPda,
      resolver: provider.wallet.publicKey,
    }).rpc();

    const bid = await program.account.bid.fetch(bidPda);
    expect(bid.status.resolved).to.exist;
    expect(bid.outcome).to.be.true;
  });
});
