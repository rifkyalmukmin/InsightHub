import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { DashboardStats, TrendingTopic, ChartData } from '@/types';

export type DashboardPeriod = '24h' | '7d' | '30d' | 'all';

export function isDashboardPeriod(value: string | null | undefined): value is DashboardPeriod {
  return value === '24h' || value === '7d' || value === '30d' || value === 'all';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_BUCKETS = 90;

/**
 * Articles the authenticated user can see: their own plus shared/global ones
 * (userId: null) — matching the article feed semantics. When no userId is
 * given (defensive), only global articles are visible.
 */
function visibleArticleWhere(userId: string | undefined): Prisma.ArticleWhereInput {
  return { OR: userId ? [{ userId }, { userId: null }] : [{ userId: null }] };
}

function visibleScopeSql(userId: string | undefined): Prisma.Sql {
  return userId
    ? Prisma.sql`(a."userId" = ${userId} OR a."userId" IS NULL)`
    : Prisma.sql`a."userId" IS NULL`;
}

/**
 * `createdAt >= date` for raw SQL.
 *
 * Prisma stores DateTime as `timestamp` (no TZ) with UTC wall-clock values,
 * but the pg driver serializes raw-query Date params as *local* wall-clock
 * text — so a Date bound directly is off by the local UTC offset and wrongly
 * excludes rows near the boundary. Binding the UTC ISO text with an explicit
 * `::timestamp` cast keeps the comparison timezone-agnostic (verified live).
 */
function createdAtGte(date: Date): Prisma.Sql {
  const iso = date.toISOString().replace('T', ' ').replace('Z', '');
  return Prisma.sql`a."createdAt" >= ${iso}::timestamp`;
}

function periodStartDate(period: DashboardPeriod, now: Date): Date {
  switch (period) {
    case '24h':
      return new Date(now.getTime() - DAY_MS);
    case '30d':
      return new Date(now.getTime() - 30 * DAY_MS);
    case 'all':
      return new Date(0); // resolved to earliest article in getDashboardStats
    default:
      return new Date(now.getTime() - 7 * DAY_MS);
  }
}

export async function getDashboardStats(
  userId: string | undefined,
  period: DashboardPeriod = '7d'
): Promise<DashboardStats> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  // Resolve the analysis window start (for 'all' use the user's earliest article)
  let startDate = periodStartDate(period, now);
  if (period === 'all') {
    const min = await prisma.article.aggregate({
      where: visibleArticleWhere(userId),
      _min: { createdAt: true },
    });
    startDate = min._min.createdAt ?? new Date(now.getTime() - 30 * DAY_MS);
    // Cap 'all' at a reasonable number of daily buckets for the chart
    if (now.getTime() - startDate.getTime() > MAX_DAILY_BUCKETS * DAY_MS) {
      startDate = new Date(now.getTime() - MAX_DAILY_BUCKETS * DAY_MS);
    }
  }

  const [totalNews, totalSources, totalSummaries, newsToday, newsThisWeek] = await Promise.all([
    prisma.article.count({
      where: { ...visibleArticleWhere(userId), isDuplicate: false },
    }),
    prisma.newsSource.count({
      where: userId ? { OR: [{ userId }, { userId: null }] } : { userId: null },
    }),
    // Summaries of articles the user can see (own + global) — not all tenants
    prisma.summary.count({
      where: { article: visibleArticleWhere(userId) },
    }),
    prisma.article.count({
      where: {
        ...visibleArticleWhere(userId),
        isDuplicate: false,
        createdAt: { gte: today },
      },
    }),
    prisma.article.count({
      where: {
        ...visibleArticleWhere(userId),
        isDuplicate: false,
        createdAt: { gte: weekAgo },
      },
    }),
  ]);

  const [trendingTopics, newsPerDay, categoryDistribution, sourceDistribution] = await Promise.all([
    getTrendingTopics(userId, startDate, 10),
    getNewsPerDay(userId, period, startDate, now),
    getCategoryDistribution(userId, startDate, 10),
    getSourceDistribution(userId, startDate, 10),
  ]);

  return {
    totalNews,
    totalSources,
    totalSummaries,
    newsToday,
    newsThisWeek,
    trendingTopics,
    newsPerDay,
    categoryDistribution,
    sourceDistribution,
  };
}

async function getTrendingTopics(
  userId: string | undefined,
  startDate: Date,
  limit: number
): Promise<TrendingTopic[]> {
  const rows = await prisma.$queryRaw<{ name: string; slug: string; count: number }[]>`
    SELECT t."name" AS name, t."slug" AS slug, COUNT(at."articleId")::int AS count
    FROM "Topic" t
    JOIN "ArticleTag" at ON at."topicId" = t."id"
    JOIN "Article" a ON a."id" = at."articleId"
    WHERE a."isDuplicate" = false
      AND ${visibleScopeSql(userId)}
      AND ${createdAtGte(startDate)}
    GROUP BY t."id", t."name", t."slug"
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  const colors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  ];

  return rows.map((row, index) => ({
    name: row.name,
    slug: row.slug,
    count: row.count,
    color: colors[index % colors.length],
  }));
}

/**
 * Articles per time bucket over the analysis window — a single GROUP BY query
 * (no N+1) with zero-filled gaps. `24h` uses hourly buckets; other periods
 * use daily buckets.
 *
 * Bucket alignment: Prisma stores DateTime as `timestamp` (no TZ) with UTC
 * values, and the pg driver parses those as UTC Dates. date_trunc in SQL and
 * the epoch-based fill here are therefore both UTC-aligned — using local
 * midnight for the fill would miss every bucket (verified against a live DB).
 */
async function getNewsPerDay(
  userId: string | undefined,
  period: DashboardPeriod,
  startDate: Date,
  now: Date
): Promise<ChartData[]> {
  const hourly = period === '24h';
  const bucketUnit = hourly ? 'hour' : 'day';
  const stepMs = hourly ? 60 * 60 * 1000 : DAY_MS;

  // Fixed bucket count per period. For 'all', cover every day from the
  // truncated start (inclusive) to today — round() would drop the oldest day.
  const startBucketMs = Math.floor(startDate.getTime() / DAY_MS) * DAY_MS;
  const endBucketMs = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  const fullDays = Math.floor((endBucketMs - startBucketMs) / DAY_MS) + 1;
  const bucketCount = hourly
    ? 24
    : Math.min(
        MAX_DAILY_BUCKETS,
        period === '7d' ? 7 : period === '30d' ? 30 : Math.max(1, fullDays)
      );

  const rows = await prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
    SELECT date_trunc(${bucketUnit}, a."createdAt") AS bucket, COUNT(*)::bigint AS count
    FROM "Article" a
    WHERE a."isDuplicate" = false
      AND ${visibleScopeSql(userId)}
      AND ${createdAtGte(startDate)}
    GROUP BY 1
  `;

  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(new Date(row.bucket).getTime(), Number(row.count));
  }

  // Last N UTC-aligned buckets, oldest → newest
  const endBucket = Math.floor(now.getTime() / stepMs) * stepMs;
  const startBucket = endBucket - (bucketCount - 1) * stepMs;

  const results: ChartData[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const time = startBucket + i * stepMs;
    const cursor = new Date(time);
    results.push({
      name: hourly
        ? cursor.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
        : cursor.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
      value: counts.get(time) ?? 0,
      date: hourly ? cursor.toISOString() : cursor.toISOString().split('T')[0],
    });
  }

  return results;
}

async function getCategoryDistribution(
  userId: string | undefined,
  startDate: Date,
  limit: number
): Promise<ChartData[]> {
  const categories = await prisma.article.groupBy({
    by: ['category'],
    where: {
      ...visibleArticleWhere(userId),
      isDuplicate: false,
      category: { not: null },
      createdAt: { gte: startDate },
    },
    _count: true,
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: limit,
  });

  return categories.map((cat: { category: string | null; _count: number }) => ({
    name: cat.category || 'Uncategorized',
    value: cat._count,
  }));
}

async function getSourceDistribution(
  userId: string | undefined,
  startDate: Date,
  limit: number
): Promise<ChartData[]> {
  const rows = await prisma.$queryRaw<{ name: string; domain: string; count: number }[]>`
    SELECT s."name" AS name, s."domain" AS domain, COUNT(a."id")::int AS count
    FROM "NewsSource" s
    JOIN "Article" a ON a."sourceId" = s."id"
    WHERE a."isDuplicate" = false
      AND ${visibleScopeSql(userId)}
      AND ${createdAtGte(startDate)}
    GROUP BY s."id", s."name", s."domain"
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    name: row.name,
    value: row.count,
    domain: row.domain,
  }));
}
