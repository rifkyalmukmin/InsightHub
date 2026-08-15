import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { readingTime } from '@/lib/utils/format';
import { slugify } from '@/lib/utils/slugify';
import { guessCategory } from '@/services/crawl/crawler';
import { parseFeedUrl, normalizeArticleUrl, type FeedItem } from './parser';
import { getCrawlUrlErrorAsync } from '@/lib/utils/url';

export interface RssImportResult {
  feedTitle: string;
  total: number;
  added: number;
  skipped: number;
  errors: number;
}

/**
 * Import (or refresh) a source's RSS/Atom feed.
 *
 * - Fetches the feed and upserts each item as an Article.
 * - Duplicate detection is by normalized URL — already-indexed items are
 *   skipped, so re-syncing a feed only adds genuinely new stories.
 * - Writes a CrawlLog entry and bumps `lastCrawlAt`, mirroring the crawl
 *   pipeline so the Sources page shows consistent status.
 *
 * Runs inline (plain HTTP + DB writes, no paid APIs), so it is safe to call
 * from an API route or the worker scheduler.
 */
export async function importRssFeed(sourceId: string): Promise<RssImportResult> {
  const source = await prisma.newsSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error('Source not found');
  if (!source.feedUrl) throw new Error('Source has no RSS feed URL configured');

  // SSRF guard — the feed URL is fetched from THIS server, so block internal
  // destinations (localhost, private IPs, domains resolving to them) before
  // making the request. Static checks also run at schema level; this async
  // check additionally resolves DNS, covering DNS-based bypasses and any URL
  // stored before the schema guard existed.
  const urlError = await getCrawlUrlErrorAsync(source.feedUrl);
  if (urlError) {
    throw new Error(`Feed URL blocked (${urlError})`);
  }

  const startedAt = Date.now();
  const feed = await parseFeedUrl(source.feedUrl);

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of feed.items) {
    if (!item.link || !item.title) {
      skipped++;
      continue;
    }

    const url = normalizeArticleUrl(item.link);

    try {
      const existing = await prisma.article.findUnique({ where: { url } });
      if (existing) {
        skipped++;
        continue;
      }

      const content = item.content || item.contentSnippet || '';
      const wordCount = content.split(/\s+/).filter(Boolean).length;

      const article = await prisma.article.create({
        data: {
          sourceId,
          userId: source.userId,
          url,
          title: item.title,
          content,
          markdown: content,
          author: item.author ?? null,
          publishDate: item.pubDate ? safeDate(item.pubDate) : null,
          imageUrl: item.image ?? null,
          category: source.category ?? guessCategory(`${item.title} ${item.contentSnippet ?? ''}`),
          language: 'en',
          wordCount,
          readingTime: readingTime(wordCount),
          status: 'crawled',
        },
      });

      // Tag with the source's category so topic pages/trending include feed items
      const categoryName = article.category;
      if (categoryName) {
        const topicSlug = slugify(categoryName);
        const topic = await prisma.topic.upsert({
          where: { slug: topicSlug },
          create: { name: categoryName, slug: topicSlug },
          update: {},
        });
        await prisma.articleTag.upsert({
          where: { articleId_topicId: { articleId: article.id, topicId: topic.id } },
          create: { articleId: article.id, topicId: topic.id },
          update: {},
        });
      }

      added++;
    } catch (error) {
      errors++;
      logger.warn(
        { url, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to import RSS item'
      );
    }
  }

  const duration = (Date.now() - startedAt) / 1000;

  await prisma.crawlLog.create({
    data: {
      sourceId,
      status: added > 0 || feed.items.length === 0 ? 'success' : 'error',
      pagesCrawled: added,
      pagesTotal: feed.items.length,
      error:
        added === 0 && feed.items.length > 0
          ? 'No new articles (feed may be unchanged)'
          : errors > 0
            ? `${errors} item(s) failed to import`
            : null,
      duration,
    },
  });

  await prisma.newsSource.update({
    where: { id: sourceId },
    data: { lastCrawlAt: new Date() },
  });

  logger.info(
    { sourceId, domain: source.domain, added, skipped, errors },
    'RSS feed import completed'
  );

  return {
    feedTitle: feed.title,
    total: feed.items.length,
    added,
    skipped,
    errors,
  };
}

/** Parse a date defensively — feeds sometimes ship invalid dates. */
function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
