import {
  enqueueCrawlJob,
  dequeueCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  cancelCrawlJob,
  getPendingJobCount,
  getFailedJobs,
} from '@/lib/utils/jobQueue';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    crawlJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    crawlLog: {
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import prisma from '@/lib/db/prisma';

const mockCreate = prisma.crawlJob.create as jest.Mock;
const mockFindFirst = prisma.crawlJob.findFirst as jest.Mock;
const mockFindUnique = prisma.crawlJob.findUnique as jest.Mock;
const mockFindMany = prisma.crawlJob.findMany as jest.Mock;
const mockUpdate = prisma.crawlJob.update as jest.Mock;
const mockUpdateMany = prisma.crawlJob.updateMany as jest.Mock;
const mockCount = prisma.crawlJob.count as jest.Mock;
const mockCrawlLogUpdateMany = prisma.crawlLog.updateMany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCrawlLogUpdateMany.mockResolvedValue({ count: 0 });
});

describe('Job Queue', () => {
  it('should enqueue a crawl job', async () => {
    mockCreate.mockResolvedValue({ id: 'job-1', status: 'pending' });

    const result = await enqueueCrawlJob({
      sourceId: 'test-source',
      url: 'https://example.com',
    });
    expect(result.jobId).toBe('job-1');
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceId: 'test-source',
        url: 'https://example.com',
        status: 'pending',
      }),
    });
  });

  it('should dequeue and claim a pending job', async () => {
    mockFindFirst.mockResolvedValue({ id: 'job-1', status: 'pending' });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({
      id: 'job-1',
      status: 'running',
      attempts: 1,
      source: { id: 'test-source' },
    });

    const job = await dequeueCrawlJob();
    expect(job).not.toBeNull();
    expect(job.status).toBe('running');
  });

  it('should complete a job', async () => {
    mockUpdate.mockResolvedValue({ id: 'job-1', status: 'completed' });

    await completeCrawlJob('job-1', { pagesCrawled: 5 });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'completed' }),
    });
  });

  it('should fail a job with retry when attempts < maxAttempts', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job-1',
      attempts: 1,
      maxAttempts: 3,
    });
    mockUpdate.mockResolvedValue({ id: 'job-1', status: 'pending' });

    await failCrawlJob('job-1', 'Test error');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'pending', error: 'Test error' }),
    });
  });

  it('should mark job failed when attempts >= maxAttempts', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job-1',
      attempts: 3,
      maxAttempts: 3,
    });
    mockUpdate.mockResolvedValue({ id: 'job-1', status: 'failed' });

    await failCrawlJob('job-1', 'Test error');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'failed' }),
    });
  });

  it('should cancel a job', async () => {
    mockUpdate.mockResolvedValue({ id: 'job-1', status: 'cancelled' });

    await cancelCrawlJob('job-1');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'cancelled' }),
    });
  });

  it('should get pending job count', async () => {
    mockCount.mockResolvedValue(3);

    const count = await getPendingJobCount();
    expect(count).toBe(3);
  });

  it('should get failed jobs', async () => {
    const failedJobs = [
      { id: 'job-1', status: 'failed', error: 'err' },
      { id: 'job-2', status: 'failed', error: 'err2' },
    ];
    mockFindMany.mockResolvedValue(failedJobs);

    const failed = await getFailedJobs();
    expect(failed).toHaveLength(2);
    expect(failed[0].status).toBe('failed');
  });
});

describe('Stuck job recovery', () => {
  it('does not reclaim a running job that is not stale', async () => {
    // No pending jobs
    mockFindFirst
      .mockResolvedValueOnce(null) // pending search
      .mockResolvedValueOnce(null); // stale search (nothing stale)

    const job = await dequeueCrawlJob();
    expect(job).toBeNull();
  });

  it('reclaims a job stuck in running for longer than the timeout', async () => {
    const staleJob = {
      id: 'job-stale',
      status: 'running',
      attempts: 1,
      maxAttempts: 3,
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    };

    mockFindFirst
      .mockResolvedValueOnce(null) // no pending
      .mockResolvedValueOnce(staleJob); // stale job found
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({
      ...staleJob,
      status: 'running',
      attempts: 2,
      source: { id: 'test-source' },
    });

    const job = await dequeueCrawlJob();
    expect(job).not.toBeNull();
    expect(job.attempts).toBe(2);
  });

  it('fails a stuck job outright once max attempts are exhausted', async () => {
    const staleJob = {
      id: 'job-exhausted',
      status: 'running',
      attempts: 3,
      maxAttempts: 3,
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    };

    mockFindFirst
      .mockResolvedValueOnce(null) // no pending
      .mockResolvedValueOnce(staleJob); // stale job found
    mockUpdate.mockResolvedValue({ ...staleJob, status: 'failed' });

    const job = await dequeueCrawlJob();
    expect(job).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'job-exhausted' },
      data: expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('max attempts reached'),
      }),
    });
  });

  it('marks the abandoned crawl log as error when reclaiming a stale job', async () => {
    const staleJob = {
      id: 'job-with-log',
      status: 'running',
      attempts: 1,
      maxAttempts: 3,
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    };

    mockFindFirst
      .mockResolvedValueOnce(null) // no pending
      .mockResolvedValueOnce(staleJob); // stale job found
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({
      ...staleJob,
      attempts: 2,
      source: { id: 'test-source' },
    });

    await dequeueCrawlJob();
    expect(mockCrawlLogUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        metadata: { path: ['jobId'], equals: 'job-with-log' },
        status: 'running',
      }),
      data: expect.objectContaining({ status: 'error' }),
    });
  });
});
