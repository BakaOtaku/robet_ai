#!/bin/bash
# RoBet Contract Deployment and Testing Script

# Set environment variables
CHAIN_ID="xion-testnet-1"
NODE="https://rpc.xion-testnet-1.burnt.com:443"
GAS_PRICES="0.025uxion"
GAS_ADJUSTMENT="1.3"
WALLET="test"
ADMIN_WALLET="xion14vu4xu668pu7pavxtpr84mp5ywzh4y2wu72yhl"
DENOM="uxion"

echo "=== Storing WASM contract ==="
STORE_TX=$(~/Desktop/garage/xion/build/xiond tx wasm store artifacts/robet.wasm \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --gas-prices $GAS_PRICES \
  --gas auto \
  --gas-adjustment $GAS_ADJUSTMENT \
  --node $NODE \
  -y | grep -oP 'txhash: \K[A-Z0-9]+')

echo "Store transaction hash: $STORE_TX"

# Wait a moment for the transaction to be processed
sleep 5

# Query the code ID based on the observed output format
TX_RESULT=$(~/Desktop/garage/xion/build/xiond q tx $STORE_TX --node $NODE)
echo "Transaction query result received"

# Extract code_id using grep (more reliable with the plain text output)
CODE_ID=$(echo "$TX_RESULT" | grep -A1 "key: code_id" | grep "value:" | awk '{print $2}' | tr -d '"')
echo "Code ID: $CODE_ID"

echo "=== Instantiating contract ==="
INIT_TX=$(~/Desktop/garage/xion/build/xiond tx wasm instantiate $CODE_ID \
  '{"admin_wallet":"'$ADMIN_WALLET'"}' \
  --from $WALLET \
  --label "robet_v1.0.0" \
  --gas auto \
  --gas-adjustment $GAS_ADJUSTMENT \
  --node $NODE \
  --chain-id $CHAIN_ID \
  --admin $WALLET \
  -y | grep -oP 'txhash: \K[A-Z0-9]+')

echo "Instantiate transaction hash: $INIT_TX"

# Wait for transaction to complete
sleep 5

# Get the contract address from the instantiate transaction result
INIT_RESULT=$(~/Desktop/garage/xion/build/xiond q tx $INIT_TX --node $NODE)
echo "Instantiate transaction query result received"

# Extract contract_address using grep - updated to match actual output format
CONTRACT_ADDR=$(echo "$INIT_RESULT" | grep -A1 "key: _contract_address" | grep "value:" | awk '{print $2}' | tr -d '"' | head -1)
echo "Contract address: $CONTRACT_ADDR"

# Save contract address for later use
echo "CONTRACT_ADDR=$CONTRACT_ADDR" > .contract_addr

echo "=== Testing contract functionality ==="

# 1. Query the current config
echo "Querying contract config..."
~/Desktop/garage/xion/build/xiond query wasm contract-state smart $CONTRACT_ADDR '{"get_config":{}}' --node $NODE

# 2. Add a whitelisted token (example token address)
echo "Adding a whitelisted token..."
EXAMPLE_TOKEN="xion1tokenaddressexample"
~/Desktop/garage/xion/build/xiond tx wasm execute $CONTRACT_ADDR \
  '{"add_whitelisted_token":{"token_address":"'$EXAMPLE_TOKEN'"}}' \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --gas-prices $GAS_PRICES \
  --gas auto \
  --gas-adjustment $GAS_ADJUSTMENT \
  --node $NODE \
  -y

# Wait for transaction to complete
sleep 5

# 3. Query config to check if token was added
echo "Checking if token was added to whitelist..."
~/Desktop/garage/xion/build/xiond query wasm contract-state smart $CONTRACT_ADDR '{"get_config":{}}' --node $NODE

# 4. Test deposit of native tokens
echo "Testing native token deposit..."
~/Desktop/garage/xion/build/xiond tx wasm execute $CONTRACT_ADDR \
  '{"deposit_token":{"token_address":"'$DENOM'","amount":"1000000"}}' \
  --amount 1000000$DENOM \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --gas-prices $GAS_PRICES \
  --gas auto \
  --gas-adjustment $GAS_ADJUSTMENT \
  --node $NODE \
  -y

# 5. Test updating admin wallet
echo "Testing config update..."
NEW_ADMIN="xion1examplenewadminwallet"
~/Desktop/garage/xion/build/xiond tx wasm execute $CONTRACT_ADDR \
  '{"update_config":{"new_admin_wallet":"'$NEW_ADMIN'"}}' \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --gas-prices $GAS_PRICES \
  --gas auto \
  --gas-adjustment $GAS_ADJUSTMENT \
  --node $NODE \
  -y

# Wait for transaction to complete
sleep 5

# Verify the config update
echo "Verifying config update..."
~/Desktop/garage/xion/build/xiond query wasm contract-state smart $CONTRACT_ADDR '{"get_config":{}}' --node $NODE

echo "=== Testing completed ==="