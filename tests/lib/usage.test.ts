import { consumeUsage, todayKey, nextResetAt, getDailyLimit } from '@/lib/utils/usage';
import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    usage: {
      upsert: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockTransaction = prisma.$transaction as jest.Mock;
const mockUpsert = prisma.usage.upsert as jest.Mock;
const mockAggregate = prisma.usage.aggregate as jest.Mock;
const mockDeleteMany = prisma.usage.deleteMany as jest.Mock;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ count: 1 });
  mockAggregate.mockResolvedValue({ _sum: { count: 0 } });
  mockDeleteMany.mockResolvedValue({ count: 0 });
  // $transaction runs the callback with a tx object exposing usage
  mockTransaction.mockImplementation(async (fn: (tx: any) => unknown) =>
    fn({
      usage: {
        upsert: mockUpsert,
        aggregate: mockAggregate,
        deleteMany: mockDeleteMany,
      },
    })
  );
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getDailyLimit', () => {
  it('uses defaults when env is not set', () => {
    expect(getDailyLimit('summarize')).toBe(20);
    expect(getDailyLimit('crawl')).toBe(5);
    expect(getDailyLimit('chat')).toBe(100);
    expect(getDailyLimit('digest')).toBe(10);
  });

  it('reads the per-type env override', () => {
    process.env.USAGE_DAILY_LIMIT_SUMMARIZE = '3';
    expect(getDailyLimit('summarize')).toBe(3);
  });
});

describe('todayKey / nextResetAt', () => {
  it('returns UTC date bucket', () => {
    expect(todayKey(new Date('2026-08-15T10:00:00Z'))).toBe('2026-08-15');
  });

  it('returns next UTC midnight as reset time', () => {
    expect(nextResetAt(new Date('2026-08-15T10:00:00Z'))).toBe('2026-08-16T00:00:00.000Z');
  });
});

describe('consumeUsage', () => {
  it('allows calls under the limit and reports remaining', async () => {
    mockUpsert.mockResolvedValue({ count: 3 });

    const result = await consumeUsage('user-1', 'summarize');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(17); // 20 - 3
    expect(result.limit).toBe(20);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_type_date: { userId: 'user-1', type: 'summarize', date: expect.any(String) } },
        update: { count: { increment: 1 } },
      })
    );
  });

  it('blocks when the per-user daily limit is exceeded', async () => {
    mockUpsert.mockResolvedValue({ count: 21 });

    const result = await consumeUsage('user-1', 'summarize');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('is unlimited when the limit is 0 and writes no row', async () => {
    process.env.USAGE_DAILY_LIMIT_SUMMARIZE = '0';

    const result = await consumeUsage('user-1', 'summarize');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('blocks when the global daily budget is exceeded', async () => {
    process.env.USAGE_GLOBAL_DAILY_BUDGET = '10';
    mockAggregate.mockResolvedValue({ _sum: { count: 11 } });

    const result = await consumeUsage('user-1', 'chat');

    expect(result.allowed).toBe(false);
  });

  it('allows when under the global daily budget', async () => {
    process.env.USAGE_GLOBAL_DAILY_BUDGET = '10';
    mockAggregate.mockResolvedValue({ _sum: { count: 9 } });

    const result = await consumeUsage('user-1', 'chat');

    expect(result.allowed).toBe(true);
  });

  it('logs a warning when approaching the limit threshold', async () => {
    process.env.USAGE_ALERT_THRESHOLD = '0.5';
    mockUpsert.mockResolvedValue({ count: 10 }); // ceil(20 * 0.5) = 10

    await consumeUsage('user-1', 'summarize');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'summarize', count: 10, limit: 20 }),
      'Daily usage quota approaching limit'
    );
  });

  it('fails open with an error log when the database errors', async () => {
    mockUpsert.mockRejectedValue(new Error('Usage table missing'));

    const result = await consumeUsage('user-1', 'summarize');

    expect(result.allowed).toBe(true); // fail open
    expect(logger.error).toHaveBeenCalled();
  });
});
