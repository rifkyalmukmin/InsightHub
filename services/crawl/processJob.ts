import { getFirecrawlClient } from '@/services/firecrawl/client';
import prisma from '@/lib/db/prisma';
import { processCrawledPage } from '@/services/crawl/crawler';
import { completeCrawlJob, failCrawlJob } from '@/lib/utils/jobQueue';
import { logError, logger } from '@/lib/logger';
import type { CrawlJob, NewsSource } from '@prisma/client';

type CrawlJobWithSource = CrawlJob & { source: NewsSource | null };

interface ProcessJobOptions {
  jobId: string;
  logId?: string;
}

/**
 * Core crawl execution — job must already be claimed (status: running).
 */
export async function executeCrawlJob(
  job: CrawlJobWithSource,
  logId?: string
): Promise<void> {
  const userId = job.source?.userId ?? undefined;
  const startedAt = Date.now();

  const client = getFirecrawlClient();

  logger.info({ jobId: job.id, url: job.url }, 'Starting Firecrawl crawl');

  const result = await client.crawlUrl(
    job.url,
    {
      limit: job.maxPages,
      maxDepth: job.depth,
      scrapeOptions: {
        formats: ['markdown'],
      },
    },
    5
  );

  if ('error' in result && result.error) {
    throw new Error(result.error);
  }

  const status = result as { status?: string; data?: unknown[]; error?: string };

  if (status.status === 'failed' || status.status === 'cancelled') {
    throw new Error(status.error || 'Crawl failed');
  }

  const pages = Array.isArray(status.data) ? status.data : [];

  if (pages.length === 0) {
    throw new Error(
      'No pages returned from crawl. The site may block crawlers or require a different URL.'
    );
  }

  let processed = 0;
  const errors: string[] = [];

  for (const item of pages) {
    try {
      await processCrawledPage({
        data: item as { markdown?: string; metadata?: Record<string, string | undefined> },
        sourceId: job.sourceId,
        userId,
      });
      processed++;
    } catch (err) {
      const page = item as { metadata?: { sourceURL?: string; pageURL?: string } };
      const pageUrl = page.metadata?.sourceURL || page.metadata?.pageURL || 'unknown';
      errors.push(`${pageUrl}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  const duration = (Date.now() - startedAt) / 1000;

  if (logId) {
    await prisma.crawlLog.update({
      where: { id: logId },
      data: {
        status: processed > 0 ? 'success' : 'error',
        pagesCrawled: processed,
        pagesTotal: pages.length,
        error:
          errors.length > 0
            ? errors.join('; ')
            : processed === 0
              ? 'No articles saved'
              : null,
        duration,
      },
    });
  } else {
    await prisma.crawlLog.create({
      data: {
        sourceId: job.sourceId,
        status: processed > 0 ? 'success' : 'error',
        pagesCrawled: processed,
        pagesTotal: pages.length,
        error: errors.length > 0 ? errors.join('; ') : null,
        duration,
        depth: job.depth,
      },
    });
  }

  await prisma.newsSource.update({
    where: { id: job.sourceId },
    data: { lastCrawlAt: new Date() },
  });

  await completeCrawlJob(job.id, {
    pagesCrawled: processed,
    pagesTotal: pages.length,
  });

  logger.info({ jobId: job.id, processed, total: pages.length }, 'Crawl job completed');
}

/**
 * Atomically claim a pending job and process it.
 */
export async function processCrawlJobById({ jobId, logId }: ProcessJobOptions): Promise<void> {
  const claimed = await prisma.crawlJob.updateMany({
    where: { id: jobId, status: 'pending' },
    data: {
      status: 'running',
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    logger.info({ jobId }, 'Crawl job already claimed or finished');
    return;
  }

  const job = await prisma.crawlJob.findUnique({
    where: { id: jobId },
    include: { source: true },
  });

  if (!job) {
    throw new Error(`Crawl job ${jobId} not found`);
  }

  const startedAt = Date.now();

  try {
    await executeCrawlJob(job, logId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError('Crawl job', error, { jobId });

    if (logId) {
      await prisma.crawlLog.update({
        where: { id: logId },
        data: {
          status: 'error',
          error: errorMessage,
          duration: (Date.now() - startedAt) / 1000,
        },
      });
    } else {
      await prisma.crawlLog.create({
        data: {
          sourceId: job.sourceId,
          status: 'error',
          error: errorMessage,
          depth: job.depth,
        },
      });
    }

    await failCrawlJob(jobId, errorMessage);
    throw error;
  }
}

/**
 * Fire-and-forget background processing (safe for Next.js dev server).
 */
export function triggerCrawlJobProcessing(jobId: string, logId?: string): void {
  processCrawlJobById({ jobId, logId }).catch((err) => {
    logError('Background crawl', err, { jobId });
  });
}
