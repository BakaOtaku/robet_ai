import { Order } from '../models/Order';
import { UserBalance } from '../models/UserBalance';
import { Trade } from '../models/Trade';
import { matchOrders } from '../services/matchingEngine';

describe.only('Matching Engine', () => {
  const marketId = 'test-market-1';
  const buyer = 'buyer123';
  const seller = 'seller123';

  beforeEach(async () => {
    // Setup test users with balances
    await UserBalance.create({
      userId: buyer,
      availableCollateral: 1000,
      lockedCollateral: 0,
      yesTokens: 0
    });

    await UserBalance.create({
      userId: seller,
      availableCollateral: 1000,
      lockedCollateral: 0,
      yesTokens: 0
    });
  });

  it.only('should match compatible orders', async () => {
    // Create a sell order first
    const sellOrder = await Order.create({
      orderId: 'sell1',
      marketId,
      userId: seller,
      side: 'SELL',
      price: 0.5,
      quantity: 10,
      filledQuantity: 0,
      status: 'OPEN'
    });

    // Verify sell order was created correctly
    expect(sellOrder.status).toBe('OPEN');
    expect(sellOrder.filledQuantity).toBe(0);

    // Create and match a buy order
    const buyOrder = await Order.create({
      orderId: 'buy1',
      marketId,
      userId: buyer,
      side: 'BUY',
      price: 0.5,
      quantity: 10,
      filledQuantity: 0,
      status: 'OPEN'
    });

    // Verify buy order was created correctly
    expect(buyOrder.status).toBe('OPEN');
    expect(buyOrder.filledQuantity).toBe(0);

    await matchOrders(buyOrder);

    // Verify orders were matched
    const updatedBuyOrder = await Order.findOne({ orderId: 'buy1' });
    const updatedSellOrder = await Order.findOne({ orderId: 'sell1' });
    
    expect(updatedBuyOrder?.status).toBe('FILLED');
    expect(updatedSellOrder?.status).toBe('FILLED');
    expect(updatedBuyOrder?.filledQuantity).toBe(10);

    // Verify trade was created
    const trade = await Trade.findOne({ 
      buyOrderId: 'buy1',
      sellOrderId: 'sell1'
    });
    expect(trade).toBeTruthy();
    expect(trade?.quantity).toBe(10);
    expect(trade?.price).toBe(0.5);

    // Verify balances were updated
    const buyerBalance = await UserBalance.findOne({ userId: buyer });
    const sellerBalance = await UserBalance.findOne({ userId: seller });

    expect(buyerBalance?.yesTokens).toBe(10);
    expect(sellerBalance?.lockedCollateral).toBe(10);
    expect(buyerBalance?.availableCollateral).toBe(995); // 1000 - (0.5 * 10)
    expect(sellerBalance?.availableCollateral).toBe(1005); // 1000 + (0.5 * 10)
  });

  it('should handle partial matches', async () => {
    // Create a sell order for 10 units
    const sellOrder = await Order.create({
      orderId: 'sell1',
      marketId,
      userId: seller,
      side: 'SELL',
      price: 0.5,
      quantity: 10,
      filledQuantity: 0,
      status: 'OPEN'
    });

    // Verify initial sell order state
    expect(sellOrder.status).toBe('OPEN');
    expect(sellOrder.quantity).toBe(10);
    expect(sellOrder.filledQuantity).toBe(0);

    // Create a buy order for 6 units
    const buyOrder = await Order.create({
      orderId: 'buy1',
      marketId,
      userId: buyer,
      side: 'BUY',
      price: 0.5,
      quantity: 6,
      filledQuantity: 0,
      status: 'OPEN'
    });

    // Verify initial buy order state
    expect(buyOrder.status).toBe('OPEN');
    expect(buyOrder.quantity).toBe(6);
    expect(buyOrder.filledQuantity).toBe(0);

    await matchOrders(buyOrder);

    const updatedBuyOrder = await Order.findOne({ orderId: 'buy1' });
    const updatedSellOrder = await Order.findOne({ orderId: 'sell1' });

    expect(updatedBuyOrder).toBeTruthy();
    expect(updatedSellOrder).toBeTruthy();
    
    expect(updatedBuyOrder?.status).toBe('FILLED');
    expect(updatedSellOrder?.status).toBe('PARTIAL');
    expect(updatedSellOrder?.filledQuantity).toBe(6);
    
    if (updatedSellOrder) {
      expect(updatedSellOrder.quantity - updatedSellOrder.filledQuantity).toBe(4);
    }
  });
});

describe('Other Tests', () => {
  // ... tests ...
}); 