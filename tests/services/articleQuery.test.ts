import { buildArticleWhere, queryArticles } from '@/services/analytics/articleQuery';
import prisma from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
    article: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    topic: {
      findFirst: jest.fn(),
    },
    articleTag: {
      findMany: jest.fn(),
    },
  },
}));

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockFindMany = prisma.article.findMany as jest.Mock;
const mockCount = prisma.article.count as jest.Mock;
const mockTopicFindFirst = prisma.topic.findFirst as jest.Mock;

function callArgs(step: number): unknown[] {
  return mockQueryRaw.mock.calls[step] as unknown[];
}

function sqlText(step: number): string {
  const strings = callArgs(step)[0] as string[];
  return strings.join('');
}

function hasSqlObject(step: number, needle: string): boolean {
  return callArgs(step).some(
    (arg) =>
      typeof arg === 'object' &&
      arg !== null &&
      'text' in (arg as Record<string, unknown>) &&
      typeof (arg as { text: unknown }).text === 'string' &&
      ((arg as { text: string }).text as string).includes(needle)
  );
}

/** True if the needle appears in the literal SQL or any interpolated Prisma.sql arg. */
function hasText(step: number, needle: string): boolean {
  return sqlText(step).includes(needle) || hasSqlObject(step, needle);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Article query builder', () => {
  it('always includes user scoping when userId provided', async () => {
    const where = await buildArticleWhere({ userId: 'user-123' });
    expect(where.isDuplicate).toBe(false);
    expect(where.OR).toEqual([{ userId: 'user-123' }, { userId: null }]);
  });

  it('adds search as AND without overwriting user scope', async () => {
    const where = await buildArticleWhere({
      userId: 'user-123',
      query: 'artificial intelligence',
    });
    expect(where.OR).toEqual([{ userId: 'user-123' }, { userId: null }]);
    expect(where.AND).toBeDefined();
    expect(Array.isArray(where.AND)).toBe(true);
  });

  it('filters by sentiment', async () => {
    const where = await buildArticleWhere({
      userId: 'user-123',
      sentiment: 'positive',
    });
    expect(where.sentiment).toBe('positive');
  });
});

describe('Full-text search (indexed tsvector)', () => {
  it('queries the searchVector column with the indonesian config', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ count: BigInt(2) }]) // count query
      .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }]); // ids query
    mockFindMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

    const result = await queryArticles({
      userId: 'user-123',
      query: 'berita teknologi',
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(2);
    expect(result.articles).toHaveLength(2);

    // Both SQL statements target the indexed column
    expect(hasText(0, 'searchVector')).toBe(true);
    expect(hasText(1, 'searchVector')).toBe(true);
    // The tsquery is built with the Indonesian config
    expect(hasText(0, 'indonesian')).toBe(true);
    expect(hasText(1, 'indonesian')).toBe(true);
    // User scoping is preserved inside the raw SQL (own + global branches)
    expect(hasText(0, 'userId')).toBe(true);
    expect(hasText(0, 'UNION ALL')).toBe(true);
  });

  it('does not use full-text search when other filters are combined', async () => {
    mockTopicFindFirst.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const result = await queryArticles({
      userId: 'user-123',
      query: 'berita',
      topic: 'teknologi',
      page: 1,
      limit: 20,
    });

    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });
});
