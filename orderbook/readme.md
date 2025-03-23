# Prediction Market Orderbook System

This is a comprehensive orderbook implementation for binary prediction markets, implementing a complete trading system with collateralized positions, order matching, and market settlement.

## System Overview

This orderbook system facilitates the creation and trading of binary prediction markets where participants can speculate on the outcome of future events. Each market has two possible outcomes: YES or NO.

### Key Features

- **Binary Markets**: Each market resolves to either YES (1) or NO (0).
- **Dual Token System**: Each market has both YES and NO tokens that can be traded.
- **Short Selling**: Users can sell tokens they don't own by locking collateral.
- **Collateralized Positions**: All short positions are fully collateralized to ensure system solvency.
- **Signature Verification**: Order authentication using cryptographic signatures (Solana, Xion, etc.).
- **Market Settlement**: Automatic payout distribution when markets resolve.

## Core Components

### Markets

Markets represent binary questions that will resolve to either YES or NO. Examples include:
- "Will Bitcoin price exceed $150,000 by December 31?"
- "Will Candidate X win the election?"

Each market has:
- A unique `marketId`
- Question text
- Resolution date
- Creator information
- Settlement status and outcome

### Orders

The system supports limit orders for both buying and selling YES and NO tokens:

- **BUY YES**: Buying YES tokens at specified price (0 to 1)
- **SELL YES**: Selling YES tokens (requires ownership or collateral for short selling)
- **BUY NO**: Buying NO tokens at specified price
- **SELL NO**: Selling NO tokens (requires ownership or collateral for short selling)

Order statuses include:
- **OPEN**: Initial state
- **PARTIAL**: Partially filled
- **FILLED**: Completely filled
- **CANCELLED**: Cancelled by user

### Trades

Trades occur when compatible orders match. Each trade record includes:
- `tradeId`
- `marketId`
- Buy and sell order IDs
- Execution price
- Quantity
- Timestamp

### User Balances

The system tracks:
- Available USD funds
- Token balances per market (YES and NO tokens)
- Locked collateral for short positions

## Pricing and Settlement Logic

### Pricing
- Prices range from 0 to 1 (representing 0% to 100% probability)
- For YES tokens: price represents the probability of YES outcome
- For NO tokens: price represents the probability of NO outcome 

### Settlement
When a market resolves:
1. If outcome is YES:
   - YES token holders receive $1 per token
   - NO token holders receive $0
   - Sellers of YES tokens forfeit locked collateral
   - Sellers of NO tokens receive back their locked collateral
   
2. If outcome is NO:
   - NO token holders receive $1 per token
   - YES token holders receive $0
   - Sellers of NO tokens forfeit locked collateral
   - Sellers of YES tokens receive back their locked collateral

## Short Selling Mechanism

The system allows users to sell tokens they don't own through short selling:

1. When short selling YES tokens:
   - User locks $1 collateral per token sold
   - System mints YES tokens to deliver to buyer
   - System also mints NO tokens to credit to seller
   
2. When short selling NO tokens:
   - User locks $1 collateral per token sold
   - System mints NO tokens to deliver to buyer
   - System also mints YES tokens to credit to seller

This ensures that all positions are fully collateralized.

## Complete Orderbook Flow

### 1. Order Placement and Collateral Management

When a new order is submitted:

```
Client → Order Signature → API → Collateral Check → Orderbook → Matching Engine
```

**For SELL Orders:**
- System checks if the user owns enough tokens to sell
- If insufficient tokens (short selling):
  ```typescript
  // Example for SELL YES orders
  const ownedYes = marketBalance.yesTokens;
  if (quantity > ownedYes) {
    const shortAmount = quantity - ownedYes;
    const requiredCollateral = shortAmount; // $1 per token
    
    // Lock collateral
    userBalance.availableUSD -= requiredCollateral;
    marketBalance.lockedCollateralYes += requiredCollateral;
  }
  ```

**For BUY Orders:**
- No immediate collateral is locked
- Payment happens during order execution

### 2. Order Matching Process

When matching orders, the system follows this sequence:

1. **Find Matching Orders**: Query the most favorable opposing orders
2. **Calculate Fill Quantity**: Determine how much can be matched
3. **Execute Trade**: Process the transaction at the resting order's price
4. **Update Order Status**: Mark as FILLED or PARTIAL
5. **Repeat**: Continue matching until no more matches or order is filled

### 3. Partial Order Execution

The flow for partial fills:
```
Incoming Order → Partial Match → Update filledQuantity → Update Status → Continue Matching
```

Partial filling example:
```
Order A: BUY 10 YES @ $0.60 (incoming)
Order B: SELL 3 YES @ $0.55 (resting)
Order C: SELL 4 YES @ $0.57 (resting)

Execution sequence:
1. Match A with B: 3 tokens filled at $0.55, A becomes PARTIAL (3/10 filled)
2. Match A with C: 4 tokens filled at $0.57, A becomes PARTIAL (7/10 filled)
3. Order A remains in orderbook with 3 tokens unfilled
```

The system maintains order book integrity by:
- Preserving order timestamp priority during partial fills
- Only updating the `filledQuantity` field, not creating new orders
- Automatically resuming matching when new opposing orders arrive

### 4. Token Delivery and Payment

For each match, the `executeTrade` function handles:

1. **Payment Transfer**: Buyer pays seller (price × quantity)
2. **Token Transfer**: Using one of two methods:
   - **Direct transfer**: If seller has sufficient tokens
   - **Minting**: If short selling, the system mints tokens

```typescript
// Payment flow
buyerBal.availableUSD -= totalCost;
sellerBal.availableUSD += totalCost;

// Token delivery flow with potential minting
if (tokenType === "YES") {
  if (sellerMarket.yesTokens >= quantity) {
    // Direct transfer
    sellerMarket.yesTokens -= quantity;
    buyerMarket.yesTokens += quantity;
  } else {
    // Short sale with minting
    const available = sellerMarket.yesTokens;
    const shortAmount = quantity - available;
    
    // Use available tokens first
    sellerMarket.yesTokens = 0;
    buyerMarket.yesTokens += available;
    
    // Mint additional tokens
    buyerMarket.yesTokens += shortAmount;
    sellerMarket.noTokens += shortAmount;
  }
}
```

### 5. Refund Mechanism

The system implements different types of refunds:

**Collateral Refund At Settlement:**
- Collateral is automatically refunded during settlement if the market outcome favors the short seller:
  ```typescript
  if (outcome === "YES") {
    // YES token holders get paid
    ub.availableUSD += m.yesTokens;
    
    // Refund collateral from SELL NO orders
    ub.availableUSD += m.lockedCollateralNo;
    
    // Collateral from SELL YES orders is forfeited
  } else {
    // outcome === "NO"
    // NO token holders get paid
    ub.availableUSD += m.noTokens;
    
    // Refund collateral from SELL YES orders
    ub.availableUSD += m.lockedCollateralYes;
    
    // Collateral from SELL NO orders is forfeited
  }
  ```

**Order Cancellation Refunds:**
- When a user cancels an unfilled order, any locked collateral is refunded
- For partially filled orders, collateral is proportionally refunded

### 6. Settlement Service

The settlement service (`settlementService.ts`) handles market resolution:

1. **Settlement Initiation**:
   ```typescript
   await settleMarket(marketId, outcome); // outcome is "YES" or "NO"
   ```

2. **User Balance Processing**:
   - System finds all users with positions in the market
   - Processes each user's balance based on outcome

3. **Token Redemption Logic**:
   - Winning token holders receive $1 per token
   - Opposing token holders receive $0
   - Collateral is either refunded or forfeited

4. **Handling Unmatched Orders**:
   - All open/partial orders are automatically cancelled
   - For SELL orders with locked collateral:
     ```typescript
     // For unmatched SELL YES orders when outcome is NO
     if (outcome === "NO") {
       // Find all open SELL YES orders
       const openSellYesOrders = await Order.find({
         marketId,
         side: "SELL",
         tokenType: "YES",
         status: { $in: ["OPEN", "PARTIAL"] }
       });
       
       // For each order, refund unused collateral proportionally
       for (const order of openSellYesOrders) {
         const unusedQty = order.quantity - order.filledQuantity;
         if (unusedQty > 0) {
           // Get user balance
           const userBal = await UserBalance.findOne({ userId: order.userId });
           const marketBal = userBal.markets.find(m => m.marketId === marketId);
           
           // Refund collateral
           const refundAmount = unusedQty; // $1 per token
           userBal.availableUSD += refundAmount;
           marketBal.lockedCollateralYes -= refundAmount;
           
           await userBal.save();
           
           // Mark order as cancelled
           order.status = "CANCELLED";
           await order.save();
         }
       }
     }
     
     // Similar logic for unmatched SELL NO orders when outcome is YES
     ```
   - For BUY orders: simply marked as cancelled with no financial impact

5. **Market Status Update**:
   ```typescript
   market.outcome = outcome;
   market.settled = true;
   await market.save();
   ```

## Order Matching Logic

### Partial Order Execution

The system supports partial order execution, allowing orders to be filled incrementally:

1. **PARTIAL Status**: When an order is partially filled, its status changes to "PARTIAL" and it remains in the orderbook.
2. **Fill Tracking**: Each order tracks both total quantity and filled quantity:
   ```typescript
   {
     quantity: number,      // Total order size
     filledQuantity: number // Amount already executed
   }
   ```
3. **Remaining Quantity**: The system uses (quantity - filledQuantity) to determine how much of an order is still available for matching.
4. **Priority Preservation**: Partially filled orders maintain their original timestamp priority in the orderbook.

### Order Matching Algorithm

The matching engine implements a price-time priority algorithm:

1. **Opposing Side Selection**: For incoming BUY orders, match against SELL orders and vice versa.

2. **Price Filtering**:
   - For BUY orders: Find SELL orders with price <= buy price
   - For NO tokens: Sort prices in opposite direction (best NO price = highest, not lowest)

3. **Sort Order**:
   ```typescript
   // For BUY orders (finding SELL orders)
   sortOption = { price: 1, createdAt: 1 }; // Ascending price, oldest first
   
   // For SELL orders (finding BUY orders)
   sortOption = { price: -1, createdAt: 1 }; // Descending price, oldest first
   ```

4. **Matching Loop**:
   ```typescript
   while (remainingQty > 0 && stillMatchingOrders) {
     // Find best opposing order
     const bestOpposingOrder = await findBestOrder(
       marketId, oppositeSide, tokenType, priceFilter, sortOption
     );
     
     if (!bestOpposingOrder) break;
     
     // Calculate match quantity
     const availableQty = bestOpposingOrder.quantity - bestOpposingOrder.filledQuantity;
     const matchQty = Math.min(remainingQty, availableQty);
     
     // Execute the trade at the opposing order's price (price-time priority)
     const executionPrice = bestOpposingOrder.price;
     
     // Update both orders
     incomingOrder.filledQuantity += matchQty;
     bestOpposingOrder.filledQuantity += matchQty;
     
     // Update order statuses
     incomingOrder.status = incomingOrder.filledQuantity === incomingOrder.quantity ? "FILLED" : "PARTIAL";
     bestOpposingOrder.status = bestOpposingOrder.filledQuantity === bestOpposingOrder.quantity ? "FILLED" : "PARTIAL";
     
     // Create trade record and execute balance transfers
     await createTradeRecord(tradeId, marketId, buyOrderId, sellOrderId, executionPrice, matchQty);
     await executeTrade(buyerId, sellerId, marketId, tokenType, executionPrice, matchQty);
     
     // Update remaining quantity
     remainingQty -= matchQty;
   }
   ```

5. **Token Delivery Options**:
   - **Direct Transfer**: If seller has sufficient tokens, transfer directly
   - **Short-Sale Minting**: If seller lacks tokens, mint new tokens through short-selling mechanism
   ```typescript
   // Example from executeTrade function
   if (tokenType === "YES") {
     if (sellerMarket.yesTokens >= quantity) {
       // Direct transfer
       sellerMarket.yesTokens -= quantity;
       buyerMarket.yesTokens += quantity;
     } else {
       // Short sale
       const available = sellerMarket.yesTokens;
       const shortAmount = quantity - available;
       
       // Transfer available tokens
       sellerMarket.yesTokens -= available;
       buyerMarket.yesTokens += available;
       
       // Mint remainder
       buyerMarket.yesTokens += shortAmount;
       sellerMarket.noTokens += shortAmount;  // Short-seller gets opposing tokens
     }
   }
   ```

## Price-Quantity-Time Priority

The system combines multiple priority factors:

1. **Price Priority**: 
   - For BUY orders: Higher bids match first
   - For SELL orders: Lower asks match first
   
2. **Quantity Impact**: 
   - Large orders may match against multiple smaller orders
   - Small orders may partially fill larger orders
   
3. **Time Priority**: 
   - Between equal-priced orders, earlier orders match first
   - Partially filled orders retain their original timestamp

## API Endpoints

### Market Endpoints
- `POST /api/market`: Create a new market
- `GET /api/market/all`: Get all markets with statistics
- `GET /api/market/active`: Get all active markets
- `GET /api/market/:marketId`: Get a specific market
- `GET /api/market/trades`: Get trades for a market
- `POST /api/market/settle`: Settle a market with outcome

### Order Endpoints
- `POST /api/order`: Place a new order
- `GET /api/order`: Get orders for a market

### User Endpoints
- `GET /api/users/:userId`: Get user balance
- `POST /api/users/deposit`: Deposit funds
- `POST /api/users/withdraw`: Withdraw funds

## Development and Testing

To run the test script that simulates market creation, trading, and settlement:

```
node src/scripts/test.js
```

This script creates a market and executes a series of trades between multiple traders, then settles the market to verify correct balance calculations.