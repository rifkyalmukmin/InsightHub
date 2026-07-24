import { rateLimit, withRateLimit } from '../../lib/utils/rateLimit-prisma';
import prisma from '../../lib/db/prisma';

describe('Rate Limiting', () => {
  beforeEach(async () => {
    // Clean up any existing rate limit entries for test IPs
    await prisma.rateLimit.deleteMany({
      where: { identifier: { contains: 'test-ip' } },
    });
  });

  describe('rateLimit', () => {
    it('should allow request within limit', async () => {
      const result = await rateLimit('test-ip-1', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should block request over limit', async () => {
      await rateLimit('test-ip-2', 1, 60000);
      const result = await rateLimit('test-ip-2', 1, 60000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('withRateLimit', () => {
    it('should wrap handler and return response', async () => {
      const handler = async () => new Response('OK');
      const wrapped = withRateLimit(handler, 10, 60000);
      const response = await wrapped(new Request('http://localhost'));
      expect(response.status).toBe(200);
    });
  });
});
