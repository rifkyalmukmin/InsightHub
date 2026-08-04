import prisma from '@/lib/db/prisma';
import { SearchFilters } from '@/types';

export async function searchArticles(filters: SearchFilters) {
  const {
    query,
    topic,
    source,
    author,
    sentiment,
    from,
    to,
    page = 1,
    limit = 20,
    sort = 'newest',
  } = filters;

  const where: Record<string, unknown> = {
    isDuplicate: false,
    OR: [{ userId: filters.userId }, { userId: null }],
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
    const topicRecord = await prisma.topic.findFirst({
      where: { slug: topic },
    });
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

  if (author) {
    where.author = { contains: author, mode: 'insensitive' };
  }

  if (sentiment) {
    where.sentiment = sentiment;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) {
      (where.createdAt as Record<string, unknown>).gte = new Date(from);
    }
    if (to) {
      (where.createdAt as Record<string, unknown>).lt = new Date(to);
    }
  }

  const orderBy: Record<string, string> = {
    createdAt: sort === 'oldest' ? 'asc' : 'desc',
  };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        summary: true,
        source: true,
        tags: {
          include: { topic: true },
        },
        bookmarks: {
          where: { userId: filters['userId'] as string | undefined },
        },
      },
    }),
    prisma.article.count({ where }),
  ]);

  return {
    articles,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSimilarArticles(articleId: string, limit: number = 5) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: {
      tags: { include: { topic: true } },
    },
  });

  if (!article) return [];

  const topicIds = article.tags.map((t: { topicId: string }) => t.topicId);
  if (topicIds.length === 0) return [];

  // Find articles with matching topics
  const similarTags = await prisma.articleTag.findMany({
    where: {
      topicId: { in: topicIds },
      articleId: { not: articleId },
    },
    include: {
      article: {
        include: {
          summary: true,
          source: true,
        },
      },
    },
    orderBy: { relevance: 'desc' },
    take: limit,
  });

  return similarTags.map((tag: { article: any }) => tag.article);
}
