import prisma from '@/lib/db/prisma';
import { DashboardStats, TrendingTopic, ChartData } from '@/types';

export async function getDashboardStats(userId?: string): Promise<DashboardStats> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [totalNews, totalSources, totalSummaries, newsToday, newsThisWeek] = await Promise.all([
    prisma.article.count({
      where: { userId: userId || undefined, isDuplicate: false },
    }),
    prisma.newsSource.count({
      where: { userId: userId || undefined },
    }),
    prisma.summary.count(),
    prisma.article.count({
      where: {
        userId: userId || undefined,
        createdAt: { gte: today },
        isDuplicate: false,
      },
    }),
    prisma.article.count({
      where: {
        userId: userId || undefined,
        createdAt: { gte: weekAgo },
        isDuplicate: false,
      },
    }),
  ]);

  const [trendingTopics, newsPerDay, categoryDistribution, sourceDistribution] = await Promise.all([
    getTrendingTopics(userId, 10),
    getNewsPerDay(userId, 7),
    getCategoryDistribution(userId),
    getSourceDistribution(userId, 10),
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

async function getTrendingTopics(userId?: string, limit: number = 10): Promise<TrendingTopic[]> {
  const topics = await prisma.topic.findMany({
    include: {
      _count: {
        select: { articles: true },
      },
    },
    orderBy: {
      articles: {
        _count: 'desc',
      },
    },
    take: limit,
  });

  const colors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  ];

  return topics.map((topic: { name: string; slug: string; _count: { articles: number }; color?: string | null }, index: number) => ({
    name: topic.name,
    slug: topic.slug,
    count: topic._count.articles,
    color: colors[index % colors.length] || topic.color || undefined,
  }));
}

async function getNewsPerDay(userId?: string, days: number = 7): Promise<ChartData[]> {
  const results: ChartData[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const count = await prisma.article.count({
      where: {
        userId: userId || undefined,
        createdAt: { gte: dayStart, lt: dayEnd },
        isDuplicate: false,
      },
    });

    results.push({
      name: date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
      value: count,
      date: date.toISOString().split('T')[0],
    });
  }

  return results;
}

async function getCategoryDistribution(userId?: string): Promise<ChartData[]> {
  const categories = await prisma.article.groupBy({
    by: ['category'],
    where: {
      userId: userId || undefined,
      isDuplicate: false,
      category: { not: null },
    },
    _count: true,
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: 10,
  });

  return categories.map((cat: { category: string | null; _count: number }) => ({
    name: cat.category || 'Uncategorized',
    value: cat._count,
  }));
}

async function getSourceDistribution(userId?: string, limit: number = 10): Promise<ChartData[]> {
  const sources = await prisma.newsSource.findMany({
    where: { userId: userId || undefined },
    include: {
      _count: {
        select: { articles: true },
      },
    },
    orderBy: {
      articles: {
        _count: 'desc',
      },
    },
    take: limit,
  });

  return sources.map((source: { name: string; domain: string; _count: { articles: number } }) => ({
    name: source.name,
    value: source._count.articles,
    domain: source.domain,
  }));
}

export async function getAnalyticsData(userId?: string) {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    articlesBySentiment,
    articlesByDay,
    topSources,
    topTopics,
    crawlStats,
  ] = await Promise.all([
    prisma.article.groupBy({
      by: ['sentiment'],
      where: {
        userId: userId || undefined,
        sentiment: { not: null },
        isDuplicate: false,
      },
      _count: true,
    }),
    prisma.article.groupBy({
      by: ['createdAt'],
      where: {
        userId: userId || undefined,
        createdAt: { gte: weekAgo },
        isDuplicate: false,
      },
      _count: true,
    }),
    prisma.newsSource.findMany({
      where: { userId: userId || undefined },
      include: {
        _count: { select: { articles: true } },
      },
      orderBy: { articles: { _count: 'desc' } },
      take: 10,
    }),
    prisma.topic.findMany({
      include: {
        _count: { select: { articles: true } },
      },
      orderBy: { articles: { _count: 'desc' } },
      take: 15,
    }),
    prisma.crawlLog.groupBy({
      by: ['status'],
      where: { createdAt: { gte: weekAgo } },
      _count: true,
    }),
  ]);

  return {
    sentimentDistribution: articlesBySentiment.map((s: { sentiment: string | null; _count: number }) => ({
      sentiment: s.sentiment || 'unknown',
      count: s._count,
    })),
    articlesByDay,
    topSources: topSources.map((s: { name: string; domain: string; _count: { articles: number }; status: string }) => ({
      name: s.name,
      domain: s.domain,
      articles: s._count.articles,
      status: s.status,
    })),
    topTopics: topTopics.map((t: { name: string; slug: string; _count: { articles: number } }) => ({
      name: t.name,
      slug: t.slug,
      articles: t._count.articles,
    })),
    crawlStats: crawlStats.map((s: { status: string; _count: number }) => ({
      status: s.status,
      count: s._count,
    })),
  };
}
