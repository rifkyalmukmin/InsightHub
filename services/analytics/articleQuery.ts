import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export interface ArticleQueryFilters {
  userId?: string;
  query?: string;
  topic?: string;
  source?: string;
  author?: string;
  sentiment?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest';
}

export interface ArticleQueryResult {
  articles: Awaited<ReturnType<typeof fetchArticles>>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const articleInclude = (userId?: string) => ({
  summary: true,
  source: true,
  tags: { include: { topic: true } },
  ...(userId ? { bookmarks: { where: { userId } } } : {}),
});

async function resolveTopicArticleIds(topicSlug: string): Promise<string[] | null> {
  const topicRecord = await prisma.topic.findFirst({ where: { slug: topicSlug } });
  if (!topicRecord) return null;

  const tags = await prisma.articleTag.findMany({
    where: { topicId: topicRecord.id },
    select: { articleId: true },
  });
  return tags.map((t) => t.articleId);
}

/**
 * Builds a Prisma where clause with correct user scoping.
 * Search text uses AND so user scope is never overwritten.
 */
export async function buildArticleWhere(
  filters: ArticleQueryFilters
): Promise<Prisma.ArticleWhereInput> {
  const { userId, query, topic, source, author, sentiment, from, to } = filters;

  const where: Prisma.ArticleWhereInput = {
    isDuplicate: false,
    OR: userId ? [{ userId }, { userId: null }] : [{ userId: null }],
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
    const articleIds = await resolveTopicArticleIds(topic);
    if (articleIds) {
      where.id = { in: articleIds };
    }
  }

  if (source) where.sourceId = source;
  if (author) where.author = { contains: author, mode: 'insensitive' };
  if (sentiment) where.sentiment = sentiment;

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lt = new Date(to);
  }

  return where;
}

/**
 * Full-text search using PostgreSQL tsvector when a query is provided.
 * Falls back to Prisma contains search on failure.
 */
async function searchWithFullText(
  filters: ArticleQueryFilters
): Promise<{ ids: string[]; total: number } | null> {
  const { query, userId, page = 1, limit = 20, sort = 'newest' } = filters;
  if (!query?.trim()) return null;

  const offset = (page - 1) * limit;
  const orderDir = sort === 'oldest' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  try {
    const userFilter = userId
      ? Prisma.sql`AND ("userId" = ${userId} OR "userId" IS NULL)`
      : Prisma.sql`AND "userId" IS NULL`;

    const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Article"
      WHERE "isDuplicate" = false
      ${userFilter}
      AND to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", ''))
          @@ plainto_tsquery('english', ${query})
    `;

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Article"
      WHERE "isDuplicate" = false
      ${userFilter}
      AND to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", ''))
          @@ plainto_tsquery('english', ${query})
      ORDER BY "createdAt" ${orderDir}
      LIMIT ${limit} OFFSET ${offset}
    `;

    return {
      ids: rows.map((r) => r.id),
      total: Number(countResult[0]?.count ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchArticles(
  where: Prisma.ArticleWhereInput,
  userId: string | undefined,
  page: number,
  limit: number,
  sort: 'newest' | 'oldest'
) {
  const orderBy: Prisma.ArticleOrderByWithRelationInput = {
    createdAt: sort === 'oldest' ? 'asc' : 'desc',
  };

  return prisma.article.findMany({
    where,
    orderBy,
    skip: (page - 1) * limit,
    take: limit,
    include: articleInclude(userId),
  });
}

export async function queryArticles(filters: ArticleQueryFilters): Promise<ArticleQueryResult> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const sort = filters.sort ?? 'newest';

  // Use FTS when only text search (no topic/source filters that complicate raw SQL)
  const canUseFts = filters.query && !filters.topic && !filters.source && !filters.author;
  const ftsResult = canUseFts ? await searchWithFullText(filters) : null;

  if (ftsResult) {
    const articles =
      ftsResult.ids.length > 0
        ? await prisma.article.findMany({
            where: { id: { in: ftsResult.ids } },
            include: articleInclude(filters.userId),
          })
        : [];

    // Preserve FTS relevance order
    const ordered = ftsResult.ids
      .map((id) => articles.find((a) => a.id === id))
      .filter(Boolean) as typeof articles;

    return {
      articles: ordered,
      total: ftsResult.total,
      page,
      limit,
      totalPages: Math.ceil(ftsResult.total / limit),
    };
  }

  const where = await buildArticleWhere(filters);
  const [articles, total] = await Promise.all([
    fetchArticles(where, filters.userId, page, limit, sort),
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
