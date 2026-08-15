import { CrawlOptions } from '../firecrawl/client';
import prisma from '@/lib/db/prisma';
import { enqueueCrawlJob } from '@/lib/utils/jobQueue';
import {
  batchCreateArticles,
  linkCategoryTopics,
  type ArticleBatchInput,
} from '@/services/articles/batchArticles';

export async function startCrawlJob(options: CrawlOptions & { sourceId: string; userId?: string }): Promise<{
  jobId: string;
  logId: string;
}> {
  const { url, sourceId, maxPages = 10, depth = 1 } = options;

  // Create crawl log
  const log = await prisma.crawlLog.create({
    data: {
      sourceId,
      status: 'running',
      depth,
    },
  });

  try {
    // Enqueue job for background processing (persistent queue). Processing is
    // done by the worker (`npm run worker`) — deliberately NOT fire-and-forget
    // here: on serverless (Vercel) an un-awaited task is killed once the
    // response is sent, which would leave the job stuck in "running" forever.
    // Jobs abandoned by a crashed worker are recovered by dequeueCrawlJob.
    const result = await enqueueCrawlJob({
      sourceId,
      url,
      maxPages,
      depth,
    });

    // Update crawl log with job reference
    await prisma.crawlLog.update({
      where: { id: log.id },
      data: {
        metadata: { jobId: result.jobId },
      },
    });

    return { jobId: result.jobId, logId: log.id };
  } catch (error) {
    // Enqueue failed — don't leave a dangling "running" log
    await prisma.crawlLog.update({
      where: { id: log.id },
      data: {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to enqueue crawl job',
      },
    });
    throw error;
  }
}

export interface CrawledPage {
  data: {
    markdown?: string;
    metadata?: Record<string, string | undefined>;
  };
}

export interface ProcessedPagesResult {
  /** Pages handled without error, including skipped/no-URL pages. */
  processed: number;
  /** Per-page failure messages for the crawl log. */
  errors: string[];
}

/**
 * Index crawled pages as Article rows in one batched pass (dedup against
 * already-indexed URLs, bulk insert, bulk topic linking) instead of one
 * query per page. Pages without a resolvable URL are skipped, not errors.
 */
export async function processCrawledPages(
  pages: CrawledPage[],
  ctx: { sourceId: string; userId?: string | null }
): Promise<ProcessedPagesResult> {
  const inputs: ArticleBatchInput[] = [];
  for (const { data } of pages) {
    const metadata = data.metadata || {};
    const url = metadata.sourceURL || metadata.pageURL;
    if (!url) continue;

    const content = data.markdown || '';
    inputs.push({
      url,
      title: metadata.title || 'Untitled Article',
      content,
      markdown: content,
      author: metadata.author || null,
      publishDate: metadata.publishedTime ? safeDate(metadata.publishedTime) : null,
      category: metadata.description ? guessCategory(metadata.description) : null,
      imageUrl: metadata.image || null,
      language: metadata.language || 'en',
    });
  }

  const { createdByUrl, failures } = await batchCreateArticles(inputs, {
    sourceId: ctx.sourceId,
    userId: ctx.userId ?? null,
  });
  await linkCategoryTopics(createdByUrl);

  return {
    processed: pages.length - failures.length,
    errors: failures.map((failure) => `${failure.url}: ${failure.message}`),
  };
}

/** Parse a date defensively — crawled metadata sometimes ships invalid values. */
function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function guessCategory(description: string): string {
  const lower = description.toLowerCase();
  const keywords: Record<string, string> = {
    ai: 'AI',
    'artificial intelligence': 'AI',
    'machine learning': 'AI',
    'llm': 'AI',
    programming: 'Programming',
    code: 'Programming',
    startup: 'Startup',
    funding: 'Startup',
    'venture capital': 'Startup',
    security: 'Cybersecurity',
    hack: 'Cybersecurity',
    breach: 'Cybersecurity',
    cloud: 'Cloud',
    aws: 'Cloud',
    azure: 'Cloud',
    devops: 'DevOps',
    ci: 'DevOps',
    cd: 'DevOps',
    business: 'Business',
    market: 'Business',
    finance: 'Finance',
    crypto: 'Cryptocurrency',
    blockchain: 'Cryptocurrency',
    bitcoin: 'Cryptocurrency',
    education: 'Education',
    learning: 'Education',
    science: 'Science',
    research: 'Science',
  };

  for (const [keyword, category] of Object.entries(keywords)) {
    if (lower.includes(keyword)) return category;
  }

  return 'General';
}
