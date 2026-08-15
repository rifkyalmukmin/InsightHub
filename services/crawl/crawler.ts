import { CrawlOptions } from '../firecrawl/client';
import prisma from '@/lib/db/prisma';
import { getDomain } from '@/lib/utils/format';
import { slugify } from '@/lib/utils/slugify';
import { enqueueCrawlJob } from '@/lib/utils/jobQueue';

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
