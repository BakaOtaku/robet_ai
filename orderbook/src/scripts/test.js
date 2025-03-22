// orderbook/src/scripts/test.js
//
// This test script simulates the following flow:
//   • Market Creation
//   • Trade 1 – Initial price setting:
//        - Trader A buys 10 YES‑Tokens at $0.50
//        - Trader B sells 10 YES‑Tokens at $0.50 (short sale: mints tokens, locks $10 collateral)
//   • Trade 2 – Additional minting at a new price:
//        - Trader C buys 5 YES‑Tokens at $0.55
//        - Trader D sells 5 YES‑Tokens at $0.55 (short sale: mints tokens, locks $5 collateral)
//   • Trade 3 – Secondary market trading:
//        - Trader B sells 5 NO‑Tokens at $0.48
//        - Trader E buys 5 NO‑Tokens at $0.48
//   • Settlement (Outcome = YES) – YES‑Token holders redeem and short positions lose collateral.

const fetch = require('node-fetch');
const nacl = require('tweetnacl');
const bs58 = require('bs58').default;
const { TextEncoder } = require('util');

const BASE_URL = 'http://localhost:3001/api';

// Generate key pairs for traders and store them in a mapping.
function generateTraderKeys(traders) {
  const traderKeys = {};
  traders.forEach(trader => {
    traderKeys[trader] = nacl.sign.keyPair();
  });
  return traderKeys;
}

const timestamp = Date.now();
const traderA = 'TraderA-' + timestamp;
const traderB = 'TraderB-' + timestamp;
const traderC = 'TraderC-' + timestamp;
const traderD = 'TraderD-' + timestamp;
const traderE = 'TraderE-' + timestamp;
const traders = [traderA, traderB, traderC, traderD, traderE];

const traderKeys = generateTraderKeys(traders);

/**
 * Helper function to sign an order message.
 * The message is constructed as:
 *   "order:{marketId}:{userId}:{side}:{price}:{quantity}:{tokenType}"
 *
 * It then returns an object containing:
 *   • chainId (set to "solana")
 *   • userWallet (public key, encoded in base58)
 *   • signature (the signature of the message, encoded in base58)
 */
function signOrder(traderId, marketId, side, price, quantity, tokenType = "YES") {
  const message = `order:${marketId}:${traderId}:${side}:${price}:${quantity}:${tokenType}`;
  const encoder = new TextEncoder();
  const messageUint8 = encoder.encode(message);
  const signatureUint8 = nacl.sign.detached(messageUint8, traderKeys[traderId].secretKey);
  return {
    chainId: "solana",
    userWallet: bs58.encode(traderKeys[traderId].publicKey),
    signature: bs58.encode(signatureUint8)
  };
}

// Helper: a small pause to ensure asynchronous operations complete
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
 A -> deposits 100 USD to contract escrow -> event emitted -> money transferred to admin EOA
 relayer reads event and calls deposit

 withdraw flow
 people call withdraw endpoint 
 funds get transferred from admin EOA to user via a simple transfer call in js
*/

async function main() {
  try {
    // Deposit an initial 100 USD for each trader.
    // With the updated deposit endpoint, this serves as both depositing funds and creating the user if needed.
    console.log('--- Depositing Initial Funds for 5 Users ---');
    for (const trader of traders) {
      const res = await fetch(`${BASE_URL}/users/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: trader, chainId: "solana", amount: 100 })
      });
      // For simplicity, we assume the deposit succeeds if no error is returned.
      console.log(`User ${trader} deposit successful.`);
    }

    // 0. Market Initialization
    console.log('--- Creating Market ---');
    const marketQuestion = "Will Bitcoin price exceed $150,000 by December 31?";
    const resolutionDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days later
    let res = await fetch(`${BASE_URL}/market`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: marketQuestion,
        creator: traderA, // let Trader A be the market creator
        resolutionDate
      })
    });
    const marketResp = await res.json();
    const market = marketResp.market;
    const marketId = market.marketId;
    console.log("Market created:", marketId, market.question);

    // 1. Trade 1 – Setting the Initial Price.
    // Trader A places a BUY order for 10 YES‑Tokens at $0.50.
    console.log('--- Trade 1: Trader A BUY 10 YES tokens at $0.50 ---');
    const orderA1 = {
      marketId,
      userId: traderA,
      side: "BUY",
      price: 0.50,
      quantity: 10,
      tokenType: "YES",
      ...signOrder(traderA, marketId, "BUY", 0.50, 10, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderA1)
    });
    const buyOrder1Response = await res.json();
    if (!buyOrder1Response.success) {
        console.error("Error placing BUY order for Trader A:", buyOrder1Response.error);
        process.exit(1);
    }
    const buyOrder1 = buyOrder1Response.order;
    console.log("Trader A BUY Order:", buyOrder1.orderId);

    // Trader B places a SELL order for 10 YES‑Tokens at $0.50 (short sale).
    console.log('--- Trade 1: Trader B SELL 10 YES tokens at $0.50 ---');
    const orderB1 = {
      marketId,
      userId: traderB,
      side: "SELL",
      price: 0.50,
      quantity: 10,
      tokenType: "YES",
      ...signOrder(traderB, marketId, "SELL", 0.50, 10, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderB1)
    });
    const sellOrder1Response = await res.json();
    if (!sellOrder1Response.success) {
        console.error("Error placing SELL order for Trader B:", sellOrder1Response.error);
        process.exit(1);
    }
    const sellOrder1 = sellOrder1Response.order;
    console.log("Trader B SELL Order:", sellOrder1.orderId);

    await sleep(500);

    // 2. Trade 2 – Additional Minting at a New Price.
    // Trader C places a BUY order for 5 YES‑Tokens at $0.55.
    console.log('--- Trade 2: Trader C BUY 5 YES tokens at $0.55 ---');
    const orderC1 = {
      marketId,
      userId: traderC,
      side: "BUY",
      price: 0.55,
      quantity: 5,
      tokenType: "YES",
      ...signOrder(traderC, marketId, "BUY", 0.55, 5, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderC1)
    });
    const buyOrder2Response = await res.json();
    if (!buyOrder2Response.success) {
        console.error("Error placing BUY order for Trader C:", buyOrder2Response.error);
        process.exit(1);
    }
    const buyOrder2 = buyOrder2Response.order;
    console.log("Trader C BUY Order:", buyOrder2.orderId);

    // Trader D places a SELL order for 5 YES‑Tokens at $0.55.
    console.log('--- Trade 2: Trader D SELL 5 YES tokens at $0.55 ---');
    const orderD1 = {
      marketId,
      userId: traderD,
      side: "SELL",
      price: 0.55,
      quantity: 5,
      tokenType: "YES",
      ...signOrder(traderD, marketId, "SELL", 0.55, 5, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderD1)
    });
    const sellOrder2Response = await res.json();
    if (!sellOrder2Response.success) {
        console.error("Error placing SELL order for Trader D:", sellOrder2Response.error);
        process.exit(1);
    }
    const sellOrder2 = sellOrder2Response.order;
    console.log("Trader D SELL Order:", sellOrder2.orderId);

    await sleep(500);

    // 3. Trade 3 – Secondary Market Trading.
    // Trader B now sells 5 NO‑Tokens at $0.48 on the secondary market.
    console.log('--- Trade 3: Trader B SELL 5 NO tokens at $0.48 ---');
    const orderB2 = {
      marketId,
      userId: traderB,
      side: "SELL",
      price: 0.48,
      quantity: 5,
      tokenType: "NO",
      ...signOrder(traderB, marketId, "SELL", 0.48, 5, "NO")
    };
    res = await fetch(`${BASE_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderB2)
    });
    const sellOrder3Response = await res.json();
    if (!sellOrder3Response.success) {
        console.error("Error placing SELL order for Trader B (secondary):", sellOrder3Response.error);
        process.exit(1);
    }
    const sellOrder3 = sellOrder3Response.order;
    console.log("Trader B Secondary SELL Order:", sellOrder3.orderId);

    // Trader E places a BUY order for 5 NO‑Tokens at $0.48.
    console.log('--- Trade 3: Trader E BUY 5 NO tokens at $0.48 ---');
    const orderE1 = {
      marketId,
      userId: traderE,
      side: "BUY",
      price: 0.48,
      quantity: 5,
      tokenType: "NO",
      ...signOrder(traderE, marketId, "BUY", 0.48, 5, "NO")
    };
    res = await fetch(`${BASE_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderE1)
    });
    const buyOrder3Response = await res.json();
    if (!buyOrder3Response.success) {
        console.error("Error placing BUY order for Trader E:", buyOrder3Response.error);
        process.exit(1);
    }
    const buyOrder3 = buyOrder3Response.order;
    console.log("Trader E BUY Order:", buyOrder3.orderId);

    await sleep(500);

    // --- Additional Test Cases ---

    // 4. Buy YES (with existing liquidity)
    console.log('--- Trade 4: Trader A BUY 5 YES tokens at $0.60 (existing liquidity) ---');
    const orderA2 = {
        marketId,
        userId: traderA,
        side: "BUY",
        price: 0.60,
        quantity: 5,
        tokenType: "YES",
        ...signOrder(traderA, marketId, "BUY", 0.60, 5, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderA2)
    });
    const buyOrder4Response = await res.json();
    if (!buyOrder4Response.success) {
        console.error("Error placing BUY order for Trader A (Trade 4):", buyOrder4Response.error);
        process.exit(1);
    }
    console.log("Trader A BUY Order (Trade 4):", buyOrder4Response.order.orderId);
    await sleep(500);


    // 5. Sell YES (short, without existing YES tokens)
    console.log('--- Trade 5: Trader C SELL 10 YES tokens at $0.60 (short) ---');
    const orderC2 = {
        marketId,
        userId: traderC,
        side: "SELL",
        price: 0.60,
        quantity: 10,
        tokenType: "YES",
        ...signOrder(traderC, marketId, "SELL", 0.60, 10, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderC2)
    });
    const sellOrder5Response = await res.json();
    if (!sellOrder5Response.success) {
        console.error("Error placing SELL order for Trader C (Trade 5):", sellOrder5Response.error);
        process.exit(1);
    }
    console.log("Trader C SELL Order (Trade 5):", sellOrder5Response.order.orderId);
    await sleep(500);

    // 6. Buy NO (with existing liquidity - from Trader B's NO tokens)
    console.log('--- Trade 6: Trader D BUY 2 NO tokens at $0.45 (existing liquidity) ---');
    const orderD2 = {
        marketId,
        userId: traderD,
        side: "BUY",
        price: 0.45,
        quantity: 2,
        tokenType: "NO",
        ...signOrder(traderD, marketId, "BUY", 0.45, 2, "NO")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderD2)
    });
    const buyOrder6Response = await res.json();
    if (!buyOrder6Response.success) {
        console.error("Error placing BUY order for Trader D (Trade 6):", buyOrder6Response.error);
        process.exit(1);
    }
    console.log("Trader D BUY Order (Trade 6):", buyOrder6Response.order.orderId);
    await sleep(500);

    // 7. Sell NO (short, without existing NO tokens)
    console.log('--- Trade 7: Trader E SELL 3 NO tokens at $0.40 (short) ---');
    const orderE2 = {
        marketId,
        userId: traderE,
        side: "SELL",
        price: 0.40,
        quantity: 3,
        tokenType: "NO",
        ...signOrder(traderE, marketId, "SELL", 0.40, 3, "NO")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderE2)
    });
    const sellOrder7Response = await res.json();
    if (!sellOrder7Response.success) {
        console.error("Error placing SELL order for Trader E (Trade 7):", sellOrder7Response.error);
        process.exit(1);
    }
    console.log("Trader E SELL Order (Trade 7):", sellOrder7Response.order.orderId);
    await sleep(500);

    // 8. Buy YES (without existing liquidity - order should remain open)
    console.log('--- Trade 8: Trader A BUY 15 YES tokens at $0.70 (no liquidity) ---');
    const orderA3 = {
        marketId,
        userId: traderA,
        side: "BUY",
        price: 0.70,
        quantity: 15,
        tokenType: "YES",
        ...signOrder(traderA, marketId, "BUY", 0.70, 15, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderA3)
    });
    const buyOrder8Response = await res.json();
    if (!buyOrder8Response.success) {
        console.error("Error placing BUY order for Trader A (Trade 8):", buyOrder8Response.error);
        process.exit(1);
    }
    console.log("Trader A BUY Order (Trade 8):", buyOrder8Response.order.orderId);
    await sleep(500);

    // 9. Sell NO (without existing liquidity - order should remain open)
    console.log('--- Trade 9: Trader B SELL 2 NO tokens at $0.30 (no liquidity) ---');
    const orderB3 = {
        marketId,
        userId: traderB,
        side: "SELL",
        price: 0.30,
        quantity: 2,
        tokenType: "NO",
        ...signOrder(traderB, marketId, "SELL", 0.30, 2, "NO")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderB3)
    });
    const sellOrder9Response = await res.json();
    if (!sellOrder9Response.success) {
        console.error("Error placing SELL order for Trader B (Trade 9):", sellOrder9Response.error);
        process.exit(1);
    }
    console.log("Trader B SELL Order (Trade 9):", sellOrder9Response.order.orderId);
    await sleep(500);

    // Check all trades for this market.
    console.log('--- Checking for Trades ---');
    res = await fetch(`${BASE_URL}/market/trades?marketId=${marketId}`);
    const tradesResp = await res.json();
    console.log("Trades executed:", JSON.stringify(tradesResp.trades, null, 2));

    // 4. Settlement: Once the event resolves, settle the market with outcome YES.
    console.log('--- Settling Market with Outcome YES ---');
    res = await fetch(`${BASE_URL}/market/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketId,
        outcome: "YES"
      })
    });
    const settlementResp = await res.json();
    console.log("Settlement response:", settlementResp);

    await sleep(500);

    // Get final balances for all traders.
    console.log('--- Final User Balances ---');
    let finalResults = {};
    for (const trader of traders) {
      res = await fetch(`${BASE_URL}/users/${trader}?chainId=solana`);
      const userResponse = await res.json();
      console.log(`${trader} balance:`, JSON.stringify(userResponse, null, 2));
      finalResults[trader] = userResponse.balance?.availableUSD;
    }

    // Manual expected balances based on the trading flow.
    const expectedBalances = {};
    expectedBalances[traderA] = 107.00;  // Correct as is
    expectedBalances[traderB] = 97.40;   // Adjust for -10 YES short
    expectedBalances[traderC] = 100.25;  // No tokens, just cash flow
    expectedBalances[traderD] = 96.85;   // Adjust for -5 YES short
    expectedBalances[traderE] = 98.50;   // NO tokens worth $0
    
    let allPassed = true;
    for (const trader of traders) {
      if (typeof finalResults[trader] !== 'number') {
        console.error(`Error: Trader ${trader} does not have a valid availableUSD value. Received: ${finalResults[trader]}`);
        allPassed = false;
        continue;
      }
      const actual = parseFloat(finalResults[trader].toFixed(2));
      const expected = expectedBalances[trader];
      if (Math.abs(actual - expected) > 0.001) {
        console.log(`Test Failed for ${trader}: expected ${expected}, got ${actual}`);
        allPassed = false;
      }
    }
    if (allPassed) {
      console.log("Test Passed: All final balances are as expected.");
    } else {
      console.log("Test Failed: Some final balances did not match expected values.");
    }
    
    console.log("Test flow completed successfully.");
  } catch (err) {
    console.error("Test script encountered an error:", err.message);
    process.exit(1);
  }
}

// Run the script
main();