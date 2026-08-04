import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import prisma from '@/lib/db/prisma';
import { validateBody, crawlSchema } from '@/lib/validations';
import { getCrawlUrlError } from '@/lib/utils/url';
import { startCrawlJob } from '@/services/crawl/crawler';

export const POST = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await request.json();
    const validation = validateBody(crawlSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { url, sourceId, maxPages, depth } = validation.data;

    const urlError = getCrawlUrlError(url);
    if (urlError) {
      return NextResponse.json(
        { success: false, error: urlError },
        { status: 400 }
      );
    }

    const parsedUrl = new URL(url);

    // Create or get source
    let source;
    const domain = parsedUrl.hostname.replace('www.', '');

    if (sourceId) {
      source = await prisma.newsSource.findUnique({ where: { id: sourceId } });
      // Verify ownership if source belongs to a user
      if (source && source.userId && source.userId !== userId) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
    }

    if (!source) {
      source = await prisma.newsSource.create({
        data: {
          name: domain,
          domain,
          url,
          userId,
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
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const sources = await prisma.newsSource.findMany({
      where: { OR: [{ userId }, { userId: null }] },
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
