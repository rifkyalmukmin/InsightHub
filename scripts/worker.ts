/**
 * Background Job Worker
 *
 * Polls the database for pending crawl jobs and processes them.
 * Optional — crawls also auto-process after enqueue in the API.
 * Run: `npm run worker`
 */

import { dequeueCrawlJob, failCrawlJob } from '@/lib/utils/jobQueue';
import { executeCrawlJob } from '@/services/crawl/processJob';
import { logError, logger } from '@/lib/logger';

const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10);
const MAX_CONCURRENT_JOBS = parseInt(process.env.WORKER_MAX_CONCURRENT || '3', 10);

let isShuttingDown = false;
let activeJobs = 0;

async function processJob(job: Awaited<ReturnType<typeof dequeueCrawlJob>>) {
  if (!job) return;
  activeJobs++;
  try {
    await executeCrawlJob(job);
  } catch (error) {
    logError('Worker job', error, { jobId: job.id });
    await failCrawlJob(job.id, error instanceof Error ? error.message : 'Unknown error');
  } finally {
    activeJobs--;
  }
}

async function workerLoop() {
  logger.info(
    { pollInterval: POLL_INTERVAL_MS, maxConcurrent: MAX_CONCURRENT_JOBS },
    'Crawl worker started'
  );

  while (!isShuttingDown) {
    try {
      if (activeJobs >= MAX_CONCURRENT_JOBS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      const job = await dequeueCrawlJob();

      if (job) {
        processJob(job).catch((err) => logError('Unhandled worker error', err));
      } else {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      logError('Worker loop', error);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  logger.info('Crawl worker shutting down');
}

process.on('SIGTERM', () => {
  isShuttingDown = true;
});

process.on('SIGINT', () => {
  isShuttingDown = true;
});

workerLoop().catch((err) => {
  logError('Worker fatal', err);
  process.exit(1);
});
