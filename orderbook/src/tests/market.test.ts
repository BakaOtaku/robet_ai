import request from 'supertest';
import { app } from '../index';
import { Market } from '../models/Market';

describe('Market API', () => {
  describe('POST /api/market', () => {
    it('should create a new market', async () => {
      const marketData = {
        question: 'Will BTC reach 100k in 2024?',
        creator: 'creator123',
        resolutionDate: new Date('2024-12-31')
      };

      const response = await request(app)
        .post('/api/market')
        .send(marketData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.market.question).toBe(marketData.question);
      expect(response.body.market.creator).toBe(marketData.creator);
      
      // Verify market was created in database
      const market = await Market.findOne({ marketId: response.body.market.marketId });
      expect(market).toBeTruthy();
      expect(market?.question).toBe(marketData.question);
    });

    it('should reject invalid market data', async () => {
      const invalidMarket = {
        // Missing required fields
        creator: 'creator123'
      };

      const response = await request(app)
        .post('/api/market')
        .send(invalidMarket)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
}); 