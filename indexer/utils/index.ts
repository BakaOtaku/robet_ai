// Define deposit event type
export type DepositEvent = {
  user: string;
  token: string;
  amount: bigint;
  txHash: string;
  blockNumber: bigint;
};
