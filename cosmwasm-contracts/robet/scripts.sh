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


./xiond tx wasm instantiate 1848
./xiond q wasm list-contract-by-code 1848 -o json --node https://rpc.xion-testnet-1.burnt.com:443
{"contracts":["xion1j5lt8vukg0sdc6g6t4ds45s5j5nyneuw9n82u7wx2xylpah8wvaqgavly0"],"pagination":{"next_key":null,"total":"0"}}

# Create a bet
curl -X POST http://localhost:3111/create-bet \
  -H "Content-Type: application/json" \
  -d '{"description": "Will BTC reach $100k by end of 2024?", "endTime": 1703980800000}'

# Resolve a bet
curl -X POST http://localhost:3000/resolve-bet \
  -H "Content-Type: application/json" \
  -d '{"betId": 1, "outcome": true}'