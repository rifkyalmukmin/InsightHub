'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export function TrendingTopics() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-trending'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      return json.data?.trendingTopics || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trending Topics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const topics = data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Trending Topics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {topics.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No trending topics yet. Start crawling news to see trends.
          </div>
        ) : (
          <div className="space-y-3">
            {topics.map((topic: { name: string; slug: string; count: number; color?: string }, index: number) => (
              <motion.div
                key={topic.slug}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="flex items-center justify-between group cursor-pointer hover:bg-accent/50 rounded-md p-2 -mx-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: topic.color || '#3B82F6' }}
                  />
                  <span className="font-medium capitalize">{topic.name}</span>
                </div>
                <Badge variant="secondary">{topic.count}</Badge>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
