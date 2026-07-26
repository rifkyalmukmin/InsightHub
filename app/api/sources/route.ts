import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import prisma from '@/lib/db/prisma';

export const GET = withRateLimit(async (request: Request) => {
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
          select: {
            status: true,
            pagesCrawled: true,
            pagesTotal: true,
            createdAt: true,
            error: true,
          },
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

export const POST = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await request.json();
    const { name, domain, url, description, category } = body;

    if (!name || !domain || !url) {
      return NextResponse.json(
        { success: false, error: 'Name, domain, and URL are required' },
        { status: 400 }
      );
    }

    // Check for duplicates
    const existing = await prisma.newsSource.findFirst({
      where: {
        userId,
        OR: [{ domain }, { url }],
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Source with this domain or URL already exists' },
        { status: 409 }
      );
    }

    const source = await prisma.newsSource.create({
      data: {
        name,
        domain,
        url,
        description,
        category,
        userId,
        status: 'active',
      },
    });

    return NextResponse.json({
      success: true,
      data: source,
      message: 'Source created successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create source' },
      { status: 500 }
    );
  }
});
