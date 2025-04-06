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
const Table = require('cli-table3');
const colors = require('colors/safe');

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

// Add this map at the top of the script, after other variable declarations
const orderMap = {};

// Add these maps to track price levels by trader, after the orderMap declaration
const yesPriceLevelTraders = {};  // Maps price -> {BUY: traderId, SELL: traderId}
const noPriceLevelTraders = {};   // Maps price -> {BUY: traderId, SELL: traderId}

// Add this function to update our price level maps when orders are placed
function trackOrderPriceLevel(userId, side, price, tokenType) {
  const map = tokenType === "YES" ? yesPriceLevelTraders : noPriceLevelTraders;
  if (!map[price]) {
    map[price] = {};
  }
  map[price][side] = userId;
}

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

// Helper functions for visualization
async function displayUserBalances(traders, marketId) {
  const table = new Table({
    head: [
      colors.cyan('Trader'), 
      colors.cyan('USD Balance'), 
      colors.green('YES Tokens'), 
      colors.red('NO Tokens'),
      colors.yellow('YES Locked'),
      colors.yellow('NO Locked')
    ],
    colWidths: [12, 12, 12, 12, 12, 12]
  });

  for (const trader of traders) {
    const res = await fetch(`${BASE_URL}/users/${trader}?chainId=solana`);
    const userResponse = await res.json();
    
    if (!userResponse.success) {
      console.log(colors.red(`Error fetching balance for ${trader}: ${userResponse.error || 'Unknown error'}`));
      continue;
    }
    
    const balance = userResponse.balance || {};
    
    // Find the market-specific balance entry
    const marketBalance = balance.markets?.find(m => m.marketId === marketId);
    
    table.push([
      trader.split('-')[0], // Just show the trader name without timestamp
      balance.availableUSD?.toFixed(2) || '0.00',
      marketBalance?.yesTokens?.toString() || '0',
      marketBalance?.noTokens?.toString() || '0',
      marketBalance?.lockedCollateralYes?.toFixed(2) || '0.00',
      marketBalance?.lockedCollateralNo?.toFixed(2) || '0.00'
    ]);
  }
  
  console.log(colors.bold('\n📊 User Balances:'));
  console.log(table.toString());
}

async function displayOrderbook(marketId) {
  try {
    // Get the orderbook for YES tokens
    const resYes = await fetch(`${BASE_URL}/order/book?marketId=${marketId}&tokenType=YES`);
    const yesOrderbookResp = await resYes.json();
    
    // Get the orderbook for NO tokens
    const resNo = await fetch(`${BASE_URL}/order/book?marketId=${marketId}&tokenType=NO`);
    const noOrderbookResp = await resNo.json();
    
    if (!yesOrderbookResp.success || !noOrderbookResp.success) {
      console.log(colors.red("Error fetching orderbook:", 
        yesOrderbookResp.error || noOrderbookResp.error || "Unknown error"));
      return;
    }

    console.log(colors.bold('\n📈 Orderbook:'));
    
    // YES orderbook
    const yesTable = new Table({
      head: [
        colors.cyan('Type'), 
        colors.cyan('Price'), 
        colors.cyan('Quantity'),
        colors.cyan('Orders'),
        colors.cyan('Trader')
      ],
      colWidths: [12, 12, 12, 12, 12]
    });
    
    // Display YES buy orders (bids)
    if (yesOrderbookResp.buyLevels && yesOrderbookResp.buyLevels.length > 0) {
      yesOrderbookResp.buyLevels.forEach(level => {
        // Get trader from our price level map
        const price = level.price;
        let traderName = "Unknown";
        
        if (yesPriceLevelTraders[price] && yesPriceLevelTraders[price]["BUY"]) {
          const traderId = yesPriceLevelTraders[price]["BUY"];
          traderName = traderId.split('-')[0];
        }
        
        yesTable.push([
          colors.green('BUY YES'), 
          level.price.toFixed(2), 
          level.totalQuantity,
          level.orders,
          traderName
        ]);
      });
    }
        
    // Display YES sell orders (asks)
    if (yesOrderbookResp.sellLevels && yesOrderbookResp.sellLevels.length > 0) {
      yesOrderbookResp.sellLevels.forEach(level => {
        // Get trader from our price level map
        const price = level.price;
        let traderName = "Unknown";
        
        if (yesPriceLevelTraders[price] && yesPriceLevelTraders[price]["SELL"]) {
          const traderId = yesPriceLevelTraders[price]["SELL"];
          traderName = traderId.split('-')[0];
        }
        
        yesTable.push([
          colors.red('SELL YES'), 
          level.price.toFixed(2), 
          level.totalQuantity,
          level.orders,
          traderName
        ]);
      });
    }
    
    console.log(colors.yellow(' YES Token Orders:'));
    if ((!yesOrderbookResp.buyLevels || yesOrderbookResp.buyLevels.length === 0) && 
        (!yesOrderbookResp.sellLevels || yesOrderbookResp.sellLevels.length === 0)) {
      console.log(colors.gray(' No YES orders in the book'));
    } else {
      console.log(yesTable.toString());
      if (yesOrderbookResp.bestBid && yesOrderbookResp.bestAsk) {
        console.log(colors.cyan(` Best Bid: ${yesOrderbookResp.bestBid.toFixed(2)} | Best Ask: ${yesOrderbookResp.bestAsk.toFixed(2)} | Spread: ${yesOrderbookResp.spread?.toFixed(2) || 'N/A'}`));
      }
    }
    
    // NO orderbook
    const noTable = new Table({
      head: [
        colors.cyan('Type'), 
        colors.cyan('Price'), 
        colors.cyan('Quantity'),
        colors.cyan('Orders'),
        colors.cyan('Trader')
      ],
      colWidths: [12, 12, 12, 12, 12]
    });
    
    // Display NO buy orders (bids)
    if (noOrderbookResp.buyLevels && noOrderbookResp.buyLevels.length > 0) {
      noOrderbookResp.buyLevels.forEach(level => {
        // Get trader from our price level map
        const price = level.price;
        let traderName = "Unknown";
        
        if (noPriceLevelTraders[price] && noPriceLevelTraders[price]["BUY"]) {
          const traderId = noPriceLevelTraders[price]["BUY"];
          traderName = traderId.split('-')[0];
        }
        
        noTable.push([
          colors.green('BUY NO'), 
          level.price.toFixed(2), 
          level.totalQuantity,
          level.orders,
          traderName
        ]);
      });
    }
        
    // Display NO sell orders (asks)
    if (noOrderbookResp.sellLevels && noOrderbookResp.sellLevels.length > 0) {
      noOrderbookResp.sellLevels.forEach(level => {
        // Get trader from our price level map
        const price = level.price;
        let traderName = "Unknown";
        
        if (noPriceLevelTraders[price] && noPriceLevelTraders[price]["SELL"]) {
          const traderId = noPriceLevelTraders[price]["SELL"];
          traderName = traderId.split('-')[0];
        }
        
        noTable.push([
          colors.red('SELL NO'), 
          level.price.toFixed(2), 
          level.totalQuantity,
          level.orders,
          traderName
        ]);
      });
    }
    
    console.log(colors.yellow('\n NO Token Orders:'));
    if ((!noOrderbookResp.buyLevels || noOrderbookResp.buyLevels.length === 0) && 
        (!noOrderbookResp.sellLevels || noOrderbookResp.sellLevels.length === 0)) {
      console.log(colors.gray(' No NO orders in the book'));
    } else {
      console.log(noTable.toString());
      if (noOrderbookResp.bestBid && noOrderbookResp.bestAsk) {
        console.log(colors.cyan(` Best Bid: ${noOrderbookResp.bestBid.toFixed(2)} | Best Ask: ${noOrderbookResp.bestAsk.toFixed(2)} | Spread: ${noOrderbookResp.spread?.toFixed(2) || 'N/A'}`));
      }
    }
  } catch (error) {
    console.log(colors.red("\nError in displayOrderbook:", error.message));
  }
}

async function displayMarketStatus(marketId) {
  await displayOrderbook(marketId);
  await displayUserBalances(traders, marketId);
  console.log('\n' + colors.gray('─'.repeat(75)) + '\n');
}

async function main() {
  try {
    // Deposit an initial 100 USD for each trader.
    console.log(colors.bold.cyan('\n🚀 INITIALIZING TEST SCENARIO\n'));
    for (const trader of traders) {
      await fetch(`${BASE_URL}/users/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: trader, chainId: "solana", amount: 100 })
      });
    }
    console.log(colors.green('✓ Deposited 100 USD for each trader'));

    // 0. Market Initialization
    console.log(colors.bold.magenta('\n📊 CREATING PREDICTION MARKET\n'));
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
    console.log(colors.green(`✓ Market created: "${market.question}" (ID: ${marketId})`));
    
    // Show initial state
    await displayMarketStatus(marketId);

    // 1. Trade 1 – Setting the Initial Price.
    console.log(colors.bold.yellow('\n🔄 TRADE 1: INITIAL PRICE SETTING - $0.50\n'));
    
    // Trader A places a BUY order for 10 YES‑Tokens at $0.50.
    console.log(colors.blue('Trader A places a BUY order: 10 YES tokens @ $0.50'));
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
        console.error(colors.red("Error placing BUY order for Trader A:", buyOrder1Response.error));
        process.exit(1);
    }
    if (buyOrder1Response.order && buyOrder1Response.order.orderId) {
        orderMap[buyOrder1Response.order.orderId] = traderA;
    }
    
    // Trader A places a BUY order - after order JSON creation
    trackOrderPriceLevel(traderA, "BUY", 0.50, "YES");

    await displayMarketStatus(marketId);

    // Trader B places a SELL order for 10 YES‑Tokens at $0.50 (short sale).
    console.log(colors.blue('Trader B places a SELL order: 10 YES tokens @ $0.50 (short)'));
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
        console.error(colors.red("Error placing SELL order for Trader B:", sellOrder1Response.error));
        process.exit(1);
    }
    if (sellOrder1Response.order && sellOrder1Response.order.orderId) {
        orderMap[sellOrder1Response.order.orderId] = traderB;
    }

    // Trader B places a SELL order - after order JSON creation  
    trackOrderPriceLevel(traderB, "SELL", 0.50, "YES");

    await sleep(500);
    await displayMarketStatus(marketId);

    // 2. Trade 2 – Additional Minting at a New Price.
    console.log(colors.bold.yellow('\n🔄 TRADE 2: ADDITIONAL MINTING - $0.55\n'));
    
    // Trader C places a BUY order for 5 YES‑Tokens at $0.55.
    console.log(colors.blue('Trader C places a BUY order: 5 YES tokens @ $0.55'));
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
        console.error(colors.red("Error placing BUY order for Trader C:", buyOrder2Response.error));
        process.exit(1);
    }
    if (buyOrder2Response.order && buyOrder2Response.order.orderId) {
        orderMap[buyOrder2Response.order.orderId] = traderC;
    }
    
    // Trader C places a BUY order - after order JSON creation
    trackOrderPriceLevel(traderC, "BUY", 0.55, "YES");

    await displayMarketStatus(marketId);

    // Trader D places a SELL order for 5 YES‑Tokens at $0.55.
    console.log(colors.blue('Trader D places a SELL order: 5 YES tokens @ $0.55 (short)'));
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
        console.error(colors.red("Error placing SELL order for Trader D:", sellOrder2Response.error));
        process.exit(1);
    }
    if (sellOrder2Response.order && sellOrder2Response.order.orderId) {
        orderMap[sellOrder2Response.order.orderId] = traderD;
    }

    // Trader D places a SELL order - after order JSON creation  
    trackOrderPriceLevel(traderD, "SELL", 0.55, "YES");

    await sleep(500);
    await displayMarketStatus(marketId);

    // 3. Trade 3 – Secondary Market Trading.
    console.log(colors.bold.yellow('\n🔄 TRADE 3: SECONDARY MARKET - NO TOKEN TRADING\n'));
    
    // Trader B now sells 5 NO‑Tokens at $0.48 on the secondary market.
    console.log(colors.blue('Trader B places a SELL order: 5 NO tokens @ $0.48'));
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
        console.error(colors.red("Error placing SELL order for Trader B (secondary):", sellOrder3Response.error));
        process.exit(1);
    }
    if (sellOrder3Response.order && sellOrder3Response.order.orderId) {
        orderMap[sellOrder3Response.order.orderId] = traderB;
    }
    
    // Trader B places a SELL order for NO tokens - after order JSON creation  
    trackOrderPriceLevel(traderB, "SELL", 0.48, "NO");

    await displayMarketStatus(marketId);

    // Trader E places a BUY order for 5 NO‑Tokens at $0.48.
    console.log(colors.blue('Trader E places a BUY order: 5 NO tokens @ $0.48'));
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
        console.error(colors.red("Error placing BUY order for Trader E:", buyOrder3Response.error));
        process.exit(1);
    }
    if (buyOrder3Response.order && buyOrder3Response.order.orderId) {
        orderMap[buyOrder3Response.order.orderId] = traderE;
    }

    // Trader E places a BUY order for NO tokens - after order JSON creation
    trackOrderPriceLevel(traderE, "BUY", 0.48, "NO");

    await sleep(500);
    await displayMarketStatus(marketId);

    // --- Additional Test Cases ---
    console.log(colors.bold.yellow('\n🔄 TRADE 4: BUY YES WITH EXISTING LIQUIDITY\n'));
    console.log(colors.blue('Trader A places a BUY order: 5 YES tokens @ $0.60'));
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
        console.error(colors.red("Error placing BUY order for Trader A (Trade 4):", buyOrder4Response.error));
        process.exit(1);
    }
    if (buyOrder4Response.order && buyOrder4Response.order.orderId) {
        orderMap[buyOrder4Response.order.orderId] = traderA;
    }
    
    // Trader A places a BUY order - after order JSON creation
    trackOrderPriceLevel(traderA, "BUY", 0.60, "YES");

    await sleep(500);
    await displayMarketStatus(marketId);

    console.log(colors.bold.yellow('\n🔄 TRADE 5: SELL YES (SHORT)\n'));
    console.log(colors.blue('Trader C places a SELL order: 10 YES tokens @ $0.60 (short)'));
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
        console.error(colors.red("Error placing SELL order for Trader C (Trade 5):", sellOrder5Response.error));
        process.exit(1);
    }
    if (sellOrder5Response.order && sellOrder5Response.order.orderId) {
        orderMap[sellOrder5Response.order.orderId] = traderC;
    }
    
    // Trader C places a SELL order for YES tokens - after order JSON creation
    trackOrderPriceLevel(traderC, "SELL", 0.60, "YES");

    await sleep(500);
    await displayMarketStatus(marketId);

    console.log(colors.bold.yellow('\n🔄 TRADE 6: BUY NO WITH EXISTING LIQUIDITY\n'));
    console.log(colors.blue('Trader D places a BUY order: 2 NO tokens @ $0.45'));
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
        console.error(colors.red("Error placing BUY order for Trader D (Trade 6):", buyOrder6Response.error));
        process.exit(1);
    }
    if (buyOrder6Response.order && buyOrder6Response.order.orderId) {
        orderMap[buyOrder6Response.order.orderId] = traderD;
    }
    
    // Trader D places a BUY order for NO tokens - after order JSON creation
    trackOrderPriceLevel(traderD, "BUY", 0.45, "NO");

    await sleep(500);
    await displayMarketStatus(marketId);

    console.log(colors.bold.yellow('\n🔄 TRADE 7: SELL NO (SHORT)\n'));
    console.log(colors.blue('Trader E places a SELL order: 3 NO tokens @ $0.40 (short)'));
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
        console.error(colors.red("Error placing SELL order for Trader E (Trade 7):", sellOrder7Response.error));
        process.exit(1);
    }
    if (sellOrder7Response.order && sellOrder7Response.order.orderId) {
        orderMap[sellOrder7Response.order.orderId] = traderE;
    }
    
    // Trader E places a SELL order for NO tokens - after order JSON creation
    trackOrderPriceLevel(traderE, "SELL", 0.40, "NO");

    await sleep(500);
    await displayMarketStatus(marketId);

    console.log(colors.bold.yellow('\n🔄 TRADE 8: BUY YES (NO EXISTING LIQUIDITY)\n'));
    console.log(colors.blue('Trader A places a BUY order: 15 YES tokens @ $0.70'));
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
        console.error(colors.red("Error placing BUY order for Trader A (Trade 8):", buyOrder8Response.error));
        process.exit(1);
    }
    if (buyOrder8Response.order && buyOrder8Response.order.orderId) {
        orderMap[buyOrder8Response.order.orderId] = traderA;
    }
    
    // Trader A places a BUY order - after order JSON creation
    trackOrderPriceLevel(traderA, "BUY", 0.70, "YES");

    await sleep(500);
    await displayMarketStatus(marketId);

    console.log(colors.bold.yellow('\n🔄 TRADE 9: SELL NO (NO EXISTING LIQUIDITY)\n'));
    console.log(colors.blue('Trader B places a SELL order: 2 NO tokens @ $0.30'));
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
        console.error(colors.red("Error placing SELL order for Trader B (Trade 9):", sellOrder9Response.error));
        process.exit(1);
    }
    if (sellOrder9Response.order && sellOrder9Response.order.orderId) {
        orderMap[sellOrder9Response.order.orderId] = traderB;
    }
    
    // Trader B places a SELL order for NO tokens - after order JSON creation
    trackOrderPriceLevel(traderB, "SELL", 0.30, "NO");

    await sleep(500);
    await displayMarketStatus(marketId);

    // --- Self-Trading Test Cases ---
    console.log(colors.bold.yellow('\n🔄 TRADE 10: SELF-TRADE SETUP (YES) - A SELLS\n'));
    console.log(colors.blue('Trader A places a SELL order: 5 YES tokens @ $0.65'));
    const orderA4_sell = {
        marketId,
        userId: traderA,
        side: "SELL",
        price: 0.65,
        quantity: 5,
        tokenType: "YES",
        ...signOrder(traderA, marketId, "SELL", 0.65, 5, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderA4_sell)
    });
    const sellOrder10Response = await res.json();
    if (!sellOrder10Response.success) {
        console.error(colors.red("Error placing SELL order for Trader A (Trade 10):", sellOrder10Response.error));
        process.exit(1);
    }
    if (sellOrder10Response.order && sellOrder10Response.order.orderId) {
        orderMap[sellOrder10Response.order.orderId] = traderA;
    }
    trackOrderPriceLevel(traderA, "SELL", 0.65, "YES");

    await displayMarketStatus(marketId); // Display after sell order placed

    console.log(colors.bold.yellow('\n🔄 TRADE 11: SELF-TRADE ATTEMPT (YES) - A BUYS\n'));
    console.log(colors.blue('Trader A places a BUY order: 5 YES tokens @ $0.65'));
    const orderA4_buy = {
        marketId,
        userId: traderA,
        side: "BUY",
        price: 0.65,
        quantity: 5,
        tokenType: "YES",
        ...signOrder(traderA, marketId, "BUY", 0.65, 5, "YES")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderA4_buy)
    });
    const buyOrder11Response = await res.json();
    if (!buyOrder11Response.success) {
        console.error(colors.red("Error placing BUY order for Trader A (Trade 11):", buyOrder11Response.error));
        process.exit(1);
    }
    if (buyOrder11Response.order && buyOrder11Response.order.orderId) {
        orderMap[buyOrder11Response.order.orderId] = traderA;
    }
    trackOrderPriceLevel(traderA, "BUY", 0.65, "YES");

    await sleep(500); // Allow time for potential matching
    await displayMarketStatus(marketId); // Display after buy order placed (potential match)

    console.log(colors.bold.yellow('\n🔄 TRADE 12: SELF-TRADE SETUP (NO) - B BUYS\n'));
    console.log(colors.blue('Trader B places a BUY order: 3 NO tokens @ $0.35'));
    const orderB4_buy = {
        marketId,
        userId: traderB,
        side: "BUY",
        price: 0.35,
        quantity: 3,
        tokenType: "NO",
        ...signOrder(traderB, marketId, "BUY", 0.35, 3, "NO")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderB4_buy)
    });
    const buyOrder12Response = await res.json();
    if (!buyOrder12Response.success) {
        console.error(colors.red("Error placing BUY order for Trader B (Trade 12):", buyOrder12Response.error));
        process.exit(1);
    }
    if (buyOrder12Response.order && buyOrder12Response.order.orderId) {
        orderMap[buyOrder12Response.order.orderId] = traderB;
    }
    trackOrderPriceLevel(traderB, "BUY", 0.35, "NO");

    await displayMarketStatus(marketId); // Display after buy order placed

    console.log(colors.bold.yellow('\n🔄 TRADE 13: SELF-TRADE ATTEMPT (NO) - B SELLS\n'));
    console.log(colors.blue('Trader B places a SELL order: 3 NO tokens @ $0.35'));
    const orderB4_sell = {
        marketId,
        userId: traderB,
        side: "SELL",
        price: 0.35,
        quantity: 3,
        tokenType: "NO",
        ...signOrder(traderB, marketId, "SELL", 0.35, 3, "NO")
    };
    res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderB4_sell)
    });
    const sellOrder13Response = await res.json();
    if (!sellOrder13Response.success) {
        console.error(colors.red("Error placing SELL order for Trader B (Trade 13):", sellOrder13Response.error));
        process.exit(1);
    }
    if (sellOrder13Response.order && sellOrder13Response.order.orderId) {
        orderMap[sellOrder13Response.order.orderId] = traderB;
    }
    trackOrderPriceLevel(traderB, "SELL", 0.35, "NO");

    await sleep(500); // Allow time for potential matching
    await displayMarketStatus(marketId); // Display after sell order placed (potential match)

    // Display trades in a table
    console.log(colors.bold.magenta('\n📉 EXECUTED TRADES SUMMARY\n'));
    
    try {
      // Get YES trades
      const resYes = await fetch(`${BASE_URL}/market/trades?marketId=${marketId}&tokenType=YES`);
      const yesTradesResp = await resYes.json();
      
      // Get NO trades
      const resNo = await fetch(`${BASE_URL}/market/trades?marketId=${marketId}&tokenType=NO`);
      const noTradesResp = await resNo.json();
      
      const yesTrades = yesTradesResp.success ? yesTradesResp.trades || [] : [];
      const noTrades = noTradesResp.success ? noTradesResp.trades || [] : [];
      
      // Get all orders for the market to reference
      const resOrders = await fetch(`${BASE_URL}/order?marketId=${marketId}`);
      const ordersResp = await resOrders.json();
      const orders = ordersResp.success ? ordersResp.orders || [] : [];
      
      // Build map of order IDs to user IDs
      const orderUserMap = {};
      for (const order of orders) {
        if (order.orderId) {
          orderUserMap[order.orderId] = order.userId;
        }
      }
      
      // Helper function to extract trader name, with fallback to our locally tracked orders
      const getTraderName = (orderId, userId) => {
        if (userId) return userId.split('-')[0]; // Just extract the trader name part
        
        // Try to get from our local orderMap first (orders we tracked during test)
        const localUserId = orderMap[orderId];
        if (localUserId) return localUserId.split('-')[0];
        
        // Fall back to orders from API
        const apiUserId = orderUserMap[orderId];
        if (apiUserId) return apiUserId.split('-')[0];
        
        return 'Unknown';
      };
      
      if (yesTrades.length === 0 && noTrades.length === 0) {
        console.log(colors.yellow('No trades executed yet'));
      } else {
        // Create YES trades table
        if (yesTrades.length > 0) {
          console.log(colors.green('\n YES Token Trades:'));
          const yesTradesTable = new Table({
            head: [
              colors.cyan('ID'),
              colors.cyan('Price'),
              colors.cyan('Quantity'),
              colors.cyan('Total Value'),
              colors.cyan('Buyer'),
              colors.cyan('Seller'),
              colors.cyan('Time')
            ],
            colWidths: [8, 10, 10, 12, 12, 12, 24]
          });
          
          // Process YES trades
          yesTrades.forEach((trade, i) => {
            if (!trade) return;
            
            try {
              // Get buyer and seller names
              const buyerName = getTraderName(trade.buyOrderId, trade.buyerId);
              const sellerName = getTraderName(trade.sellOrderId, trade.sellerId);
              
              const tradeTime = trade.executedAt || trade.timestamp;
              const formattedTime = tradeTime 
                ? new Date(tradeTime).toLocaleString()
                : 'N/A';
              
              const tradeValue = trade.price * trade.quantity;
              
              yesTradesTable.push([
                i + 1,
                trade.price ? trade.price.toFixed(2) : 'N/A',
                trade.quantity || 0,
                tradeValue.toFixed(2),
                buyerName,
                sellerName,
                formattedTime
              ]);
            } catch (error) {
              console.log(colors.red(`Error processing YES trade ${i + 1}: ${error.message}`));
            }
          });
          
          console.log(yesTradesTable.toString());
        }
        
        // Create NO trades table
        if (noTrades.length > 0) {
          console.log(colors.red('\n NO Token Trades:'));
          const noTradesTable = new Table({
            head: [
              colors.cyan('ID'),
              colors.cyan('Price'),
              colors.cyan('Quantity'),
              colors.cyan('Total Value'),
              colors.cyan('Buyer'),
              colors.cyan('Seller'),
              colors.cyan('Time')
            ],
            colWidths: [8, 10, 10, 12, 12, 12, 24]
          });
          
          // Process NO trades
          noTrades.forEach((trade, i) => {
            if (!trade) return;
            
            try {
              // Get buyer and seller names
              const buyerName = getTraderName(trade.buyOrderId, trade.buyerId);
              const sellerName = getTraderName(trade.sellOrderId, trade.sellerId);
              
              const tradeTime = trade.executedAt || trade.timestamp;
              const formattedTime = tradeTime 
                ? new Date(tradeTime).toLocaleString()
                : 'N/A';
              
              const tradeValue = trade.price * trade.quantity;
              
              noTradesTable.push([
                i + 1,
                trade.price ? trade.price.toFixed(2) : 'N/A',
                trade.quantity || 0,
                tradeValue.toFixed(2),
                buyerName,
                sellerName,
                formattedTime
              ]);
            } catch (error) {
              console.log(colors.red(`Error processing NO trade ${i + 1}: ${error.message}`));
            }
          });
          
          console.log(noTradesTable.toString());
        }
      }
    } catch (error) {
      console.log(colors.red("\nError fetching trades:", error.message));
    }

    // Settlement
    console.log(colors.bold.green('\n🏁 SETTLING MARKET WITH OUTCOME: YES\n'));
    res = await fetch(`${BASE_URL}/market/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketId,
        outcome: "YES"
      })
    });
    const settlementResp = await res.json();
    if (settlementResp.success) {
      console.log(colors.green('✓ Market settled successfully'));
    } else {
      console.log(colors.red('✗ Settlement failed:', settlementResp.error));
    }

    await sleep(500);
    
    // Final balances
    console.log(colors.bold.cyan('\n🧾 FINAL SETTLEMENT RESULTS\n'));
    const finalBalancesTable = new Table({
      head: [
        colors.cyan('Trader'),
        colors.cyan('Initial USD'),
        colors.cyan('Final USD'),
        colors.cyan('Profit/Loss'),
        colors.cyan('Expected')
      ],
      colWidths: [15, 15, 15, 15, 15]
    });
    
    let finalResults = {};
    const initialAmount = 100; // All traders started with 100 USD
    
    // Expected final balances
    const expectedBalances = {};
    expectedBalances[traderA] = 109.00;
    expectedBalances[traderB] = 97.40;
    expectedBalances[traderC] = 98.25;
    expectedBalances[traderD] = 96.85;
    expectedBalances[traderE] = 98.50;
    
    let allPassed = true;
    
    for (const trader of traders) {
      res = await fetch(`${BASE_URL}/users/${trader}?chainId=solana`);
      const userResponse = await res.json();
      const finalBalance = userResponse.balance?.availableUSD || 0;
      finalResults[trader] = finalBalance;
      
      const profitLoss = finalBalance - initialAmount;
      const expected = expectedBalances[trader];
      const passedTest = Math.abs(finalBalance - expected) <= 0.01;
      
      if (!passedTest) allPassed = false;
      
      finalBalancesTable.push([
        trader.split('-')[0],
        initialAmount.toFixed(2),
        finalBalance.toFixed(2),
        profitLoss > 0
          ? colors.green('+' + profitLoss.toFixed(2))
          : colors.red(profitLoss.toFixed(2)),
        passedTest
          ? colors.green(expected.toFixed(2) + ' ✓')
          : colors.red(expected.toFixed(2) + ' ✗')
      ]);
    }
    
    console.log(finalBalancesTable.toString());
    
    if (allPassed) {
      console.log(colors.bold.green('\n✅ TEST PASSED: All final balances match expected values'));
    } else {
      console.log(colors.bold.red('\n❌ TEST FAILED: Some final balances did not match expected values'));
    }
    
    console.log(colors.bold.cyan('\n🎬 Test flow completed\n'));
  } catch (err) {
    console.error(colors.bold.red("\n❌ ERROR:", err.message));
    process.exit(1);
  }
}

// Run the script
main();