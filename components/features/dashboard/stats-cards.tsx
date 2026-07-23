'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Newspaper, Database, FileText, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { motion } from 'framer-motion';

export function StatsCards() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const json = await res.json();
      return json.data;
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-4 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const stats = [
    {
      title: 'Total News',
      value: data?.totalNews || 0,
      icon: Newspaper,
      change: data?.newsToday || 0,
      changeType: 'today',
    },
    {
      title: 'Total Sources',
      value: data?.totalSources || 0,
      icon: Database,
      change: null,
      changeType: null,
    },
    {
      title: 'Total Summaries',
      value: data?.totalSummaries || 0,
      icon: FileText,
      change: null,
      changeType: null,
    },
    {
      title: 'News This Week',
      value: data?.newsThisWeek || 0,
      icon: TrendingUp,
      change: data?.newsToday || 0,
      changeType: 'today',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stat.value)}</div>
              {stat.change !== null && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  {stat.changeType === 'today' && (
                    <>
                      <ArrowUpRight className="h-3 w-3 text-green-500" />
                      +{stat.change} today
                    </>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </motion.div>
  );
}
