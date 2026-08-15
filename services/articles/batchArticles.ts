import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/utils/slugify';

/**
 * Shared batch insertion for crawled/RSS articles.
 *
 * Both the Firecrawl crawler and the RSS importer turn a list of pages/items
 * into Article rows and then tag them with a category topic. Doing that with
 * per-row queries is N+1 (findUnique + create + topic upsert + tag per row),
 * so this module centralizes the batched pipeline:
 *
 *   1. one query to learn which URLs are already indexed,
 *   2. bulk `createMany` inserts (chunked for SQL parameter safety),
 *   3. one query to fetch the created ids for topic linking,
 *   4. bulk topic creation + article-tag insertion.
 *
 * `createMany` failures fall back to per-row inserts so a single bad row never
 * loses the whole chunk; the affected URLs are reported back to the caller.
 */

export interface ArticleBatchInput {
  url: string;
  title: string;
  content: string;
  markdown?: string;
  author?: string | null;
  publishDate?: Date | null;
  imageUrl?: string | null;
  category?: string | null;
  language?: string;
  wordCount?: number | null;
  readingTime?: number | null;
}

export interface ArticleBatchContext {
  sourceId: string;
  userId?: string | null;
}

export interface ArticleBatchResult {
  /** Created (or concurrently-created) articles keyed by URL — for topic linking. */
  createdByUrl: Map<string, { id: string; category: string | null }>;
  /** URLs that were already indexed before this call. */
  existingUrls: Set<string>;
  /** Rows actually inserted by this call. */
  createdCount: number;
  /** URLs that could not be inserted (with the reason). */
  failures: { url: string; message: string }[];
}

/** Chunk size — Prisma binds one SQL parameter per field, so split large batches. */
const BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toCreateData(input: ArticleBatchInput, ctx: ArticleBatchContext) {
  return {
    sourceId: ctx.sourceId,
    userId: ctx.userId ?? null,
    url: input.url,
    title: input.title,
    content: input.content,
    markdown: input.markdown ?? null,
    author: input.author ?? null,
    publishDate: input.publishDate ?? null,
    imageUrl: input.imageUrl ?? null,
    category: input.category ?? null,
    language: input.language ?? 'en',
    wordCount: input.wordCount ?? null,
    readingTime: input.readingTime ?? null,
    status: 'crawled',
  };
}

/**
 * Batch-insert articles with duplicate protection. Duplicate URLs within the
 * input are collapsed (first wins), already-indexed URLs are skipped, and
 * genuinely new rows are bulk-inserted. Returns created rows keyed by URL
 * (for topic linking) plus counts and any per-row failures.
 */
export async function batchCreateArticles(
  inputs: ArticleBatchInput[],
  ctx: ArticleBatchContext
): Promise<ArticleBatchResult> {
  // Deduplicate within the input itself (the same story listed twice).
  const seen = new Set<string>();
  const unique: ArticleBatchInput[] = [];
  for (const input of inputs) {
    if (seen.has(input.url)) continue;
    seen.add(input.url);
    unique.push(input);
  }

  const existingRows = await prisma.article.findMany({
    where: { url: { in: unique.map((input) => input.url) } },
    select: { url: true },
  });
  const existingUrls = new Set(existingRows.map((row) => row.url));
  const newInputs = unique.filter((input) => !existingUrls.has(input.url));

  const createdByUrl = new Map<string, { id: string; category: string | null }>();
  const failures: { url: string; message: string }[] = [];
  let createdCount = 0;

  for (const chunkInputs of chunk(newInputs, BATCH_SIZE)) {
    try {
      const result = await prisma.article.createMany({
        data: chunkInputs.map((input) => toCreateData(input, ctx)),
        skipDuplicates: true,
      });
      createdCount += result.count;
    } catch (error) {
      // Bulk insert failed — fall back to per-row inserts so one bad row can't
      // lose the whole chunk; remaining failures are reported to the caller.
      logger.warn(
        {
          sourceId: ctx.sourceId,
          count: chunkInputs.length,
          err: error instanceof Error ? error.message : error,
        },
        'Bulk article insert failed — falling back to per-item inserts'
      );
      for (const input of chunkInputs) {
        try {
          await prisma.article.create({ data: toCreateData(input, ctx) });
          createdCount++;
        } catch (itemError) {
          failures.push({
            url: input.url,
            message: itemError instanceof Error ? itemError.message : 'Unknown error',
          });
        }
      }
    }

    // createMany does not return the created rows — fetch ids by URL. This also
    // picks up rows a concurrent import created in between, which get the same
    // topic linking.
    try {
      const createdRows = await prisma.article.findMany({
        where: { url: { in: chunkInputs.map((input) => input.url) } },
        select: { id: true, url: true, category: true },
      });
      for (const row of createdRows) {
        createdByUrl.set(row.url, { id: row.id, category: row.category });
      }
    } catch (error) {
      logger.warn(
        { err: error, sourceId: ctx.sourceId },
        'Failed to fetch created article ids for topic linking'
      );
    }
  }

  return { createdByUrl, existingUrls, createdCount, failures };
}

/**
 * Tag articles (by `createdByUrl`) with a topic derived from their category.
 * Missing topics are created once; tags are bulk-inserted with duplicate
 * protection. No-op when none of the articles have a category.
 */
export async function linkCategoryTopics(
  createdByUrl: Map<string, { id: string; category: string | null }>
): Promise<void> {
  const categories = [
    ...new Set(
      [...createdByUrl.values()]
        .map((row) => row.category)
        .filter((category): category is string => Boolean(category))
    ),
  ];
  if (categories.length === 0) return;

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
    .filter((row): row is { articleId: string; topicId: string } => row.topicId !== undefined);

  if (tagRows.length > 0) {
    await prisma.articleTag.createMany({ data: tagRows, skipDuplicates: true });
  }
}
