// ... existing code ...

// Helper: small pause
const BASE_URL = 'http://localhost:3001/api';
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async function main() {
    try {
      // 1. Create two users: Alice, Bob
      console.log('--- Creating users ---');
      let aliceId = 'Alice-' + Date.now();
      let bobId = 'Bob-' + Date.now();
  
      // Create users using fetch
      await fetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: aliceId, initialUSD: 100 })
      });
      await fetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: bobId, initialUSD: 100 })
      });
      console.log('Created Alice and Bob with 100 USD each');
  
      // 2. Create a new market
      console.log('--- Creating market ---');
      let res = await fetch(`${BASE_URL}/market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Will Team X win the championship?',
          creator: aliceId,
          resolutionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      });
      let market = (await res.json()).market;
      let marketId = market.marketId;
      console.log('Created market:', marketId, market.question);
  
      // 3. Place a BUY order from Alice
      console.log('--- Placing BUY order for Alice ---');
      res = await fetch(`${BASE_URL}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId,
          userId: aliceId,
          side: 'BUY',
          price: 0.6,
          quantity: 10
        })
      });
      let buyOrder = (await res.json()).order;
      console.log(buyOrder);
      console.log('Alice BUY order created:', buyOrder.orderId);
  
      // 4. Place a SELL order from Bob
      console.log('--- Placing SELL (short) order for Bob ---');
      res = await fetch(`${BASE_URL}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId,
          userId: bobId,
          side: 'SELL',
          price: 0.6,
          quantity: 10
        })
      });
      let sellOrder = (await res.json()).order;
      console.log('Bob SELL order created:', sellOrder.orderId);
  
      // 5. Check trades
      console.log('--- Checking for trades ---');
      await sleep(1000);
      res = await fetch(`${BASE_URL}/market/trades?marketId=${marketId}`);
      let trades = (await res.json()).trades;
      console.log(trades);
      if (!trades || trades.length === 0) {
        throw new Error('No trades found, but we expected a match!');
      }
      console.log('Trades found:', JSON.stringify(trades, null, 2));
  
      // 6. Settle market
      console.log('--- Settling market as YES ---');
      await sleep(1000);
      res = await fetch(`${BASE_URL}/market/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId,
          outcome: 'YES'
        })
      });
      console.log('Settlement response:', await res.json());
  
      // 7. Check final balances
      console.log('--- Checking final user balances ---');
      let aliceBal = await (await fetch(`${BASE_URL}/users/${aliceId}`)).json();
      let bobBal = await (await fetch(`${BASE_URL}/users/${bobId}`)).json();
  
      console.log('Alice final balance:', JSON.stringify(aliceBal, null, 2));
      console.log('Bob final balance:', JSON.stringify(bobBal, null, 2));
  
      // ... existing code ...
    } catch (err) {
      console.error('Test script encountered an error:', err.message);
      process.exit(1);
    }
  }
  
  // Run the script
  main();