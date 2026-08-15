'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Activity, Clock, FileText, Eye } from 'lucide-react';
import { AnalyticsCharts } from '@/components/features/analytics/lazy-analytics';
import { Select } from '@/components/ui/select';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = React.useState('7d');

  const { data: stats } = useQuery({
    queryKey: ['analytics-stats', timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?period=${timeRange}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const json = await res.json();
      return json.data || {};
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-muted-foreground">Track your news consumption patterns</p>
        <Select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="h-10 w-[150px]"
        >
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Articles</p>
                <h3 className="text-2xl font-bold">{stats?.totalNews ?? 0}</h3>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Summaries</p>
                <h3 className="text-2xl font-bold">{stats?.totalSummaries ?? 0}</h3>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Articles Today</p>
                <h3 className="text-2xl font-bold">{stats?.newsToday ?? 0}</h3>
              </div>
              <Eye className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <h3 className="text-2xl font-bold">{stats?.newsThisWeek ?? 0}</h3>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <AnalyticsCharts timeRange={timeRange} />
    </div>
  );
}
