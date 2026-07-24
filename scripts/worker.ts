/**
 * Background Job Worker
 * 
 * Polls the database for pending crawl jobs and processes them.
 * Run this script separately: `npx tsx scripts/worker.ts`
 * 
 * Features:
 * - Persistent job queue with retry mechanism
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Configurable poll interval
 * - Concurrent job processing
 */

import { dequeueCrawlJob, completeCrawlJob, failCrawlJob } from '@/lib/utils/jobQueue';
import { getFirecrawlClient } from '@/services/firecrawl/client';
import prisma from '@/lib/db/prisma';
import { processCrawledPage } from '@/services/crawl/crawler';

const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10);
const MAX_CONCURRENT_JOBS = parseInt(process.env.WORKER_MAX_CONCURRENT || '3', 10);

let isShuttingDown = false;
let activeJobs = 0;

async function processJob(job: any) {
  activeJobs++;
  const { id, sourceId, url, maxPages, depth } = job;

  console.log(`[Worker] Processing job ${id} for source ${sourceId}`);

  try {
    const client = getFirecrawlClient();

    // Start crawl
    const crawlResult = await client.crawlUrl(url, {
      scrapeOptions: {
        formats: ['markdown'],
      },
    });

    const firecrawlJobId = (crawlResult as any).id || (crawlResult as any).jobId || 'unknown';

    // Poll Firecrawl for completion
    let status: any;
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      status = await client.checkCrawlStatus(firecrawlJobId);
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
        });
        processed++;
      } catch (err) {
        const pageUrl = item.metadata?.sourceURL || item.metadata?.pageURL || 'unknown';
        errors.push(`${pageUrl}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Create crawl log
    await prisma.crawlLog.create({
      data: {
        sourceId,
        status: 'success',
        pagesCrawled: processed,
        pagesTotal: status.data.length,
        error: errors.length > 0 ? errors.join('; ') : null,
        duration: 0,
      },
    });

    // Update source last crawl
    await prisma.newsSource.update({
      where: { id: sourceId },
      data: { lastCrawlAt: new Date() },
    });

    await completeCrawlJob(id, {
      pagesCrawled: processed,
      pagesTotal: status.data.length,
      firecrawlJobId,
    });

    console.log(`[Worker] Job ${id} completed: ${processed}/${status.data.length} pages`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Worker] Job ${id} failed:`, errorMessage);

    await failCrawlJob(id, errorMessage);

    // Create error crawl log
    await prisma.crawlLog.create({
      data: {
        sourceId,
        status: 'error',
        error: errorMessage,
      },
    });
  } finally {
    activeJobs--;
  }
}

async function workerLoop() {
  console.log('[Worker] Starting job worker...');
  console.log(`[Worker] Poll interval: ${POLL_INTERVAL_MS}ms, Max concurrent: ${MAX_CONCURRENT_JOBS}`);

  while (!isShuttingDown) {
    try {
      if (activeJobs >= MAX_CONCURRENT_JOBS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      const job = await dequeueCrawlJob();

      if (job) {
        // Process job without awaiting (allows concurrent processing)
        processJob(job).catch((err) => {
          console.error('[Worker] Unhandled job error:', err);
        });
      } else {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error('[Worker] Worker loop error:', error);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.log('[Worker] Worker shutting down...');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down gracefully...');
  isShuttingDown = true;
});

process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down gracefully...');
  isShuttingDown = true;
});

// Run worker
workerLoop().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
