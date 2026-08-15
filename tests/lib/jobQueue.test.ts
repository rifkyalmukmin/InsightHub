import { enqueueCrawlJob, dequeueCrawlJob, completeCrawlJob, failCrawlJob, cancelCrawlJob, getPendingJobCount, getFailedJobs } from '@/lib/utils/jobQueue';
import prisma from '@/lib/db/prisma';

describe('Job Queue', () => {
  let sourceId: string;

  beforeAll(async () => {
    const source = await prisma.newsSource.create({
      data: {
        name: 'Test Source',
        domain: `test-source-${Date.now()}-${Math.random().toString(36).slice(2)}.com`,
        url: 'https://example.com',
      },
    });

    sourceId = source.id;
  });

  beforeEach(async () => {
    await prisma.crawlJob.deleteMany({});
  });

  it('should enqueue a crawl job', async () => {
    const result = await enqueueCrawlJob({ sourceId, url: 'https://example.com' });
    expect(result.jobId).toBeDefined();
  });

  it('should dequeue and claim a pending job', async () => {
    await enqueueCrawlJob({ sourceId, url: 'https://example.com' });
    const job = await dequeueCrawlJob();
    expect(job).not.toBeNull();
    expect(job.status).toBe('running');
  });

  it('should complete a job', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId, url: 'https://example.com' });
    await completeCrawlJob(jobId, { pagesCrawled: 5 });
    const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('completed');
  });

  it('should fail a job with retry', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId, url: 'https://example.com', maxAttempts: 3 });
    await failCrawlJob(jobId, 'Test error');
    const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('pending');
  });

  it('should cancel a job', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId, url: 'https://example.com' });
    await cancelCrawlJob(jobId);
    const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('cancelled');
  });

  it('should get pending job count', async () => {
    await enqueueCrawlJob({ sourceId, url: 'https://example.com' });
    const count = await getPendingJobCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('should get failed jobs', async () => {
    const { jobId } = await enqueueCrawlJob({ sourceId, url: 'https://example.com', maxAttempts: 1 });
    await failCrawlJob(jobId, 'Test error');
    await failCrawlJob(jobId, 'Test error');
    const failed = await getFailedJobs();
    expect(failed.length).toBeGreaterThanOrEqual(1);
  });
});
