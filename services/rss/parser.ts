import Parser from 'rss-parser';
import { logger } from '@/lib/logger';

/**
 * Minimal RSS/Atom feed parsing built on rss-parser.
 * Feeds are fetched over HTTP (no paid API involved), so RSS import does not
 * consume the daily Firecrawl/OpenAI quotas.
 */

export interface FeedItem {
  title: string;
  link: string;
  /** Plain-text content (HTML stripped) — safe for storage and AI summarization. */
  content: string;
  contentSnippet?: string;
  author?: string;
  /** ISO 8601 publish date, when the feed provides one. */
  pubDate?: string;
  image?: string;
  categories?: string[];
}

export interface ParsedFeed {
  title: string;
  description?: string;
  link?: string;
  items: FeedItem[];
}

const USER_AGENT =
  'Mozilla/5.0 (compatible; InsightHub-RSS/1.0; +https://insighthub.app)';

/**
 * Fetch and parse an RSS/Atom feed. Throws on network or parse failures so
 * callers can surface a clear error (e.g. invalid feed URL).
 */
export async function parseFeedUrl(feedUrl: string): Promise<ParsedFeed> {
  const parser = new Parser({
    timeout: 15000,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
  });

  logger.info({ feedUrl }, 'Parsing RSS feed');

  const feed = await parser.parseURL(feedUrl);

  const items: FeedItem[] = (feed.items ?? []).map((item) => ({
    title: (item.title ?? '').trim(),
    link: (item.link ?? '').trim(),
    content: htmlToText(item.content || item['content:encoded'] || item.contentSnippet || ''),
    contentSnippet: item.contentSnippet ? htmlToText(item.contentSnippet) : undefined,
    author: item.creator || item.author || undefined,
    pubDate: item.isoDate || item.pubDate || undefined,
    image: extractImage(item),
    categories: Array.isArray(item.categories) ? item.categories.map(String) : undefined,
  }));

  return {
    title: feed.title?.trim() || 'Untitled Feed',
    description: feed.description,
    link: feed.link,
    items,
  };
}

/** Best-effort image extraction from RSS item enclosures / media tags. */
function extractImage(item: Parser.Item): string | undefined {
  const enclosure = item.enclosure as { url?: string } | undefined;
  if (enclosure?.url && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(enclosure.url)) {
    return enclosure.url;
  }
  const media = (item as unknown as { media?: { $?: { url?: string } } }).media;
  if (media?.$?.url) return media.$.url;
  return undefined;
}

/**
 * Strip HTML/XML tags and decode common entities into readable plain text.
 * Deliberately simple — RSS bodies are already well-formed HTML and we only
 * need text for storage, display and AI summarization.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize an article URL for duplicate detection: strip tracking params and
 * trailing slashes so the same story published twice in different shapes is
 * not imported twice.
 */
export function normalizeArticleUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const drop = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'mc_cid',
      'mc_eid',
      'ref',
    ];
    drop.forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    let path = url.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    url.pathname = path;
    return url.toString();
  } catch {
    return raw;
  }
}
