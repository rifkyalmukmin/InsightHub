'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Search, Grid3X3, List, Filter, X } from 'lucide-react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import type { ArticleCardProps } from './article-card';

const ArticleCard = dynamic(
  () => import('./article-card').then((m) => m.ArticleCard),
  { ssr: false }
);
const ArticleListCard = dynamic(
  () => import('./article-card').then((m) => m.ArticleListCard),
  { ssr: false }
);

type ViewMode = 'grid' | 'list';

export function ArticleFeed() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid');
  // Initialize from URL so deep links like /news?topic=ai actually filter on load.
  const [searchTerm, setSearchTerm] = React.useState(() => searchParams.get('q') ?? '');
  const [selectedTopic, setSelectedTopic] = React.useState(() => searchParams.get('topic') ?? '');
  const [selectedSentiment, setSelectedSentiment] = React.useState('');

  // Keep local filter state in sync with the URL (back/forward, topic badge links).
  React.useEffect(() => {
    setSearchTerm(searchParams.get('q') ?? '');
    setSelectedTopic(searchParams.get('topic') ?? '');
  }, [searchParams]);

  const debouncedSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) params.set('q', term);
    else params.delete('q');
    router.push(`/news?${params.toString()}`);
  }, 300);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    debouncedSearch(e.target.value);
  };

  const handleTopicChange = (value: string) => {
    setSelectedTopic(value);
    const params = new URLSearchParams(searchParams);
    if (value) params.set('topic', value);
    else params.delete('topic');
    router.push(`/news?${params.toString()}`);
  };

  const handleSentimentChange = (value: string) => {
    setSelectedSentiment(value);
  };

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<{
    data: any[];
    totalPages: number;
    total: number;
  }>({
    queryKey: ['articles-feed', searchTerm, selectedTopic, selectedSentiment],
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const currentPage = allPages.length + 1;
      const totalPages = lastPage?.totalPages || 1;
      return currentPage < totalPages ? currentPage : undefined;
    },
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      params.set('page', String(pageParam));
      params.set('limit', '20');
      if (searchTerm) params.set('query', searchTerm);
      if (selectedTopic) params.set('topic', selectedTopic);
      if (selectedSentiment) params.set('sentiment', selectedSentiment);

      const res = await fetch(`/api/articles?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch articles');
      return res.json();
    },
  });

  const articles = data?.pages?.flatMap(page => page.data || []) || [];

  // Load topics for filter
  const { data: topicsData } = useQuery({
    queryKey: ['topics-list'],
    queryFn: async () => {
      const res = await fetch('/api/topics');
      if (!res.ok) throw new Error('Failed to fetch topics');
      const json = await res.json();
      return json.data || [];
    },
  });

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Skeleton className="h-9 flex-1" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            className="pl-10 h-9"
            value={searchTerm}
            onChange={handleSearch}
          />
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(''); debouncedSearch(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={selectedTopic}
            onChange={(e) => handleTopicChange(e.target.value)}
            className="h-9 w-[160px]"
          >
            <option value="">All Topics</option>
            {topicsData?.map((topic: { slug: string; name: string }) => (
              <option key={topic.slug} value={topic.slug}>
                {topic.name}
              </option>
            ))}
          </Select>

          <Select
            value={selectedSentiment}
            onChange={(e) => handleSentimentChange(e.target.value as '' | 'positive' | 'neutral' | 'negative')}
            className="h-9 w-[140px]"
          >
            <option value="">Sentiment</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </Select>

          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results count */}
      {data && (
        <p className="text-sm text-muted-foreground mb-4">
          Showing {articles.length} of {data.pages[data.pages.length - 1]?.total || articles.length} articles
        </p>
      )}

      {/* Articles */}
      {articles.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No articles found</h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search or filters, or crawl more sources.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article: ArticleCardProps['article']) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article: ArticleCardProps['article']) => (
            <ArticleListCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasNextPage && (
        <div className="flex justify-center mt-8">
          <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
