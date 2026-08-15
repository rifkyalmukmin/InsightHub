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

