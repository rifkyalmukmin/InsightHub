import {
  withRateLimit,
  DEFAULT_USER_MAX,
  UNKNOWN_IP_MAX,
} from '@/lib/utils/rateLimit-prisma';
import prisma from '@/lib/db/prisma';
import { getToken } from 'next-auth/jwt';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    rateLimit: {
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

const mockGetToken = getToken as jest.Mock;
const mockFindUnique = prisma.rateLimit.findUnique as jest.Mock;
const mockUpsert = prisma.rateLimit.upsert as jest.Mock;

const handler = async () => new Response('OK', { status: 200 });

type RateLimitArg = { where?: { identifier: string }; create?: { identifier: string } };

/** Identifiers passed to the rate-limit store across all calls of a test. */
function seenIdentifiers(): string[] {
  const calls: RateLimitArg[] = [
    ...(mockFindUnique.mock.calls as RateLimitArg[][]),
    ...(mockUpsert.mock.calls as RateLimitArg[][]),
  ].flat();
  return calls
    .map((arg) => arg.where?.identifier ?? arg.create?.identifier)
    .filter((id): id is string => typeof id === 'string');
}

describe('withRateLimit — per-user vs per-IP budgets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    mockUpsert.mockResolvedValue({
      count: 1,
      resetAt: new Date(Date.now() + 60_000),
    });
  });

  it('keys authenticated requests by user id and applies the per-user budget', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    const wrapped = withRateLimit(handler);

    const res = await wrapped(new Request('http://localhost'));

    expect(res.status).toBe(200);
    expect(seenIdentifiers()).toContain('user:user-abc');
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(DEFAULT_USER_MAX));
  });

  it('does not use the IP bucket for authenticated requests', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    const wrapped = withRateLimit(handler);

    // No proxy headers — a bare server would resolve to 'unknown'; the user
    // must still be budgeted per-account, not by the shared unknown bucket.
    await wrapped(new Request('http://localhost'));

    const identifiers = seenIdentifiers();
    expect(identifiers).toContain('user:user-abc');
    expect(identifiers.some((id) => id.startsWith('ip:'))).toBe(false);
  });

  it('honors explicit caller limits for authenticated requests', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    const wrapped = withRateLimit(handler, 5, 60_000);

    const res = await wrapped(new Request('http://localhost'));

    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
  });

  it('applies the tightened cap when the client IP is unknown (anonymous)', async () => {
    mockGetToken.mockResolvedValue(null);
    const wrapped = withRateLimit(handler);

    const res = await wrapped(new Request('http://localhost'));

    expect(res.status).toBe(200);
    expect(seenIdentifiers()).toContain('ip:unknown');
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(UNKNOWN_IP_MAX));
  });

  it('never loosens explicit anonymous limits for the unknown bucket', async () => {
    mockGetToken.mockResolvedValue(null);
    // register-style tight budget (10/hour) must survive the unknown cap
    const wrapped = withRateLimit(handler, 10, 3_600_000);

    const res = await wrapped(new Request('http://localhost'));

    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
  });

  it('keys anonymous requests by the real IP when available', async () => {
    mockGetToken.mockResolvedValue(null);
    const wrapped = withRateLimit(handler, 10, 60_000);

    const res = await wrapped(
      new Request('http://localhost', { headers: { 'x-real-ip': '203.0.113.9' } })
    );

    expect(seenIdentifiers()).toContain('ip:203.0.113.9');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
  });

  it('falls back to anonymous (IP) limiting when JWT decode fails', async () => {
    mockGetToken.mockRejectedValue(new Error('jwt decode failed'));
    const wrapped = withRateLimit(handler);

    const res = await wrapped(new Request('http://localhost'));

    expect(res.status).toBe(200);
    expect(seenIdentifiers()).toContain('ip:unknown');
  });

  it('returns 429 with rate-limit headers when the bucket is exhausted', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    mockFindUnique.mockResolvedValue({
      count: DEFAULT_USER_MAX,
      resetAt: new Date(Date.now() + 30_000),
    });
    mockUpsert.mockResolvedValue({
      count: DEFAULT_USER_MAX,
      resetAt: new Date(Date.now() + 30_000),
    });
    const wrapped = withRateLimit(handler);

    const res = await wrapped(new Request('http://localhost'));

    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(DEFAULT_USER_MAX));
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.get('Retry-After')).not.toBeNull();
  });
});
