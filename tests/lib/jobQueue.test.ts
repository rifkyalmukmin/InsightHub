import { enqueueCrawlJob, dequeueCrawlJob, completeCrawlJob, failCrawlJob, cancelCrawlJob, getPendingJobCount, getFailedJobs } from '@/lib/utils/jobQueue';
import prisma from '@/lib/db/prisma';

describe('Job Queue', () => {
  beforeEach(async () => {
    await prisma.crawlJob.deleteMany({});
    await prisma.crawlLog.deleteMany({});
    // CrawlJob.sourceId has an FK to NewsSource — ensure the fixture source exists
    await prisma.newsSource.upsert({
      where: { id: 'test-source' },
      create: {
        id: 'test-source',
        name: 'Test Source',
        domain: 'example.com',
        url: 'https://example.com',
      },
      update: {},
    });
  });

  it('should enqueue a crawl job', async () => {
    const result = await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com' });
    expect(result.jobId).toBeDefined();
  });

  it('should dequeue and claim a pending job', async () => {
    await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com' });
    const job = await dequeueCrawlJob();
    expect(job).not.toBeNull();
    expect(job.status).toBe('running');
  });

  it('should complete a job', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com' });
    await completeCrawlJob(jobId, { pagesCrawled: 5 });
    const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('completed');
  });

  it('should fail a job with retry', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com', maxAttempts: 3 });
    await failCrawlJob(jobId, 'Test error');
    const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('pending');
  });

  it('should cancel a job', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com' });
    await cancelCrawlJob(jobId);
    const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('cancelled');
  });

  it('should get pending job count', async () => {
    await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com' });
    const count = await getPendingJobCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('should get failed jobs', async () => {
    await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com', maxAttempts: 1 });
    // Attempts increment when the job is claimed — mirror the real worker flow
    const job = await dequeueCrawlJob();
    expect(job).not.toBeNull();
    await failCrawlJob(job.id, 'Test error'); // attempts (1) >= maxAttempts (1) → failed
    const failed = await getFailedJobs();
    expect(failed.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Stuck job recovery', () => {
  // 30 min ago — beyond the default 15 min stale timeout
  const STALE_MS = 30 * 60 * 1000;

  async function backdateJob(jobId: string) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { startedAt: new Date(Date.now() - STALE_MS) },
    });
  }

  it('does not reclaim a running job that is not stale', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com' });
    await dequeueCrawlJob(); // claim → running with a fresh startedAt
    const job = await dequeueCrawlJob();
    expect(job).toBeNull();
    const updated = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    expect(updated?.status).toBe('running');
    expect(updated?.attempts).toBe(1);
  });

  it('reclaims a job stuck in running for longer than the timeout', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com' });
    await dequeueCrawlJob(); // claim (attempt 1)
    await backdateJob(jobId); // simulate a worker that crashed mid-crawl
    const job = await dequeueCrawlJob();
    expect(job).not.toBeNull();
    expect(job.status).toBe('running');
    expect(job.attempts).toBe(2);
  });

  it('fails a stuck job outright once max attempts are exhausted', async () => {
    const { jobId } = await enqueueCrawlJob({
      sourceId: 'test-source',
      url: 'https://example.com',
      maxAttempts: 1,
    });
    await dequeueCrawlJob(); // claim → attempts (1) == maxAttempts (1)
    await backdateJob(jobId);
    const job = await dequeueCrawlJob();
    expect(job).toBeNull();
    const updated = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toContain('max attempts reached');
  });

  it('marks the abandoned crawl log as error when reclaiming a stale job', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId: 'test-source', url: 'https://example.com' });
    await prisma.crawlLog.create({
      data: { sourceId: 'test-source', status: 'running', metadata: { jobId } },
    });
    await dequeueCrawlJob(); // claim
    await backdateJob(jobId);
    const job = await dequeueCrawlJob(); // reclaim
    expect(job).not.toBeNull();
    const log = await prisma.crawlLog.findFirst({
      where: { sourceId: 'test-source', metadata: { path: ['jobId'], equals: jobId } },
    });
    expect(log?.status).toBe('error');
  });
});
