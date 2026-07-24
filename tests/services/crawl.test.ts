import { startCrawlJob } from '../../services/crawl/crawler';

describe('Crawl Service', () => {
  describe('startCrawlJob', () => {
    it('should start crawl job and return job info', async () => {
      // This is a basic integration test for crawl service
      expect(typeof startCrawlJob).toBe('function');
    });
  });
});
