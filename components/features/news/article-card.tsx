'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatRelativeTime, truncate } from '@/lib/utils/format';
import { ExternalLink, Clock, FileText, Bookmark, Heart, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import Image from 'next/image';

export interface ArticleCardProps {
  article: {
    id: string;
    title: string;
    url: string;
    imageUrl?: string | null;
    summary: { short: string; headline?: string } | null;
    source: { name: string; domain: string } | null;
    author?: string | null;
    publishDate?: string | null;
    createdAt: string;
    category?: string | null;
    sentiment?: string | null;
    readingTime?: number | null;
    topics: { topic: { name: string; slug: string } }[];
    bookmark?: { id: string; type: string } | null;
  };
}

export function ArticleCard({ article }: ArticleCardProps) {
  const hasImage = article.imageUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group"
    >
      <Card className="h-full flex flex-col overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50">
        {hasImage && article.imageUrl && (
          <div className="relative h-40 w-full overflow-hidden">
            <Image
              src={article.imageUrl}
              alt={article.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        )}
        <CardContent className="flex-1 flex flex-col p-4">
          <div className="flex items-center gap-2 mb-2">
            {article.source?.name && (
              <Badge variant="secondary" className="text-[10px]">
                {article.source.name}
              </Badge>
            )}
            {article.category && (
              <Badge variant="outline" className="text-[10px]">
                {article.category}
              </Badge>
            )}
            {article.sentiment && (
              <Badge
                variant={article.sentiment === 'positive' ? 'success' : article.sentiment === 'negative' ? 'destructive' : 'secondary'}
                className="text-[10px]"
              >
                {article.sentiment}
              </Badge>
            )}
          </div>

          <Link href={`/news/${article.id}`}>
            <h3 className="font-semibold text-base leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
              {article.summary?.headline || article.title}
            </h3>
          </Link>

          {article.summary?.short && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2 flex-1">
              {truncate(article.summary.short, 120)}
            </p>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {article.topics?.slice(0, 2).map((t) => (
                <Link key={t.topic.slug} href={`/topics/${t.topic.slug}`}>
                  <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-primary/10">
                    {t.topic.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(article.createdAt)}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Bookmark className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function ArticleListCard({ article }: ArticleCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ x: 4 }}
      transition={{ duration: 0.2 }}
    >
      <Link href={`/news/${article.id}`}>
        <Card className="group hover:shadow-md transition-all duration-200">
          <CardContent className="p-4 flex gap-4">
            {article.imageUrl && (
              <div className="relative h-20 w-28 shrink-0 rounded-md overflow-hidden">
                <Image
                  src={article.imageUrl}
                  alt={article.title}
                  fill
                  className="object-cover"
                  sizes="112px"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {article.source?.name && (
                  <Badge variant="secondary" className="text-[10px]">
                    {article.source.name}
                  </Badge>
                )}
                {article.category && (
                  <Badge variant="outline" className="text-[10px]">
                    {article.category}
                  </Badge>
                )}
              </div>
              <h3 className="font-medium text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                {article.summary?.headline || article.title}
              </h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(article.createdAt)}
                </span>
                {article.readingTime && <span>· {article.readingTime} min read</span>}
                {article.topics?.slice(0, 2).map((t) => (
                  <Badge key={t.topic.slug} variant="outline" className="text-[10px]">
                    {t.topic.name}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
