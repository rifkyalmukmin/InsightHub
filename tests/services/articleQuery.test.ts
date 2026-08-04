import { buildArticleWhere } from '@/services/analytics/articleQuery';

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
