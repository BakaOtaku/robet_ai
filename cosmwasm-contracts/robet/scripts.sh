./xiond tx wasm instantiate 1848 \
'{"manager": "xion1s64d43m6426hc0tdy0g7wnwpua70yc9an3pdup"}' \
--from test \
--label "robet2" \
--admin "xion1s64d43m6426hc0tdy0g7wnwpua70yc9an3pdup" \
--gas auto \
--gas-adjustment 1.3 \
--node https://rpc.xion-testnet-1.burnt.com:443 \
--chain-id xion-testnet-1 \
-y

~/Desktop/garage/xion/build/xiond tx wasm store artifacts/robet.wasm --from test --chain-id xion-testnet-1 --gas-prices 0.025uxion --gas auto --gas-adjustment 1.3 --node https://rpc.xion-testnet-1.burnt.com:443 -y
~/Desktop/garage/xion/build/xiond tx wasm instantiate 2097 '{"admin_wallet":"xion14vu4xu668pu7pavxtpr84mp5ywzh4y2wu72yhl"}' --from test --label "robet_v1.0.0" --gas auto --gas-adjustment 1.3 --node https://rpc.xion-testnet-1.burnt.com:443 -y --admin xion14vu4xu668pu7pavxtpr84mp5ywzh4y2wu72yhl --chain-id xion-testnet-1
~/Desktop/garage/xion/build/xiond q tx 56271F5524B615D091159C6A5F4D521FC9C559135D05E9018FE95A49C3B79AAD --node https://rpc.xion-testnet-1.burnt.com:443

address=xion1n4drepnpj8qhme9qrr0kpv7490yf6ugqq4wj0ax7l0ljp3gfjfpq5elvys
# Create a bet
curl -X POST http://localhost:3111/create-bet \
  -H "Content-Type: application/json" \
  -d '{"description": "Will BTC reach $100k by end of 2024?", "endTime": 1703980800000}'

# Resolve a bet
curl -X POST http://localhost:3000/resolve-bet \
  -H "Content-Type: application/json" \
  -d '{"betId": 1, "outcome": true}'