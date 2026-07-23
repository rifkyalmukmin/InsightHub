'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatRelativeTime, truncate } from '@/lib/utils/format';
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  User,
  Calendar,
  Bookmark,
  Heart,
  Share2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ArticleDetailPage() {
  const params = useParams();
  const articleId = params.id as string;

  const { data: article, isLoading } = useQuery({
    queryKey: ['article', articleId],
    queryFn: async () => {
      const res = await fetch(`/api/articles/${articleId}`);
      if (!res.ok) throw new Error('Failed to fetch article');
      const json = await res.json();
      return json.data;
    },
    enabled: !!articleId,
  });

  if (isLoading) {
    return (
      <DashboardLayout title="Article">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-3/4" />
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-20" />)}
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!article) {
    return (
      <DashboardLayout title="Article">
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Article not found</h2>
          <Link href="/news">
            <Button variant="outline">Back to News</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Article Details">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button */}
        <Link href="/news">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to News
          </Button>
        </Link>

        {/* Hero */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {article.category && (
              <Badge>{article.category}</Badge>
            )}
            {article.sentiment && (
              <Badge
                variant={
                  article.sentiment === 'positive'
                    ? 'success'
                    : article.sentiment === 'negative'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {article.sentiment}
              </Badge>
            )}
            {article.status === 'summarized' && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Summarized
              </Badge>
            )}
          </div>

          <h1 className="text-3xl font-bold leading-tight">{article.title}</h1>

          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {article.author && (
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {article.author}
              </span>
            )}
            {article.publishDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(article.publishDate)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatRelativeTime(article.createdAt)}
            </span>
            {article.readingTime && <span>· {article.readingTime} min read</span>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Source:</span>
            <Badge variant="secondary">{article.source?.name}</Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Bookmark className="h-4 w-4 mr-2" />
            Bookmark
          </Button>
          <Button variant="outline" size="sm">
            <Heart className="h-4 w-4 mr-2" />
            Favorite
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Original Article
            </a>
          </Button>
        </div>

        {/* Topics */}
        {article.topics && article.topics.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Topics:</span>
            {article.topics.map((t: { topic: { name: string; slug: string } }) => (
              <Link key={t.topic.slug} href={`/topics/${t.topic.slug}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                  {t.topic.name}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {/* AI Summary */}
        {article.summary ? (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  AI Summary
                </h2>
                <p className="text-muted-foreground">{article.summary.short}</p>
              </div>

              {article.summary.keyTakeaways && article.summary.keyTakeaways.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Key Takeaways</h3>
                  <ul className="space-y-1">
                    {article.summary.keyTakeaways.map((takeaway: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-primary font-bold">·</span>
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {article.summary.insights && article.summary.insights.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Insights</h3>
                  <ul className="space-y-1">
                    {article.summary.insights.map((insight: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-primary font-bold">·</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {article.summary.conclusion && (
                <div className="bg-muted/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold mb-1">Conclusion</h3>
                  <p className="text-sm text-muted-foreground">{article.summary.conclusion}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : article.status === 'crawled' ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground mb-4">
                This article hasn&apos;t been summarized yet.
              </p>
              <Button>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Summarize Now
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Full Content */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Full Article</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{article.markdown || article.content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
