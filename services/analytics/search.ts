import prisma from '@/lib/db/prisma';
import { SearchFilters } from '@/types';
import { queryArticles } from './articleQuery';

export async function searchArticles(filters: SearchFilters) {
  const result = await queryArticles({
    userId: filters.userId,
    query: filters.query,
    topic: filters.topic,
    source: filters.source,
    author: filters.author,
    sentiment: filters.sentiment,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort === 'oldest' ? 'oldest' : 'newest',
  });

  return {
    articles: result.articles,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
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

  const topicIds = article.tags.map((t) => t.topicId);
  if (topicIds.length === 0) return [];

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

  return similarTags.map((tag) => tag.article);
}
