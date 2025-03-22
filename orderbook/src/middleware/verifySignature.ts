import { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { serializeSignDoc } from "@cosmjs/amino";
import { Secp256k1, Secp256k1Signature, Sha256 } from "@cosmjs/crypto";

function makeADR36AminoSignDoc(
  signer: string,
  message: string | Uint8Array
): any {
  return {
    chain_id: "",
    account_number: "0",
    sequence: "0",
    fee: {
      amount: [],
      gas: "0",
    },
    msgs: [
      {
        type: "sign/MsgSignData",
        value: {
          signer: signer,
          data:
            typeof message === "string"
              ? Buffer.from(message).toString("base64")
              : Buffer.from(message).toString("base64"),
        },
      },
    ],
    memo: "",
  };
}

async function verifyXionSignature(
  signer: string,
  pubKey: string,
  messageString: string,
  signature: string
): Promise<boolean> {
  try {
    console.log("Verifying Xion signature with signer:", signer);

    const signatureBuffer = Buffer.from(signature, "base64");
    const uint8Signature = new Uint8Array(signatureBuffer);
    const pubKeyValueBuffer = Buffer.from(pubKey, "base64");
    const pubKeyUint8Array = new Uint8Array(pubKeyValueBuffer);

    const signDoc = makeADR36AminoSignDoc(signer, messageString);
    const serializedSignDoc = serializeSignDoc(signDoc);

    const messageHash = new Sha256(serializedSignDoc).digest();
    const signatureObject = new Secp256k1Signature(
      uint8Signature.slice(0, 32),
      uint8Signature.slice(32, 64)
    );

    const isValid = Secp256k1.verifySignature(
      signatureObject,
      messageHash,
      pubKeyUint8Array
    );
    return isValid;
  } catch (err) {
    console.error("Error verifying Xion signature:", err);
    return false;
  }
}

export function verifySignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const {
    signature,
    chainId,
    userWallet,
    marketId,
    userId,
    side,
    price,
    quantity,
    tokenType = "YES",
    userSessionPubKey,
    metaAccountAddress,
    userSessionAddress,
  } = req.body;

  if (!signature || !chainId || !userWallet) {
    res.status(400).json({
      success: false,
      error:
        "Missing required fields: signature, chainId, and userWallet are required for signature verification.",
    });
    return;
  }

  // If the chain is Solana, verify the signature against the generated message.
  if (chainId.toLowerCase() === "solana") {
    // Ensure all order parameters needed to generate the message are present.
    if (
      !marketId ||
      !userId ||
      !side ||
      price === undefined ||
      quantity === undefined
    ) {
      res.status(400).json({
        success: false,
        error: "Missing order parameters required for signature generation.",
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
          error: "Invalid signature format.",
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
        error: "Invalid wallet address.",
      });
      return;
    }

    // Verify the signature using tweetnacl's detached.verify.
    const isValid = nacl.sign.detached.verify(
      messageUint8,
      signatureUint8,
      publicKeyBytes
    );
    if (!isValid) {
      res.status(400).json({
        success: false,
        error: "Invalid signature.",
      });
      return;
    }
    console.log("Signature verified successfully for Solana");
  } else if (chainId === "xion-testnet-1") {
    console.log(
      marketId,
      userId,
      side,
      price,
      quantity,
      tokenType,
      userSessionPubKey,
      userSessionAddress
    );
    if (
      !marketId ||
      !userId ||
      !side ||
      price === undefined ||
      quantity === undefined ||
      !userSessionPubKey ||
      !userSessionAddress
    ) {
      res.status(400).json({
        success: false,
        error: "Missing parameters required for Xion signature verification.",
      });
      return;
    }

    const message = `order:${marketId}:${userId}:${side}:${price}:${quantity}:${tokenType}`;

    // Use userSessionAddress as the signer (not userWallet)
    verifyXionSignature(
      userSessionAddress,
      userSessionPubKey,
      message,
      signature
    )
      .then((isValid) => {
        if (!isValid) {
          res.status(400).json({
            success: false,
            error: "Invalid Xion signature.",
          });
        } else {
          next();
        }
      })
      .catch((error) => {
        console.error("Error during Xion signature verification:", error);
        res.status(500).json({
          success: false,
          error: "Internal server error during signature verification.",
        });
      });

    return;
  } else if (chainId === "sonicBlazeTestnet") {
    // TODO: Implement Sonic Blaze signature verification.
  } else {
    // Implement or bypass verification for other chains as needed.
    console.log(
      `Chain ${chainId} does not have a Solana signature verification mechanism implemented.`
    );
    res.status(400).json({
      success: false,
      error: "Unsupported chain.",
    });
    return;
  }

  next();
}
