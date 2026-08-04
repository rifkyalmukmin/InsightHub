import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import { validateQuery, articleQuerySchema } from '@/lib/validations';
import prisma from '@/lib/db/prisma';

export const GET = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const { searchParams } = new URL(request.url);
    const queryValidation = validateQuery(articleQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { success: false, error: queryValidation.error },
        { status: 400 }
      );
    }
    const { query, topic, source, sentiment, from, to, sort } = queryValidation.data;
    const page = queryValidation.data.page ?? 1;
    const limit = queryValidation.data.limit ?? 20;

    // Build where clause — restrict to authenticated user's articles
    const where: Record<string, unknown> = {
      isDuplicate: false,
      OR: [{ userId }, { userId: null }],
    };

    if (query) {
      where.AND = [
        {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (topic) {
      const topicRecord = await prisma.topic.findFirst({ where: { slug: topic } });
      if (topicRecord) {
        const tags = await prisma.articleTag.findMany({
          where: { topicId: topicRecord.id },
          select: { articleId: true },
        });
        where.id = { in: tags.map((t: { articleId: string }) => t.articleId) };
      }
    }

    if (source) {
      where.sourceId = source;
    }

    if (sentiment) {
      where.sentiment = sentiment;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, unknown>).lt = new Date(to);
    }

    const orderBy: { createdAt: 'asc' | 'desc' } = { createdAt: sort === 'oldest' ? 'asc' : 'desc' };

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          summary: true,
          source: true,
          tags: { include: { topic: true } },
          bookmarks: {
            where: { userId },
          },
        },
      }),
      prisma.article.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: articles,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Articles fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch articles' },
      { status: 500 }
    );
  }
});
