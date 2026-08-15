import { findSimilarArticles } from '@/services/analytics/similar';
import prisma from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    article: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockFindUnique = prisma.article.findUnique as jest.Mock;
const mockFindMany = prisma.article.findMany as jest.Mock;

function candidate(id: string, title: string, category: string, topicIds: string[]) {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
    imageUrl: null,
    category,
    createdAt: new Date(),
    publishDate: null,
    source: { name: 'Example', domain: 'example.com' },
    tags: topicIds.map((topicId) => ({ topicId })),
    summary: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Similar article detection', () => {
  it('ranks overlapping titles above unrelated articles', async () => {
    mockFindUnique.mockResolvedValue({
      title: 'OpenAI launches GPT-5 model',
      category: 'AI',
      tags: [{ topicId: 'topic-ai' }],
    });
    mockFindMany.mockResolvedValue([
      candidate(
        'a1',
        'OpenAI launches new GPT-5 model pricing',
        'AI',
        ['topic-ai']
      ),
      candidate('a2', 'Indonesia raises interest rates', 'Finance', ['topic-finance']),
    ]);

    const results = await findSimilarArticles('base-1', 5);

    expect(results).toHaveLength(1);
    expect(results[0].article.id).toBe('a1');
    expect(results[0].score).toBeGreaterThan(0.5);
    expect(results[0].sharedTopics).toBe(1);
  });

  it('returns an empty list when no candidates match', async () => {
    mockFindUnique.mockResolvedValue({
      title: 'OpenAI launches GPT-5 model',
      category: 'AI',
      tags: [{ topicId: 'topic-ai' }],
    });
    mockFindMany.mockResolvedValue([
      candidate('a2', 'Indonesia raises interest rates', 'Finance', ['topic-finance']),
    ]);

    const results = await findSimilarArticles('base-1', 5);
    expect(results).toHaveLength(0);
  });

  it('returns an empty list when the article does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);
    const results = await findSimilarArticles('missing', 5);
    expect(results).toHaveLength(0);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
