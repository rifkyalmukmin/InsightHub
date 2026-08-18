import { rateLimit, withRateLimit } from '../../lib/utils/rateLimit-prisma';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    rateLimit: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/utils/rateLimit-redis', () => ({
  redisRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/utils/ip', () => ({
  getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
}));

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn().mockResolvedValue(null),
}));

import prisma from '@/lib/db/prisma';

const mockFindUnique = prisma.rateLimit.findUnique as jest.Mock;
const mockUpsert = prisma.rateLimit.upsert as jest.Mock;
const mockUpdate = prisma.rateLimit.update as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Rate Limiting', () => {
  describe('rateLimit', () => {
    it('should allow request within limit', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue({
        identifier: 'test-ip-1',
        count: 1,
        resetAt: new Date(Date.now() + 60000),
      });

      const result = await rateLimit('test-ip-1', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should block request over limit', async () => {
      const resetAt = new Date(Date.now() + 60000);
      mockFindUnique.mockResolvedValue({
        identifier: 'test-ip-2',
        count: 5,
        resetAt,
      });

      const result = await rateLimit('test-ip-2', 5, 60000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset counter when window expires', async () => {
      const expiredResetAt = new Date(Date.now() - 1000);
      mockFindUnique.mockResolvedValue({
        identifier: 'test-ip-3',
        count: 100,
        resetAt: expiredResetAt,
      });
      mockUpsert.mockResolvedValue({
        identifier: 'test-ip-3',
        count: 1,
        resetAt: new Date(Date.now() + 60000),
      });

      const result = await rateLimit('test-ip-3', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe('withRateLimit', () => {
    it('should wrap handler and return response', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue({
        identifier: 'ip:127.0.0.1',
        count: 1,
        resetAt: new Date(Date.now() + 60000),
      });

      const handler = async () => new Response('OK');
      const wrapped = withRateLimit(handler, 10, 60000);
      const response = await wrapped(new Request('http://localhost'));
      expect(response.status).toBe(200);
    });

    it('should return 429 when rate limited', async () => {
      const resetAt = new Date(Date.now() + 60000);
      mockFindUnique.mockResolvedValue({
        identifier: 'ip:127.0.0.1',
        count: 10,
        resetAt,
      });

      const handler = async () => new Response('OK');
      const wrapped = withRateLimit(handler, 10, 60000);
      const response = await wrapped(new Request('http://localhost'));
      expect(response.status).toBe(429);
    });
  });
});
