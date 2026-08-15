import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { readingTime } from '@/lib/utils/format';
import { slugify } from '@/lib/utils/slugify';
import { guessCategory } from '@/services/crawl/crawler';
import { parseFeedUrl, normalizeArticleUrl, type FeedItem } from './parser';
import { getCrawlUrlErrorAsync } from '@/lib/utils/url';

/**
 * Chunk size for batched writes. Prisma binds one SQL parameter per field, so
 * a very large feed is split to stay well under Postgres' parameter limit and
 * one failing chunk never loses the rest of the import.
 */
const BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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
 * - Fetches the feed and imports each item as an Article.
 * - Duplicate detection is by normalized URL — already-indexed items are
 *   skipped, so re-syncing a feed only adds genuinely new stories. Imports run
 *   in batches (one query for existing-URL detection, bulk creates, bulk topic
 *   linking) instead of one query per item.
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

  // Normalize URLs and drop items without a link/title first.
  const normalized: { item: FeedItem; url: string }[] = [];
  for (const item of feed.items) {
    if (!item.link || !item.title) {
      skipped++;
      continue;
    }
    normalized.push({ item, url: normalizeArticleUrl(item.link) });
  }

  // Deduplicate within the feed itself (the same story listed twice).
  const seenUrls = new Set<string>();
  const uniqueItems: { item: FeedItem; url: string }[] = [];
  for (const entry of normalized) {
    if (seenUrls.has(entry.url)) {
      skipped++;
      continue;
    }
    seenUrls.add(entry.url);
    uniqueItems.push(entry);
  }

  // One query learns which URLs are already indexed (was one findUnique per item).
  const existingRows = await prisma.article.findMany({
    where: { url: { in: uniqueItems.map((entry) => entry.url) } },
    select: { url: true },
  });
  const existingUrls = new Set(existingRows.map((row) => row.url));
  const newItems = uniqueItems.filter((entry) => !existingUrls.has(entry.url));
  skipped += uniqueItems.length - newItems.length;

  // Batch-create the genuinely new articles. `createMany` returns the count but
  // not the rows, so fetch the created ids afterwards for topic linking. One
  // failing chunk is counted as errors and the rest still imports.
  const createdByUrl = new Map<string, { id: string; category: string | null }>();
  for (const chunkEntries of chunk(newItems, BATCH_SIZE)) {
    try {
      const result = await prisma.article.createMany({
        data: chunkEntries.map(({ item, url }) => {
          const content = item.content || item.contentSnippet || '';
          const wordCount = content.split(/\s+/).filter(Boolean).length;
          return {
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
          };
        }),
        skipDuplicates: true,
      });
      added += result.count;
    } catch (error) {
      errors += chunkEntries.length;
      logger.warn(
        {
          sourceId,
          urls: chunkEntries.map((entry) => entry.url),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to batch-import RSS items'
      );
      continue;
    }

    // createMany does not return the created rows; fetch ids by URL. This also
    // picks up rows a concurrent import created in between, which get the same
    // topic linking.
    const createdRows = await prisma.article.findMany({
      where: { url: { in: chunkEntries.map((entry) => entry.url) } },
      select: { id: true, url: true, category: true },
    });
    for (const row of createdRows) {
      createdByUrl.set(row.url, { id: row.id, category: row.category });
    }
  }

  // Tag new articles with their category topic, batched (was N upserts).
  const categories = [
    ...new Set(
      [...createdByUrl.values()]
        .map((row) => row.category)
        .filter((category): category is string => Boolean(category))
    ),
  ];
  if (categories.length > 0) {
    const categoryBySlug = new Map(
      categories.map((category) => [slugify(category), category])
    );
    const topicSlugs = [...categoryBySlug.keys()];

    const existingTopics = await prisma.topic.findMany({
      where: { slug: { in: topicSlugs } },
      select: { id: true, slug: true },
    });
    const existingSlugs = new Set(existingTopics.map((topic) => topic.slug));
    const missingTopics = topicSlugs.filter((slug) => !existingSlugs.has(slug));
    if (missingTopics.length > 0) {
      await prisma.topic.createMany({
        data: missingTopics.map((slug) => ({
          name: categoryBySlug.get(slug) ?? slug,
          slug,
        })),
        skipDuplicates: true,
      });
    }

    const allTopics = await prisma.topic.findMany({
      where: { slug: { in: topicSlugs } },
      select: { id: true, slug: true },
    });
    const topicIdBySlug = new Map(allTopics.map((topic) => [topic.slug, topic.id]));

    const tagRows = [...createdByUrl.values()]
      .map((row) => ({
        articleId: row.id,
        topicId: row.category ? topicIdBySlug.get(slugify(row.category)) : undefined,
      }))
      .filter(
        (row): row is { articleId: string; topicId: string } => row.topicId !== undefined
      );

    if (tagRows.length > 0) {
      await prisma.articleTag.createMany({ data: tagRows, skipDuplicates: true });
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
