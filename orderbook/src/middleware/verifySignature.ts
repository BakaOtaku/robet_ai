import { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

export function verifySignature(req: Request, res: Response, next: NextFunction): void {
  const { signature, chainId, userWallet, marketId, userId, side, price, quantity, tokenType = "YES" } = req.body;

  if (!signature || !chainId || !userWallet) {
    res.status(400).json({
      success: false,
      error: "Missing required fields: signature, chainId, and userWallet are required for signature verification."
    });
    return;
  }

  // If the chain is Solana, verify the signature against the generated message.
  if (chainId.toLowerCase() === "solana") {
    // Ensure all order parameters needed to generate the message are present.
    if (!marketId || !userId || !side || price === undefined || quantity === undefined) {
      res.status(400).json({
        success: false,
        error: "Missing order parameters required for signature generation."
      });
      return;
    }

    // Create a message string incorporating all the order parameters.
    const message = `order:${marketId}:${userId}:${side}:${price}:${quantity}:${tokenType}`;
    const messageUint8 = new TextEncoder().encode(message);

    let signatureUint8: Uint8Array;
    try {
      // Try decoding the signature as base58.
      signatureUint8 = bs58.decode(signature);
    } catch (err) {
      try {
        // Fallback: try decoding as base64.
        signatureUint8 = Uint8Array.from(Buffer.from(signature, "base64"));
      } catch (err) {
        res.status(400).json({
          success: false,
          error: "Invalid signature format."
        });
        return;
      }
    }

    // Convert the userWallet to a PublicKey instance and then to bytes.
    let publicKeyBytes: Uint8Array;
    try {
      publicKeyBytes = new PublicKey(userWallet).toBytes();
    } catch (err) {
      res.status(400).json({
        success: false,
        error: "Invalid wallet address."
      });
      return;
    }

    // Verify the signature using tweetnacl's detached.verify.
    const isValid = nacl.sign.detached.verify(messageUint8, signatureUint8, publicKeyBytes);
    if (!isValid) {
      res.status(400).json({
        success: false,
        error: "Invalid signature."
      });
      return;
    }
  } else {
    // Implement or bypass verification for other chains as needed.
    console.log(`Chain ${chainId} does not have a Solana signature verification mechanism implemented.`);
  }

  next();
} 