import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import prisma from '@/lib/db/prisma';

export const GET = withRateLimit(async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const type = searchParams.get('type') || undefined;
    const collection = searchParams.get('collection') || undefined;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { userId };

    if (type) {
      where.type = type;
    }

    if (collection) {
      where.collection = collection;
    }

    const bookmarks = await prisma.bookmark.findMany({
      where,
      include: {
        article: {
          include: {
            summary: true,
            source: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get unique collections
    const collections = await prisma.bookmark.findMany({
      where: { userId, collection: { not: null } },
      select: { collection: true },
      distinct: ['collection'],
    });

    return NextResponse.json({
      success: true,
      data: bookmarks,
      collections: collections.map((b: { collection: string | null }) => b.collection).filter(Boolean),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bookmarks' },
      { status: 500 }
    );
  }
});

export const POST = withRateLimit(async (request: Request) => {
  try {
    const body = await request.json();
    const { articleId, userId, type = 'bookmark', collection, note } = body;

    if (!articleId || !userId) {
      return NextResponse.json(
        { success: false, error: 'Article ID and User ID are required' },
        { status: 400 }
      );
    }

    // Check if article exists
    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Toggle bookmark
    const existing = await prisma.bookmark.findUnique({
      where: { userId_articleId: { userId, articleId } },
    });

    if (existing) {
      // Toggle off
      await prisma.bookmark.delete({ where: { id: existing.id } });
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Bookmark removed',
      });
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        articleId,
        userId,
        type,
        collection,
        note,
      },
      include: {
        article: {
          include: {
            summary: true,
            source: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: bookmark,
      message: 'Article bookmarked',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to toggle bookmark' },
      { status: 500 }
    );
  }
});
