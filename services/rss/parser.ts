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

  const items: FeedItem[] = (feed.items ?? []).map((item) => {
    const contentHtml = item.content || item['content:encoded'] || '';
    return {
      title: extractTitleFromHtml(contentHtml, (item.title ?? '').trim()),
      link: (item.link ?? '').trim(),
      content: htmlToText(contentHtml || item.contentSnippet || ''),
      contentSnippet: item.contentSnippet ? htmlToText(item.contentSnippet) : undefined,
      author: item.creator || item.author || undefined,
      pubDate: item.isoDate || item.pubDate || undefined,
      image: extractImage(item),
      categories: Array.isArray(item.categories) ? item.categories.map(String) : undefined,
    };
  });

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
 * Best-effort title extraction.
 *
 * Some feeds (e.g. BBC live sections) publish items whose `<title>` is a
 * generic section label ("Tech Now", "Tech Life") while the actual headline
 * lives inside the description HTML as a heading or link. When that happens
 * we prefer the more specific text from the content over the generic title.
 *
 * Candidates are taken in priority order: first heading (h1–h6), first anchor
 * text, then the first image `alt` — BBC items embed the headline in all
 * three. A candidate only wins if it is meaningfully longer than the feed
 * title, so real feed titles are never replaced by short boilerplate.
 */
export function extractTitleFromHtml(html: string, fallback: string): string {
  if (!html) return fallback;

  const heading = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const anchor = html.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  const imageAlt = html.match(/<img[^>]*\s+alt\s*=\s*["']([^"']+)["']/i);

  const candidates = [
    heading?.[1] ?? '',
    anchor?.[1] ?? '',
    imageAlt?.[1] ?? '',
  ].map((raw) => htmlToText(raw));

  for (const candidate of candidates) {
    if (isBetterTitle(candidate, fallback)) return candidate;
  }

  return fallback;
}

/** Common link labels that appear in descriptions but are never headlines. */
const BOILERPLATE_TITLES = [
  'continue reading',
  'read more',
  'read full story',
  'full story',
  'keep reading',
  'learn more',
  'view more',
  'click here',
];

/**
 * True when `candidate` is a more specific headline than the feed title —
 * long enough to be a real headline, not boilerplate link text, and clearly
 * longer than the generic section label it would replace.
 */
export function isBetterTitle(candidate: string, fallback: string): boolean {
  const c = candidate.trim();
  const f = fallback.trim();
  if (c.length < 12) return false;
  const cLower = c.toLowerCase();
  if (BOILERPLATE_TITLES.some((label) => cLower === label || cLower.startsWith(`${label} `))) {
    return false;
  }
  if (f.length === 0) return c.length > 0;
  if (cLower === f.toLowerCase()) return false;
  return c.length > f.length + 3;
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
