import { htmlToText, normalizeArticleUrl } from '@/services/rss/parser';
import { importRssFeed } from '@/services/rss/importer';
import {
  computeNextCrawlAt,
  isAutoRefreshDue,
} from '@/lib/utils/schedule';
import prisma from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    newsSource: { findUnique: jest.fn() },
  },
}));

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

describe('RSS importer', () => {
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
