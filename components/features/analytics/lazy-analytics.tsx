'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const ChartSkeleton = () => <Skeleton className="h-[400px] w-full rounded-lg" />;

export const AnalyticsCharts = dynamic(
  () => import('./analytics-charts').then((m) => m.AnalyticsCharts),
  { loading: () => <ChartSkeleton />, ssr: false }
);
