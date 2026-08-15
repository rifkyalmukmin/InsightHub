import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

/**
 * How long a "running" crawl job may stay unclaimed before it is considered
 * abandoned (a worker or serverless process crashed mid-crawl) and reclaimed.
 * Configurable via JOB_STALE_TIMEOUT_MS (default 15 minutes).
 */
const STALE_RUNNING_TIMEOUT_MS = parseInt(process.env.JOB_STALE_TIMEOUT_MS || '900000', 10);

const STALE_JOB_ERROR = 'Job stuck in running state — reclaimed by worker';

export interface JobQueueOptions {
  sourceId: string;
  url: string;
  maxPages?: number;
  depth?: number;
  maxAttempts?: number;
}

export interface JobQueueResult {
  jobId: string;
}

/**
 * Enqueue a crawl job for background processing.
 * Jobs are processed by a worker that polls the database for pending jobs.
 */
export async function enqueueCrawlJob(options: JobQueueOptions): Promise<JobQueueResult> {
  const job = await prisma.crawlJob.create({
    data: {
      sourceId: options.sourceId,
      url: options.url,
      maxPages: options.maxPages ?? 10,
      depth: options.depth ?? 1,
      maxAttempts: options.maxAttempts ?? 3,
      status: 'pending',
    },
  });

  return { jobId: job.id };
}

/**
 * Atomically claim a job for processing. The `guard` must still hold when the
 * claim runs, so concurrent workers can never double-process the same job.
 */
async function claimJob(
  id: string,
  guard: { status: string; startedAt?: { lt: Date } }
): Promise<any> {
  const claimed = await prisma.crawlJob.updateMany({
    where: { id, ...guard },
    data: {
      status: 'running',
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) return null;

  return prisma.crawlJob.findUnique({
    where: { id },
    include: { source: true },
  });
}

/**
 * Dequeue and claim the next job for processing.
 *
 * 1. Claims the oldest pending job (normal flow).
 * 2. Recovers jobs stuck in "running": if a worker/serverless process died
 *    mid-crawl the job is never completed or failed. After a timeout it is
 *    reclaimed (counted as a retry attempt); once attempts are exhausted it
 *    is failed outright instead of being processed forever.
 *
 * Claims are atomic (guarded updateMany), so concurrent workers never
 * double-process the same job.
 */
export async function dequeueCrawlJob(): Promise<any> {
  // 1) Fresh pending job
  const pending = await prisma.crawlJob.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  if (pending) {
    const job = await claimJob(pending.id, { status: 'pending' });
    if (job) return job;
  }

  // 2) Recover a job abandoned in "running" state
  const staleBefore = new Date(Date.now() - STALE_RUNNING_TIMEOUT_MS);
  const stale = await prisma.crawlJob.findFirst({
    where: { status: 'running', startedAt: { lt: staleBefore } },
    orderBy: { startedAt: 'asc' },
  });

  if (!stale) return null;

  if (stale.attempts >= stale.maxAttempts) {
    logger.warn(
      { jobId: stale.id, attempts: stale.attempts, maxAttempts: stale.maxAttempts },
      'Stuck crawl job exceeded max attempts — marking failed'
    );
    await prisma.crawlJob.update({
      where: { id: stale.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        error: `${STALE_JOB_ERROR} (max attempts reached)`,
      },
    });
    return null;
  }

  const job = await claimJob(stale.id, { status: 'running', startedAt: { lt: staleBefore } });
  if (job) {
    logger.warn({ jobId: job.id }, 'Reclaimed crawl job stuck in running state');
    // Resolve the abandoned attempt's crawl log so the UI stops showing
    // "Crawling..." — the reclaimed run will write its own log entry.
    await prisma.crawlLog.updateMany({
      where: { metadata: { path: ['jobId'], equals: job.id }, status: 'running' },
      data: { status: 'error', error: STALE_JOB_ERROR },
    });
    return job;
  }

  return null;
}

/**
 * Mark a job as completed with result data.
 */
export async function completeCrawlJob(
  jobId: string,
  result: Record<string, any>
): Promise<void> {
  await prisma.crawlJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      result,
    },
  });
}

/**
 * Mark a job as failed. Retries if attempts < maxAttempts.
 */
export async function failCrawlJob(
  jobId: string,
  error: string
): Promise<void> {
  const job = await prisma.crawlJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return;

  if (job.attempts < job.maxAttempts) {
    // Retry: reset to pending
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        error,
      },
    });
  } else {
    // Max attempts reached: mark as failed
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        error,
      },
    });
  }
}

/**
 * Cancel a pending or queued job.
 */
export async function cancelCrawlJob(jobId: string): Promise<void> {
  await prisma.crawlJob.update({
    where: { id: jobId },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
    },
  });
}

/**
 * Get pending job count for monitoring.
 */
export async function getPendingJobCount(): Promise<number> {
  return prisma.crawlJob.count({
    where: { status: { in: ['pending', 'queued'] } },
  });
}

/**
 * Get failed jobs for retry or inspection.
 */
export async function getFailedJobs(limit: number = 10) {
  return prisma.crawlJob.findMany({
    where: { status: 'failed' },
    orderBy: { completedAt: 'desc' },
    take: limit,
    include: { source: true },
  });
}
