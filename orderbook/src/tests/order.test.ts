import request from 'supertest';
import { app } from '../index';
import { Market } from '../models/Market';
import { Order } from '../models/Order';
import { UserBalance } from '../models/UserBalance';

describe('Order API', () => {
  let marketId: string;
  let userId: string;

  beforeEach(async () => {
    // Create test market
    const market = await Market.create({
      marketId: 'test-market-1',
      question: 'Test Market',
      creator: 'creator123',
      resolutionDate: new Date('2024-12-31')
    });
    marketId = market.marketId;

    // Create test user with balance
    userId = 'test-user-1';
    await UserBalance.create({
      userId,
      availableCollateral: 1000,
      lockedCollateral: 0,
      yesTokens: 0,
      noTokens: 0
    });
  });

  describe('POST /api/order', () => {
    it('should create a buy order successfully', async () => {
      const orderData = {
        marketId,
        userId,
        side: 'BUY',
        price: 0.5,
        quantity: 10
      };

      const response = await request(app)
        .post('/api/order')
        .send(orderData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.order.side).toBe('BUY');
      expect(response.body.order.status).toBe('OPEN');
      
      // Verify order was created in database
      const order = await Order.findOne({ orderId: response.body.order.orderId });
      expect(order).toBeTruthy();
      expect(order?.quantity).toBe(10);
    });

    it('should create a sell order and lock collateral', async () => {
      const orderData = {
        marketId,
        userId,
        side: 'SELL',
        price: 0.5,
        quantity: 10
      };

      const response = await request(app)
        .post('/api/order')
        .send(orderData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify collateral was locked
      const userBalance = await UserBalance.findOne({ userId });
      expect(userBalance?.lockedCollateral).toBe(10);
      expect(userBalance?.availableCollateral).toBe(990);
    });

    it('should reject order with insufficient collateral', async () => {
      const orderData = {
        marketId,
        userId,
        side: 'SELL',
        price: 0.5,
        quantity: 2000 // More than available collateral
      };

      const response = await request(app)
        .post('/api/order')
        .send(orderData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('collateral');
    });

    it('should reject invalid price range', async () => {
      const orderData = {
        marketId,
        userId,
        side: 'BUY',
        price: 1.5, // Invalid price > 1
        quantity: 10
      };

      const response = await request(app)
        .post('/api/order')
        .send(orderData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Price out of range');
    });
  });
}); 