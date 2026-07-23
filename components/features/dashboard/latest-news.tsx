'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatRelativeTime, truncate } from '@/lib/utils/format';
import { ExternalLink, Clock, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

export function LatestNews() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-latest'],
    queryFn: async () => {
      const res = await fetch('/api/articles?limit=5');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      return json.data || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest News</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const articles = data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Latest News</span>
          <Link href="/news" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {articles.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No articles yet. Add a source and start crawling.
          </div>
        ) : (
          <div className="space-y-4">
            {articles.map((article: {
              id: string;
              title: string;
              summary: { short: string } | null;
              source: { name: string } | null;
              createdAt: string;
              topics: { topic: { name: string } }[];
            }, index: number) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <Link
                  href={`/news/${article.id}`}
                  className="group flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors -mx-3"
                >
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                        {truncate(article.title, 80)}
                      </h4>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {article.summary?.short && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {truncate(article.summary.short, 100)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(article.createdAt)}
                      </span>
                      {article.source?.name && (
                        <span className="text-xs text-muted-foreground">· {article.source.name}</span>
                      )}
                      {article.topics?.slice(0, 2).map((t) => (
                        <Badge key={t.topic.name} variant="secondary" className="text-[10px]">
                          {t.topic.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
