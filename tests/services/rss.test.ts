import {
  htmlToText,
  normalizeArticleUrl,
  extractTitleFromHtml,
  isBetterTitle,
  parseFeedUrl,
} from '@/services/rss/parser';
import { importRssFeed } from '@/services/rss/importer';
import {
  computeNextCrawlAt,
  isAutoRefreshDue,
} from '@/lib/utils/schedule';
import prisma from '@/lib/db/prisma';
import { getCrawlUrlErrorAsync } from '@/lib/utils/url';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    newsSource: { findUnique: jest.fn(), update: jest.fn() },
    article: { findMany: jest.fn(), createMany: jest.fn(), create: jest.fn() },
    topic: { findMany: jest.fn(), createMany: jest.fn() },
    articleTag: { createMany: jest.fn() },
    crawlLog: { create: jest.fn() },
  },
}));

jest.mock('@/lib/utils/url', () => ({
  getCrawlUrlErrorAsync: jest.fn(),
}));

// Keep the real parser helpers for the existing tests, but stub out
// parseFeedUrl so the importer tests never hit the network.
jest.mock('@/services/rss/parser', () => {
  const actual = jest.requireActual('@/services/rss/parser');
  return { ...actual, parseFeedUrl: jest.fn() };
});

const mockGetCrawlUrlErrorAsync = getCrawlUrlErrorAsync as jest.Mock;
const mockParseFeedUrl = parseFeedUrl as jest.Mock;

describe('RSS parser helpers', () => {
  it('strips HTML tags and decodes entities', () => {
    const input =
      '<p>Hello <strong>world</strong> &amp; friends</p><script>alert(1)</script>';
    expect(htmlToText(input)).toBe('Hello world & friends');
  });

  it('removes scripts and styles entirely', () => {
    const input =
      '<style>.x{color:red}</style>Visible <style>p{}</style> text';
    expect(htmlToText(input)).toBe('Visible text');
  });

  it('collapses whitespace and trims', () => {
    expect(htmlToText('  <p>a   b</p>\n\n<p>c</p>  ')).toBe('a b c');
  });

  it('normalizes URLs by dropping tracking params', () => {
    const url = normalizeArticleUrl(
      'https://example.com/story/1?utm_source=twitter&utm_campaign=x&fbclid=abc#frag'
    );
    expect(url).toBe('https://example.com/story/1');
  });

  it('keeps non-tracking query params intact', () => {
    expect(normalizeArticleUrl('https://example.com/s?q=news&id=5')).toBe(
      'https://example.com/s?q=news&id=5'
    );
  });

  it('normalizes trailing slashes', () => {
    expect(normalizeArticleUrl('https://example.com/story/1/')).toBe(
      'https://example.com/story/1'
    );
  });
});

describe('RSS title extraction', () => {
  it('extracts the real headline from a heading when the feed title is generic', () => {
    const html =
      '<a href="https://example.com/a"><img src="x.jpg"/></a>' +
      '<h3><a href="https://example.com/a">Inside the scramble to save the tech sector from a power crunch</a></h3>';
    expect(extractTitleFromHtml(html, 'Tech Now')).toBe(
      'Inside the scramble to save the tech sector from a power crunch'
    );
  });

  it('keeps the feed title when the content has no headings or links', () => {
    const html = 'Meta boss Mark Zuckerberg is the latest to pen a long letter about AI.';
    expect(extractTitleFromHtml(html, 'Why tech bosses share manifestos')).toBe(
      'Why tech bosses share manifestos'
    );
  });

  it('keeps a real feed title even when the content mentions a similar heading', () => {
    const html = '<h2>Why tech bosses share manifestos about AI</h2>';
    expect(extractTitleFromHtml(html, 'Why tech bosses share manifestos about AI')).toBe(
      'Why tech bosses share manifestos about AI'
    );
  });

  it('ignores short boilerplate anchors like "Continue reading"', () => {
    const html = '<a href="https://example.com/a">Continue reading</a>';
    expect(extractTitleFromHtml(html, 'Tech Now')).toBe('Tech Now');
  });

  it('falls back when there is no HTML content', () => {
    expect(extractTitleFromHtml('', 'Untitled')).toBe('Untitled');
  });

  it('can use an image alt text when no heading or anchor is present', () => {
    const html = '<img src="x.jpg" alt="A breakthrough in fusion energy research" />';
    expect(extractTitleFromHtml(html, 'Tech Life')).toBe(
      'A breakthrough in fusion energy research'
    );
  });

  it('isBetterTitle rejects short, identical, or equal-length candidates', () => {
    expect(isBetterTitle('Real headline here', 'Tech Now')).toBe(true);
    expect(isBetterTitle('short', 'Tech Now')).toBe(false);
    expect(isBetterTitle('Tech Now', 'Tech Now')).toBe(false);
    expect(isBetterTitle('Same length title', 'Same length title')).toBe(false);
  });
});

describe('RSS importer', () => {
  beforeEach(() => {
    mockGetCrawlUrlErrorAsync.mockResolvedValue(null);
    mockParseFeedUrl.mockReset();
  });

  it('rejects sources without a feed URL', async () => {
    (prisma.newsSource.findUnique as jest.Mock).mockResolvedValue({
      id: 'src-1',
      feedUrl: null,
    });
    await expect(importRssFeed('src-1')).rejects.toThrow(
      'Source has no RSS feed URL configured'
    );
  });

  it('rejects unknown sources', async () => {
    (prisma.newsSource.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(importRssFeed('missing')).rejects.toThrow('Source not found');
  });

  it('blocks feed URLs that fail the SSRF guard', async () => {
    (prisma.newsSource.findUnique as jest.Mock).mockResolvedValue({
      id: 'src-1',
      feedUrl: 'http://169.254.169.254/latest/meta-data/',
    });
    mockGetCrawlUrlErrorAsync.mockResolvedValue('Private IP addresses are not allowed');

    await expect(importRssFeed('src-1')).rejects.toThrow(
      /Feed URL blocked \(Private IP addresses are not allowed\)/
    );
  });

  it('proceeds to parse when the feed URL passes the SSRF guard', async () => {
    (prisma.newsSource.findUnique as jest.Mock).mockResolvedValue({
      id: 'src-1',
      feedUrl: 'https://example.com/feed',
    });
    mockGetCrawlUrlErrorAsync.mockResolvedValue(null);
    mockParseFeedUrl.mockRejectedValue(new Error('network error'));

    // Guard passes → parseFeedUrl runs (and fails for a non-network reason),
    // proving the guard was not the blocker.
    await expect(importRssFeed('src-1')).rejects.toThrow('network error');
    expect(mockGetCrawlUrlErrorAsync).toHaveBeenCalledWith('https://example.com/feed');
    expect(mockParseFeedUrl).toHaveBeenCalledWith('https://example.com/feed');
  });

  it('does not call the feed parser when the SSRF guard blocks the URL', async () => {
    (prisma.newsSource.findUnique as jest.Mock).mockResolvedValue({
      id: 'src-1',
      feedUrl: 'http://169.254.169.254/latest/meta-data/',
    });
    mockGetCrawlUrlErrorAsync.mockResolvedValue('Private IP addresses are not allowed');

    await expect(importRssFeed('src-1')).rejects.toThrow();
    expect(mockParseFeedUrl).not.toHaveBeenCalled();
  });

  it('batch-imports feed items, skipping already-indexed and duplicate URLs', async () => {
    (prisma.newsSource.findUnique as jest.Mock).mockResolvedValue({
      id: 'src-1',
      feedUrl: 'https://example.com/feed',
      userId: null,
      domain: 'example.com',
      category: null,
    });
    mockParseFeedUrl.mockResolvedValue({
      title: 'Test Feed',
      items: [
        { title: 'Story A', link: 'https://example.com/a?utm_source=x', content: '<p>a</p>' },
        { title: 'AI breakthrough', link: 'https://example.com/b', content: '<p>b</p>' },
      ],
    });
    // First article.findMany (dedup) → A already indexed; second (created rows) → B
    (prisma.article.findMany as jest.Mock)
      .mockResolvedValueOnce([{ url: 'https://example.com/a' }])
      .mockResolvedValue([{ id: 'art-b', url: 'https://example.com/b', category: 'AI' }]);
    (prisma.article.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.topic.findMany as jest.Mock).mockResolvedValue([
      { id: 't1', slug: 'tech' },
      { id: 't2', slug: 'ai' },
    ]);

    const result = await importRssFeed('src-1');

    expect(result.total).toBe(2);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);

    // One batched dedup query against the normalized URLs
    expect(prisma.article.findMany).toHaveBeenNthCalledWith(1, {
      where: { url: { in: ['https://example.com/a', 'https://example.com/b'] } },
      select: { url: true },
    });
    // Only the new story is bulk-created
    expect(prisma.article.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ url: 'https://example.com/b', title: 'AI breakthrough' })],
      skipDuplicates: true,
    });
    // Topic already exists → no topic insert; tag row is bulk-created
    expect(prisma.topic.createMany).not.toHaveBeenCalled();
    expect(prisma.articleTag.createMany).toHaveBeenCalledWith({
      data: [{ articleId: 'art-b', topicId: 't2' }],
      skipDuplicates: true,
    });
    expect(prisma.crawlLog.create).toHaveBeenCalled();
    expect(prisma.newsSource.update).toHaveBeenCalled();
  });

  it('counts a failed create batch as errors without losing the feed', async () => {
    (prisma.newsSource.findUnique as jest.Mock).mockResolvedValue({
      id: 'src-1',
      feedUrl: 'https://example.com/feed',
      userId: null,
      domain: 'example.com',
      category: null,
    });
    mockParseFeedUrl.mockResolvedValue({
      title: 'Test Feed',
      items: [{ title: 'New story', link: 'https://example.com/c', content: '<p>c</p>' }],
    });
    (prisma.article.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // dedup: nothing indexed yet
      .mockResolvedValue([]);
    (prisma.article.createMany as jest.Mock).mockRejectedValue(new Error('constraint violation'));
    (prisma.article.create as jest.Mock).mockRejectedValue(new Error('insert failed'));

    const result = await importRssFeed('src-1');

    expect(result.added).toBe(0);
    expect(result.errors).toBe(1);
    // Bulk insert failed → falls back to per-item insert, which also fails;
    // the crawl log is still written so the source is not stuck mid-import.
    expect(prisma.article.create).toHaveBeenCalled();
    expect(prisma.crawlLog.create).toHaveBeenCalled();
  });
});

describe('Auto-refresh schedule helpers', () => {
  it('computes daily/weekly/monthly windows from now', () => {
    const now = new Date('2026-08-15T00:00:00Z');
    expect(computeNextCrawlAt('daily', now)?.toISOString()).toBe(
      '2026-08-16T00:00:00.000Z'
    );
    expect(computeNextCrawlAt('weekly', now)?.toISOString()).toBe(
      '2026-08-22T00:00:00.000Z'
    );
    expect(computeNextCrawlAt('monthly', now)?.toISOString()).toBe(
      '2026-09-15T00:00:00.000Z'
    );
  });

  it('returns null for disabled auto-refresh', () => {
    expect(computeNextCrawlAt('none')).toBeNull();
  });

  it('detects due sources', () => {
    const past = new Date(Date.now() - 60_000);
    expect(isAutoRefreshDue({ autoRefresh: 'daily', nextCrawlAt: past })).toBe(true);
    expect(isAutoRefreshDue({ autoRefresh: 'daily', nextCrawlAt: null })).toBe(true);
    expect(
      isAutoRefreshDue({ autoRefresh: 'daily', nextCrawlAt: new Date(Date.now() + 60_000) })
    ).toBe(false);
    expect(isAutoRefreshDue({ autoRefresh: 'none', nextCrawlAt: null })).toBe(false);
  });
});
