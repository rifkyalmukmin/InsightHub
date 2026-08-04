'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

function ChartSkeleton() {
  return <Skeleton className="h-[380px] w-full rounded-lg" />;
}

export const NewsChart = dynamic(
  () => import('./news-chart').then((m) => m.NewsChart),
  { loading: () => <ChartSkeleton />, ssr: false }
);

export const CategoryChart = dynamic(
  () => import('./category-chart').then((m) => m.CategoryChart),
  { loading: () => <ChartSkeleton />, ssr: false }
);

export const TrendingTopics = dynamic(
  () => import('./trending-topics').then((m) => m.TrendingTopics),
  { loading: () => <ChartSkeleton />, ssr: false }
);

export const LatestNews = dynamic(
  () => import('./latest-news').then((m) => m.LatestNews),
  { loading: () => <ChartSkeleton />, ssr: false }
);

export const StatsCards = dynamic(
  () => import('./stats-cards').then((m) => m.StatsCards),
  { loading: () => <Skeleton className="h-28 w-full" />, ssr: false }
);
