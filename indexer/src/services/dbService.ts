import { serverLogger } from "../utils/logger";

// Common transaction interface for both chains
export interface ChainTransaction {
  txHash: string;
  blockHeight: string;
  timestamp: string;
  amount: string;
  type: string;
  token: string;
  chainId: string;
}

/**
 * Process a user deposit from any chain
 *
 * @param collection MongoDB collection
 * @param userId User wallet address (chain-specific)
 * @param chainId Chain identifier (e.g., "xion-testnet-1" or "sonicBlazeTestnet")
 * @param depositAmount Raw amount as string from the chain
 * @param depositAmountInUSD USD value of the deposit
 * @param transaction Transaction details
 */
export async function processUserDeposit(
  collection: any,
  userId: string,
  chainId: string,
  depositAmount: string,
  depositAmountInUSD: number,
  transaction: ChainTransaction
): Promise<void> {
  const normalizedUserId = userId.toLowerCase();

  try {
    serverLogger.info(
      `Processing deposit for ${normalizedUserId} on ${chainId} of ${depositAmountInUSD} USD`
    );

    // First, check if this is a new user
    const existingUser = await collection.findOne({ userId: normalizedUserId });

    // Convert blockHeight to number for comparison
    const currentBlockHeight = parseInt(transaction.blockHeight);

    if (existingUser) {
      // Check if we've already processed this block height or higher for this user and chain
      if (
        existingUser.lastBlockIndexed &&
        existingUser.lastBlockIndexed[chainId] &&
        currentBlockHeight <= existingUser.lastBlockIndexed[chainId]
      ) {
        serverLogger.debug(
          `Skipping deposit for user ${normalizedUserId.slice(
            0,
            10
          )}... at block ${
            transaction.blockHeight
          } as it's already indexed (last: ${
            existingUser.lastBlockIndexed[chainId]
          })`
        );
        return;
      }

      // Update existing user
      const oldBalance = parseFloat(existingUser.availableUSD || "0");
      const newBalance = oldBalance + depositAmountInUSD;

      // Calculate new availableCollateral (we can't use $inc with string values)
      const currentCollateral = existingUser.availableCollateral || "0";
      let newCollateral;

      try {
        // Add bigints and convert back to string to handle large numbers properly
        newCollateral = (
          BigInt(currentCollateral) + BigInt(depositAmount)
        ).toString();
      } catch (error) {
        serverLogger.error(`Error calculating new collateral amount:`, error);
        newCollateral = currentCollateral; // Keep existing value if calculation fails
      }

      // Calculate new chain deposits
      const currentChainDeposits = existingUser.chainDeposits || {};
      const currentChainAmount = currentChainDeposits[chainId] || "0";
      let newChainAmount;

      try {
        // Add bigints and convert back to string
        newChainAmount = (
          BigInt(currentChainAmount) + BigInt(depositAmount)
        ).toString();
      } catch (error) {
        serverLogger.error(`Error calculating new chain amount:`, error);
        newChainAmount = currentChainAmount; // Keep existing value if calculation fails
      }

      // Update the user record with the new block height for this chain
      const updateData: any = {
        availableUSD: newBalance.toString(),
        availableCollateral: newCollateral,
        lastUpdated: new Date(),
        [`chainDeposits.${chainId}`]: newChainAmount,
      };

      // Update the lastBlockIndexed field for this chain
      updateData[`lastBlockIndexed.${chainId}`] = currentBlockHeight;

      await collection.updateOne(
        { userId: normalizedUserId },
        {
          $set: updateData,
          $push: { transactions: transaction },
        }
      );

      serverLogger.success(
        `Updated user ${normalizedUserId.slice(
          0,
          10
        )}... balance from ${oldBalance} to ${newBalance} USD (Block: ${currentBlockHeight})`
      );
    } else {
      // Create new user
      const newUser = {
        userId: normalizedUserId,
        chainId: chainId, // Original chain ID for compatibility
        availableCollateral: depositAmount,
        lockedCollateral: "0",
        yesTokens: 0,
        noTokens: 0,
        availableUSD: depositAmountInUSD.toString(),
        lastUpdated: new Date(),
        transactions: [transaction],
        chainDeposits: { [chainId]: depositAmount },
        lastBlockIndexed: { [chainId]: currentBlockHeight },
        markets: [],
      };

      await collection.insertOne(newUser);

      serverLogger.success(
        `Created new user ${normalizedUserId.slice(
          0,
          10
        )}... with initial balance of ${depositAmountInUSD} USD (Block: ${currentBlockHeight})`
      );
    }
  } catch (error) {
    serverLogger.error(
      `Error processing deposit for user ${normalizedUserId.slice(0, 10)}...`,
      error
    );
    throw error;
  }
}

/**
 * Get user balance by address
 */
export async function getUserBalance(
  collection: any,
  userId: string
): Promise<any> {
  try {
    const normalizedUserId = userId.toLowerCase();
    const user = await collection.findOne({ userId: normalizedUserId });

    if (!user) {
      return null;
    }

    return {
      userId: normalizedUserId,
      balance: user.balance || user.availableUSD || "0",
      chainDeposits: user.chainDeposits || {},
      lastUpdated: user.lastUpdated,
      availableCollateral: user.availableCollateral,
      lockedCollateral: user.lockedCollateral,
      yesTokens: user.yesTokens,
      noTokens: user.noTokens,
      availableUSD: user.availableUSD,
      lastBlockIndexed: user.lastBlockIndexed || {},
    };
  } catch (error) {
    serverLogger.error(`Error retrieving balance for ${userId}:`, error);
    throw error;
  }
}

/**
 * Get user's transaction history
 */
export async function getUserTransactions(
  collection: any,
  userId: string
): Promise<any> {
  try {
    const normalizedUserId = userId.toLowerCase();
    const user = await collection.findOne({ userId: normalizedUserId });

    if (!user) {
      return [];
    }

    return user.transactions || [];
  } catch (error) {
    serverLogger.error(`Error retrieving transactions for ${userId}:`, error);
    throw error;
  }
}

/**
 * Add transaction to user's history
 */
export async function addUserTransaction(
  collection: any,
  userId: string,
  transaction: ChainTransaction
): Promise<void> {
  try {
    const normalizedUserId = userId.toLowerCase();

    await collection.updateOne(
      { userId: normalizedUserId },
      {
        $push: { transactions: transaction },
      }
    );

    serverLogger.info(
      `Added transaction ${transaction.txHash.slice(
        0,
        10
      )}... to user ${normalizedUserId}`
    );
  } catch (error) {
    serverLogger.error(`Error adding transaction for ${userId}:`, error);
    throw error;
  }
}
