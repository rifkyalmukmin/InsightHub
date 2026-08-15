import { getFirecrawlClient, CrawlOptions, CrawlResult } from '../firecrawl/client';
import prisma from '@/lib/db/prisma';
import { getDomain } from '@/lib/utils/format';
import { slugify } from '@/lib/utils/slugify';
import { enqueueCrawlJob, completeCrawlJob, failCrawlJob } from '@/lib/utils/jobQueue';

export interface CrawlJob {
  sourceId: string;
  url: string;
  maxPages: number;
  depth: number;
}

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

async function processCrawlResults(
  jobId: string,
  logId: string,
  sourceId: string,
  userId: string | undefined,
  startedAt: number,
): Promise<void> {
  const client = getFirecrawlClient();

  try {
    // Poll until complete
    let status: any;
    const maxAttempts = 60; // ~5 minutes with 5s interval
    let attempts = 0;

    while (attempts < maxAttempts) {
      status = await client.checkCrawlStatus(jobId);
      if (status.status === 'completed') break;
      if (status.status === 'failed' || status.status === 'cancelled') {
        throw new Error(status.error || 'Crawl failed');
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    if (!status || status.status !== 'completed' || !status.data) {
      throw new Error('Crawl timed out');
    }

    // Process results
    let processed = 0;
    const errors: string[] = [];

    for (const item of status.data) {
      try {
        await processCrawledPage({
          data: item,
          sourceId,
          userId,
        });
        processed++;
      } catch (err) {
        const pageUrl = item.metadata?.sourceURL || item.metadata?.pageURL || 'unknown';
        errors.push(`${pageUrl}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Update crawl log
    await prisma.crawlLog.update({
      where: { id: logId },
      data: {
        status: 'success',
        pagesCrawled: processed,
        pagesTotal: status.data.length,
        error: errors.length > 0 ? errors.join('; ') : null,
        duration: (Date.now() - startedAt) / 1000,
      },
    });

    // Update source last crawl
    await prisma.newsSource.update({
      where: { id: sourceId },
      data: { lastCrawlAt: new Date() },
    });

    // Mark job as completed
    await completeCrawlJob(jobId, {
      pagesCrawled: processed,
      pagesTotal: status.data.length,
    });
  } catch (error) {
    await prisma.crawlLog.update({
      where: { id: logId },
      data: {
        status: 'error',
        error: error instanceof Error ? error.message : 'Crawl failed',
      },
    });

    // Mark job as failed (with retry logic)
    await failCrawlJob(jobId, error instanceof Error ? error.message : 'Crawl failed');

    throw error;
  }
}

export async function scrapeUrl(options: CrawlOptions): Promise<CrawlResult> {
  const client = getFirecrawlClient();

  try {
    const result = await client.scrapeUrl(options.url, {
      formats: ['markdown'],
    }) as any;

    return {
      success: true,
      data: [
        {
          markdown: result.markdown,
          metadata: result.metadata,
        },
      ],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface CrawledPage {
  data: {
    markdown?: string;
    metadata?: Record<string, string | undefined>;
  };
  sourceId: string;
  userId?: string;
}

export async function processCrawledPage(page: CrawledPage): Promise<void> {
  const { data, sourceId, userId } = page;
  const metadata = data.metadata || {};

  const url = metadata.sourceURL || metadata.pageURL;
  if (!url) return;

  // Check for duplicates
  const existing = await prisma.article.findUnique({
    where: { url },
  });

  if (existing) {
    // URL already indexed — skip without hiding the existing article
    return;
  }

  const title = metadata.title || 'Untitled Article';
  const content = data.markdown || '';
  const domain = getDomain(url);

  // Create article
  const article = await prisma.article.create({
    data: {
      sourceId,
      userId: userId || null,
      url,
      title,
      content,
      markdown: content,
      author: metadata.author || null,
      publishDate: metadata.publishedTime ? new Date(metadata.publishedTime) : null,
      category: metadata.description ? guessCategory(metadata.description) : null,
      imageUrl: metadata.image || null,
      language: metadata.language || 'en',
      status: 'crawled',
    },
  });

  // Auto-create topic tags from source category
  if (metadata.description) {
    const topicSlug = slugify(guessCategory(metadata.description));
    const topic = await prisma.topic.upsert({
      where: { slug: topicSlug },
      create: { name: guessCategory(metadata.description), slug: topicSlug },
      update: {},
    });

    await prisma.articleTag.create({
      data: {
        articleId: article.id,
        topicId: topic.id,
      },
    });
  }
}

function guessCategory(description: string): string {
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
