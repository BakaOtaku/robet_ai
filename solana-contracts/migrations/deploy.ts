// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Game } from "../target/types/game";

module.exports = async function (provider) {
  anchor.setProvider(provider);

  const program = anchor.workspace.Game as Program<Game>;

  try {
    console.log("Program ID:", program.programId.toString());
    console.log("Wallet:", provider.wallet.publicKey.toString());

    // You can add initialization logic here if needed
    // await program.methods.initialize().accountsStrict({
    //   resolver: provider.wallet.publicKey,
    //   systemProgram: anchor.web3.SystemProgram.programId,
    // }).rpc();

    console.log("Deployment successful!");
  } catch (error) {
    console.error("Deployment failed:", error);
    throw error;
  }
};
