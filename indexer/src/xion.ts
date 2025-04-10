import { StargateClient } from "@cosmjs/stargate";
import axios from "axios";
import { xionLogger } from "./utils/logger";
import { getState, updateXionState } from "./utils/state";
import { processUserDeposit } from "./services/dbService";
import crypto from "crypto";

// Chain configuration
export const CHAIN_ID = "xion-testnet-1";
const rpcEndpoint = "https://rpc.xion-testnet-2.burnt.com:443";
const lcdEndpoint = "https://api.xion-testnet-2.burnt.com";
const contractAddress =
  "xion1n7f356d5u6u0q8w98q58m5jl6q7770hkcpujqycm72scmum6yckq70t2hr";

// Interface for deposit events
interface XionDepositEvent {
  contractAddress: string;
  user: string;
  amount: string;
  tokenAddress: string;
  tokenType: string;
  timestamp: string;
  txHash: string;
  blockHeight: string;
  blockTimestamp: string;
}

// Transaction response type
export interface TransactionResponse {
  tx_response: {
    height: string | number;
    txhash: string;
    codespace: string;
    code: number;
    data: string;
    raw_log: string;
    logs?: any[];
    gas_wanted: string | number;
    gas_used: string | number;
    tx: any;
    timestamp: string;
  };
  tx: any;
}

// Query transaction details from API endpoints
export async function queryTransactionDetails(
  txhash: string
): Promise<TransactionResponse | null> {
  const normalizedHash = txhash.toUpperCase();
  const url = `${lcdEndpoint}/cosmos/tx/v1beta1/txs/${normalizedHash}`;

  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      if (error.response.status === 404 || error.response.status === 500) {
        xionLogger.warn(
          `Transaction ${normalizedHash.slice(0, 10)}... not found (${
            error.response.status
          })`
        );
        return await tryAlternativeEndpoints(normalizedHash);
      }
      xionLogger.error(
        `HTTP error ${
          error.response.status
        } querying transaction ${normalizedHash.slice(0, 10)}...`
      );
    } else {
      xionLogger.error(`Network error querying transaction: ${error.message}`);
    }
    return null;
  }
}

// Try alternative endpoints if primary fails
async function tryAlternativeEndpoints(
  txhash: string
): Promise<TransactionResponse | null> {
  // Try RPC endpoint
  try {
    const rpcUrl = `${rpcEndpoint}/tx?hash=0x${txhash}`;
    const response = await axios.get(rpcUrl);

    if (response.data?.result) {
      return {
        tx_response: {
          height: response.data.result.height,
          txhash: response.data.result.hash,
          codespace: "",
          code: response.data.result.tx_result.code,
          data: response.data.result.tx_result.data,
          raw_log: response.data.result.tx_result.log,
          logs: [],
          gas_wanted: response.data.result.tx_result.gas_wanted,
          gas_used: response.data.result.tx_result.gas_used,
          tx: null,
          timestamp: "",
        },
        tx: null,
      };
    }
  } catch (error) {
    // Fall through to next approach
  }

  // Try alternative LCD endpoint
  try {
    const altUrl = `${lcdEndpoint}/txs/${txhash}`;
    const response = await axios.get(altUrl);

    if (response.data) {
      return {
        tx_response: {
          height: response.data.height,
          txhash: response.data.txhash,
          codespace: response.data.codespace || "",
          code: response.data.code || 0,
          data: response.data.data || "",
          raw_log: response.data.raw_log,
          logs: response.data.logs || [],
          gas_wanted: response.data.gas_wanted,
          gas_used: response.data.gas_used,
          tx: null,
          timestamp: response.data.timestamp || "",
        },
        tx: response.data.tx || null,
      };
    }
  } catch (error) {
    // Both methods failed
  }

  return null;
}

// Extract deposit events from transaction data
function extractDepositEvents(txData: any, txHash: string): XionDepositEvent[] {
  if (!txData || !txData.tx_response) {
    return [];
  }

  const events = txData.tx_response.events || [];

  // Find deposit events from event logs
  const depositEvents = events.filter(
    (event: any) =>
      event.type === "wasm-deposit_token" ||
      event.type.includes("deposit_token") ||
      (event.type === "execute" &&
        event.attributes?.some((attr: any) => attr.value === contractAddress))
  );

  if (depositEvents.length > 0) {
    xionLogger.info(
      `Found ${
        depositEvents.length
      } potential deposit events in tx ${txHash.slice(0, 10)}...`
    );
  } else {
    // No explicit deposit events found, check transaction body
    if (!txData.tx?.body?.messages) {
      return [];
    }

    const messages = txData.tx.body.messages;

    // Check for direct contract call with funds
    const directContractMsg = messages.find(
      (msg: any) =>
        msg["@type"] === "/cosmwasm.wasm.v1.MsgExecuteContract" &&
        msg.contract === contractAddress
    );

    if (directContractMsg?.funds?.length > 0) {
      const fund = directContractMsg.funds[0];
      xionLogger.info(
        `Created synthetic deposit event from direct call with amount ${fund.amount} ${fund.denom}`
      );

      return [
        {
          contractAddress: contractAddress,
          user: directContractMsg.sender,
          amount: fund.amount,
          tokenAddress: fund.denom,
          tokenType: "native",
          timestamp: new Date(txData.tx_response.timestamp)
            .getTime()
            .toString(),
          txHash: txHash,
          blockHeight: txData.tx_response.height,
          blockTimestamp: txData.tx_response.timestamp,
        },
      ];
    }

    // Check for authz execution
    const authzMsg = messages.find(
      (msg: any) => msg["@type"] === "/cosmos.authz.v1beta1.MsgExec"
    );

    if (authzMsg && Array.isArray(authzMsg.msgs)) {
      const nestedContractMsg = authzMsg.msgs.find(
        (msg: any) =>
          msg["@type"] === "/cosmwasm.wasm.v1.MsgExecuteContract" &&
          msg.contract === contractAddress
      );

      if (nestedContractMsg?.funds?.length > 0) {
        const fund = nestedContractMsg.funds[0];
        xionLogger.info(
          `Created synthetic deposit event from authz call with amount ${fund.amount} ${fund.denom}`
        );

        return [
          {
            contractAddress: contractAddress,
            user: nestedContractMsg.sender, // Original sender from the nested message
            amount: fund.amount,
            tokenAddress: fund.denom,
            tokenType: "native",
            timestamp: new Date(txData.tx_response.timestamp)
              .getTime()
              .toString(),
            txHash: txHash,
            blockHeight: txData.tx_response.height,
            blockTimestamp: txData.tx_response.timestamp,
          },
        ];
      }
    }

    return [];
  }

  // Format deposit events from event logs
  return depositEvents.map((event: any) => {
    let userAddress = "";
    let amount = "";
    let tokenAddress = "";
    let tokenType = "";
    let timestamp = "";
    let contractAddr = "";

    // Extract attributes
    if (Array.isArray(event.attributes)) {
      for (const attr of event.attributes) {
        switch (attr.key) {
          case "_contract_address":
            contractAddr = attr.value;
            break;
          case "user":
            userAddress = attr.value;
            break;
          case "amount":
            amount = attr.value;
            break;
          case "token_address":
            tokenAddress = attr.value;
            break;
          case "token_type":
            tokenType = attr.value;
            break;
          case "timestamp":
            timestamp = attr.value;
            break;
        }
      }
    }

    // If needed attributes not found in event data, try to extract from transaction body
    if ((!amount || !userAddress) && txData.tx?.body?.messages) {
      const messages = txData.tx.body.messages;

      // Check direct contract call
      const directContractMsg = messages.find(
        (msg: any) =>
          msg["@type"] === "/cosmwasm.wasm.v1.MsgExecuteContract" &&
          msg.contract === contractAddress
      );

      if (directContractMsg) {
        if (!userAddress) userAddress = directContractMsg.sender;

        if (!amount && directContractMsg.funds?.length > 0) {
          amount = directContractMsg.funds[0].amount;
          if (!tokenAddress) tokenAddress = directContractMsg.funds[0].denom;
        }
      }

      // Check authz execution
      if (!userAddress || !amount) {
        const authzMsg = messages.find(
          (msg: any) => msg["@type"] === "/cosmos.authz.v1beta1.MsgExec"
        );

        if (authzMsg && Array.isArray(authzMsg.msgs)) {
          const nestedContractMsg = authzMsg.msgs.find(
            (msg: any) =>
              msg["@type"] === "/cosmwasm.wasm.v1.MsgExecuteContract" &&
              msg.contract === contractAddress
          );

          if (nestedContractMsg) {
            if (!userAddress) userAddress = nestedContractMsg.sender;

            if (!amount && nestedContractMsg.funds?.length > 0) {
              amount = nestedContractMsg.funds[0].amount;
              if (!tokenAddress)
                tokenAddress = nestedContractMsg.funds[0].denom;
            }
          }
        }
      }
    }

    return {
      contractAddress: contractAddr || contractAddress,
      user: userAddress,
      amount: amount,
      tokenAddress: tokenAddress || "uxion",
      tokenType: tokenType || "native",
      timestamp:
        timestamp ||
        new Date(txData.tx_response.timestamp).getTime().toString(),
      txHash: txHash,
      blockHeight: txData.tx_response.height,
      blockTimestamp: txData.tx_response.timestamp,
    };
  });
}

// Find relevant transactions within a block range
async function findTransactionsInBlocks(
  fromHeight: number,
  toHeight: number
): Promise<Array<{ hash: string; height: number }>> {
  const transactions: Array<{ hash: string; height: number }> = [];
  let blocksWithTxs = 0;

  // Use stride for more efficient scanning on large ranges
  const stride = toHeight - fromHeight < 50 ? 1 : 10;

  xionLogger.info(
    `Scanning blocks ${fromHeight} to ${toHeight} with stride ${stride}`
  );

  try {
    const client = await StargateClient.connect(rpcEndpoint);
    const batchSize = 10; // Process 10 heights at a time
    let heightsToProcess = [];

    for (let height = fromHeight; height <= toHeight; height += stride) {
      heightsToProcess.push(height);

      if (heightsToProcess.length >= batchSize || height + stride > toHeight) {
        // Process batch in parallel
        await Promise.all(
          heightsToProcess.map(async (height) => {
            try {
              const block = await client.getBlock(height);

              if (block?.txs?.length > 0) {
                xionLogger.debug(
                  `Block ${height} has ${block.txs.length} transactions`
                );
                const relevantTxs = [];

                for (const txData of block.txs) {
                  // Create proper hash from transaction data using SHA256
                  const txHash = crypto
                    .createHash("sha256")
                    .update(Buffer.from(txData))
                    .digest("hex")
                    .toUpperCase();

                  relevantTxs.push({ hash: txHash, height });
                }

                if (relevantTxs.length > 0) {
                  blocksWithTxs++;

                  // Check transactions in smaller batches
                  const txBatchSize = 5;
                  for (let i = 0; i < relevantTxs.length; i += txBatchSize) {
                    const batch = relevantTxs.slice(i, i + txBatchSize);

                    const results = await Promise.allSettled(
                      batch.map(async (tx) => {
                        try {
                          if (
                            await isTransactionForContract(
                              tx.hash,
                              contractAddress
                            )
                          ) {
                            return tx;
                          }
                          return null;
                        } catch (error) {
                          return null;
                        }
                      })
                    );

                    results.forEach((result) => {
                      if (result.status === "fulfilled" && result.value) {
                        transactions.push(result.value);
                      }
                    });
                  }
                }
              }
            } catch (error) {
              xionLogger.error(`Error processing block ${height}:`, error);
            }
          })
        );

        heightsToProcess = [];
      }
    }

    client.disconnect();
  } catch (error) {
    xionLogger.error("Error in transaction search:", error);
  }

  xionLogger.info(
    `Found ${transactions.length} contract transactions across ${blocksWithTxs} blocks`
  );

  return transactions;
}

// Check if a transaction involves our contract
async function isTransactionForContract(
  txHash: string,
  targetContract: string
): Promise<boolean> {
  try {
    const url = `${lcdEndpoint}/cosmos/tx/v1beta1/txs/${txHash}`;
    const response = await axios.get(url);

    if (response.data?.tx?.body?.messages) {
      const messages = response.data.tx.body.messages;

      // Check for direct contract execution
      const hasDirectContractMsg = messages.some(
        (msg: any) =>
          msg["@type"] === "/cosmwasm.wasm.v1.MsgExecuteContract" &&
          msg.contract === targetContract
      );

      if (hasDirectContractMsg) {
        xionLogger.info(
          `Found direct contract transaction ${txHash.slice(0, 10)}...`
        );
        return true;
      }

      // Check for contract execution via authz
      const hasAuthzContractMsg = messages.some((msg: any) => {
        if (
          msg["@type"] === "/cosmos.authz.v1beta1.MsgExec" &&
          Array.isArray(msg.msgs)
        ) {
          return msg.msgs.some((nestedMsg: any) => {
            if (typeof nestedMsg === "object" && nestedMsg !== null) {
              return (
                nestedMsg["@type"] === "/cosmwasm.wasm.v1.MsgExecuteContract" &&
                nestedMsg.contract === targetContract
              );
            }
            return false;
          });
        }
        return false;
      });

      if (hasAuthzContractMsg) {
        xionLogger.info(
          `Found authz contract transaction ${txHash.slice(0, 10)}...`
        );
        return true;
      }
    }
    return false;
  } catch (error: any) {
    if (error.response?.status === 404) return false;
    xionLogger.debug(
      `Error checking tx ${txHash.slice(0, 10)}...: ${error.message}`
    );
    return false;
  }
}

// Main indexing function
export async function indexXionDeposits(collection: any, catchupMode = false) {
  try {
    const state = getState();
    const lastProcessedHeight = Number(state.xion.lastProcessedBlock);
    const client = await StargateClient.connect(rpcEndpoint);
    const currentHeight = await client.getHeight();

    // Determine block range to process
    const blocksToProcess = catchupMode ? 500 : 200;
    const toHeight = Math.min(
      currentHeight,
      lastProcessedHeight + blocksToProcess
    );

    if (lastProcessedHeight >= currentHeight) {
      xionLogger.debug(`Already at the latest block ${currentHeight}`);
      client.disconnect();
      return false;
    }

    xionLogger.info(
      `Indexing blocks ${lastProcessedHeight + 1} to ${toHeight}`
    );

    // Find transactions in the block range
    const contractTransactions = await findTransactionsInBlocks(
      lastProcessedHeight + 1,
      toHeight
    );

    if (contractTransactions.length === 0) {
      updateXionState(toHeight);
      client.disconnect();
      return currentHeight > toHeight; // Return true if more blocks to process
    }

    xionLogger.info(
      `Processing ${contractTransactions.length} contract transactions`
    );

    // Process transactions in batches
    let processedCount = 0;
    const batchSize = 5;

    for (let i = 0; i < contractTransactions.length; i += batchSize) {
      const batch = contractTransactions.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (tx) => {
          try {
            const txData = await queryTransactionDetails(tx.hash);
            if (txData) {
              await processTransaction(txData, tx.hash, collection);
              return tx.hash;
            }
            return null;
          } catch (error) {
            xionLogger.error(
              `Error processing tx ${tx.hash.slice(0, 10)}...`,
              error
            );
            return null;
          }
        })
      );

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          processedCount++;
        }
      });
    }

    // Update state and clean up
    updateXionState(toHeight);
    client.disconnect();

    if (processedCount > 0) {
      xionLogger.success(
        `Processed ${processedCount} transactions successfully`
      );
    }

    return currentHeight > toHeight; // Return true if more blocks to process
  } catch (error) {
    xionLogger.error(`Error indexing Xion deposits:`, error);
    return false;
  }
}

// Process a specific transaction
export async function processTransaction(
  txData: any,
  txHash: string,
  collection: any
) {
  try {
    xionLogger.info(`Processing transaction: ${txHash}`);

    if (!txData) {
      return {
        success: false,
        message: `Could not retrieve transaction data for ${txHash}`,
      };
    }

    const depositEvents = extractDepositEvents(txData, txHash);

    if (depositEvents.length === 0) {
      return {
        success: false,
        message: `No deposit events found in transaction ${txHash}`,
      };
    }

    let processedCount = 0;

    for (const event of depositEvents) {
      if (event.contractAddress !== contractAddress) continue;

      const userAddress = event.user;
      const depositAmount = event.amount;
      const tokenAddress = event.tokenAddress || "uxion";

      xionLogger.info(
        `Processing deposit: ${userAddress}, ${depositAmount} ${tokenAddress}`
      );

      // Convert to USD and create transaction record
      const amountInUSD = convertToUSD(depositAmount);
      const tx = {
        txHash,
        blockHeight: String(txData.tx_response?.height || "0"),
        timestamp: txData.tx_response?.timestamp || new Date().toISOString(),
        amount: depositAmount,
        type: "deposit",
        token: tokenAddress,
        chainId: CHAIN_ID,
      };

      await processUserDeposit(
        collection,
        userAddress,
        CHAIN_ID,
        depositAmount,
        amountInUSD,
        tx
      );

      processedCount++;
    }

    return {
      success: processedCount > 0,
      message:
        processedCount > 0
          ? `Transaction ${txHash} processed successfully`
          : `No valid deposits found in transaction ${txHash}`,
    };
  } catch (error) {
    xionLogger.error(`Error processing transaction:`, error);
    return {
      success: false,
      message: `Error processing transaction: ${error}`,
    };
  }
}

// Convert token amount to USD
function convertToUSD(amount: string): number {
  const cleanedAmount = amount.replace(/[^0-9.]/g, "");
  const numericAmount = parseFloat(cleanedAmount);

  if (isNaN(numericAmount)) return 0;

  // 0.1 XION = 1 USD, therefore 1 XION = 10 USD
  // Convert from uxion (which is 10^-6 XION) to USD
  // 1 uxion = 0.000001 XION = 0.00001 USD
  return numericAmount * 0.00001;
}
