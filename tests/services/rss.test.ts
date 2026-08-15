import {
  htmlToText,
  normalizeArticleUrl,
  extractTitleFromHtml,
  isBetterTitle,
} from '@/services/rss/parser';
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
