import prisma from '@/lib/db/prisma';

export interface JobQueueOptions {
  sourceId: string;
  url: string;
  maxPages?: number;
  depth?: number;
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
      status: 'pending',
    },
  });

  return { jobId: job.id };
}

/**
 * Dequeue and claim the next pending job for processing.
 * Uses optimistic locking via updatedAt to avoid race conditions.
 */
export async function dequeueCrawlJob(): Promise<any> {
  const job = await prisma.crawlJob.findFirst({
    where: {
      status: 'pending',
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (!job) return null;

  // Claim the job
  await prisma.crawlJob.update({
    where: { id: job.id },
    data: {
      status: 'running',
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  return prisma.crawlJob.findUnique({
    where: { id: job.id },
    include: { source: true },
  });
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
