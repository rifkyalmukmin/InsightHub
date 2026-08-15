'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  User,
  Calendar,
  Bookmark,
  Share2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';

export default function ArticleDetailPage() {
  const params = useParams();
  const articleId = params.id as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const { data: similarArticles } = useQuery({
    queryKey: ['article-similar', articleId],
    queryFn: async () => {
      const res = await fetch(`/api/articles/${articleId}/similar?limit=5`);
      if (!res.ok) throw new Error('Failed to fetch similar articles');
      const json = await res.json();
      return (json.data || []) as {
        article: {
          id: string;
          title: string;
          source: { name: string } | null;
          summary: { short: string | null } | null;
        };
        score: number;
      }[];
    },
    enabled: !!articleId,
  });

  const isBookmarked = (article?.bookmarks?.length ?? 0) > 0;

  const toggleBookmark = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });
      if (!res.ok) throw new Error('Failed to toggle bookmark');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['article', articleId] });
      toast({ title: data.data ? 'Article bookmarked' : 'Bookmark removed' });
    },
    onError: () => toast({ title: 'Failed to update bookmark', variant: 'destructive' }),
  });

  const summarize = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });
      if (!res.ok) throw new Error('Failed to summarize');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article', articleId] });
      toast({ title: 'Article summarized successfully' });
    },
    onError: () => toast({ title: 'Summarization failed', variant: 'destructive' }),
  });

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/news/${articleId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: article?.title, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: 'Link copied to clipboard' });
      }
    } catch {
      // User cancelled
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-20" />)}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Article not found</h2>
        <Link href="/news">
          <Button variant="outline">Back to News</Button>
        </Link>
      </div>
    );
  }

  const topics = article.tags ?? article.topics ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/news">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to News
        </Button>
      </Link>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {article.category && <Badge>{article.category}</Badge>}
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
          {article.summary && (
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

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => toggleBookmark.mutate()}
          disabled={toggleBookmark.isPending}
        >
          <Bookmark className={cn('h-4 w-4 mr-2', isBookmarked && 'fill-current')} />
          {isBookmarked ? 'Bookmarked' : 'Bookmark'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleShare}>
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

      {topics.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Topics:</span>
          {topics.map((t: { topic: { name: string; slug: string } }) => (
            <Link key={t.topic.slug} href={`/news?topic=${t.topic.slug}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                {t.topic.name}
              </Badge>
            </Link>
          ))}
        </div>
      )}

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

            {article.summary.keyTakeaways?.length > 0 && (
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

            {article.summary.insights?.length > 0 && (
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
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              This article hasn&apos;t been summarized yet.
            </p>
            <Button onClick={() => summarize.mutate()} disabled={summarize.isPending}>
              {summarize.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Summarize Now
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Full Article</h2>
          <SafeMarkdown className="prose prose-sm dark:prose-invert max-w-none">
            {article.markdown || article.content}
          </SafeMarkdown>
        </CardContent>
      </Card>

      {similarArticles && similarArticles.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Similar Articles
            </h2>
            <div className="space-y-3">
              {similarArticles.map(({ article: similar, score }) => (
                <Link
                  key={similar.id}
                  href={`/news/${similar.id}`}
                  className="block rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-sm line-clamp-2">{similar.title}</h3>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {Math.round(score * 100)}% match
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {similar.source?.name && <span>{similar.source.name}</span>}
                    {similar.summary?.short && (
                      <span className="line-clamp-1">{similar.summary.short}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
