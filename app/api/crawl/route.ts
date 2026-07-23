import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import prisma from '@/lib/db/prisma';
import { startCrawlJob, scrapeUrl } from '@/services/crawl/crawler';

export const POST = withRateLimit(async (request: Request) => {
  try {
    const body = await request.json();
    const { url, sourceId, maxPages = 10, depth = 1, userId } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Create or get source
    let source;
    const domain = parsedUrl.hostname.replace('www.', '');

    if (sourceId) {
      source = await prisma.newsSource.findUnique({ where: { id: sourceId } });
    }

    if (!source) {
      source = await prisma.newsSource.create({
        data: {
          name: domain,
          domain,
          url,
          userId: userId || null,
          status: 'active',
        },
      });
    }

    // Start crawl
    const result = await startCrawlJob({
      url,
      sourceId: source.id,
      maxPages,
      depth,
      userId,
    });

    // Count new articles
    const newArticles = await prisma.article.count({
      where: { sourceId: source.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        jobId: result.jobId,
        logId: result.logId,
        sourceId: source.id,
        sourceName: source.name,
        domain: source.domain,
        newArticles,
      },
      message: `Crawling started for ${domain}`,
    });
  } catch (error) {
    console.error('Crawl error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Crawl failed',
      },
      { status: 500 }
    );
  }
});

export const GET = withRateLimit(async () => {
  try {
    const sources = await prisma.newsSource.findMany({
      include: {
        _count: { select: { articles: true } },
        crawlLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: sources,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sources' },
      { status: 500 }
    );
  }
});
