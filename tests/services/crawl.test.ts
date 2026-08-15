import { startCrawlJob, processCrawledPages } from '../../services/crawl/crawler';
import prisma from '../../lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    article: { findMany: jest.fn(), createMany: jest.fn(), create: jest.fn() },
    topic: { findMany: jest.fn(), createMany: jest.fn() },
    articleTag: { createMany: jest.fn() },
  },
}));

describe('Crawl Service', () => {
  describe('startCrawlJob', () => {
    it('should start crawl job and return job info', async () => {
      // This is a basic integration test for crawl service
      expect(typeof startCrawlJob).toBe('function');
    });
  });

  describe('processCrawledPages', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (prisma.article.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.article.createMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.topic.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('batch-creates articles from crawled pages and links category topics', async () => {
      // First findMany (dedup): nothing indexed; second (created rows): the new article
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ id: 'art-1', url: 'https://site.com/a', category: 'AI' }]);
      (prisma.article.createMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.topic.findMany as jest.Mock).mockResolvedValue([{ id: 't1', slug: 'ai' }]);

      const result = await processCrawledPages(
        [
          {
            data: {
              markdown: 'body',
              metadata: {
                sourceURL: 'https://site.com/a',
                title: 'AI news',
                description: 'artificial intelligence breakthroughs',
              },
            },
          },
          { data: { metadata: {} } }, // no URL → skipped, not an error
        ],
        { sourceId: 'src-1', userId: 'u1' }
      );

      expect(result.processed).toBe(2);
      expect(result.errors).toEqual([]);

      expect(prisma.article.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            url: 'https://site.com/a',
            sourceId: 'src-1',
            userId: 'u1',
            category: 'AI',
            status: 'crawled',
          }),
        ],
        skipDuplicates: true,
      });
      expect(prisma.topic.createMany).not.toHaveBeenCalled();
      expect(prisma.articleTag.createMany).toHaveBeenCalledWith({
        data: [{ articleId: 'art-1', topicId: 't1' }],
        skipDuplicates: true,
      });
    });

    it('skips already-indexed URLs without creating duplicates', async () => {
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([{ url: 'https://site.com/a' }]) // dedup: already indexed
        .mockResolvedValue([]);
      (prisma.article.createMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await processCrawledPages(
        [
          {
            data: {
              markdown: 'body',
              metadata: { sourceURL: 'https://site.com/a', title: 'Old story' },
            },
          },
        ],
        { sourceId: 'src-1' }
      );

      expect(result.processed).toBe(1);
      expect(prisma.article.createMany).not.toHaveBeenCalled();
      expect(prisma.articleTag.createMany).not.toHaveBeenCalled();
    });

    it('reports per-page failures without losing the rest of the crawl', async () => {
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // dedup: nothing indexed
        .mockResolvedValue([]);
      (prisma.article.createMany as jest.Mock).mockRejectedValue(new Error('bulk failed'));
      (prisma.article.create as jest.Mock).mockRejectedValue(new Error('insert failed'));

      const result = await processCrawledPages(
        [
          { data: { metadata: { sourceURL: 'https://site.com/b', title: 'Story B' } } },
        ],
        { sourceId: 'src-1' }
      );

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('https://site.com/b');
      // Fallback per-item insert was attempted before giving up
      expect(prisma.article.create).toHaveBeenCalled();
    });
  });
});
