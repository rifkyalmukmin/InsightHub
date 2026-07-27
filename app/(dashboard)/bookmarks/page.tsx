'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArticleCard } from '@/components/features/news/article-card';
import { Bookmark, Heart, FolderOpen } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function BookmarksPage() {
  const [activeTab, setActiveTab] = React.useState('all');
  const [activeCollection, setActiveCollection] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: async () => {
      const res = await fetch('/api/bookmarks');
      if (!res.ok) throw new Error('Failed to fetch bookmarks');
      const json = await res.json();
      return json.data || [];
    },
  });

  const { data: collectionsData } = useQuery({
    queryKey: ['bookmarks-collections'],
    queryFn: async () => {
      const res = await fetch('/api/bookmarks');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      return json.collections || [];
    },
  });

  const bookmarks = data || [];
  const collections = collectionsData || [];

  const filteredBookmarks = bookmarks.filter((b: { type: string; collection: string | null }) => {
    if (activeTab === 'favorites') return b.type === 'favorite';
    if (activeTab === 'collections' && activeCollection) return b.collection === activeCollection;
    if (activeTab === 'all') return true;
    return true;
  });

  return (
    <DashboardLayout title="Bookmarks">
      <div className="space-y-6">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All ({bookmarks.length})</TabsTrigger>
            <TabsTrigger value="favorites">
              Favorites ({bookmarks.filter((b: { type: string }) => b.type === 'favorite').length})
            </TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-64" />
                ))}
              </div>
            ) : filteredBookmarks.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16">
                  <Bookmark className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No bookmarks yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Bookmark articles to read them later.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredBookmarks.map((b: { article: typeof ArticleCard extends React.ComponentType<infer P> ? P extends { article: infer A } ? A : never : never; createdAt: string }) => (
                  <ArticleCard key={b.article.id} article={b.article} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="favorites" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
              </div>
            ) : filteredBookmarks.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16">
                  <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No favorites yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Mark articles as favorite to see them here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredBookmarks.map((b: { article: typeof ArticleCard extends React.ComponentType<infer P> ? P extends { article: infer A } ? A : never : never }) => (
                  <ArticleCard key={b.article.id} article={b.article} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="collections">
            {collections.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16">
                  <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No collections</h3>
                  <p className="text-sm text-muted-foreground">
                    Organize your bookmarks into collections.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {collections.map((c: string) => (
                    <Badge
                      key={c}
                      variant={activeCollection === c ? 'default' : 'outline'}
                      className="cursor-pointer text-sm py-1 px-3"
                      onClick={() => setActiveCollection(activeCollection === c ? null : c)}
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
                {filteredBookmarks.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredBookmarks.map((b: { article: typeof ArticleCard extends React.ComponentType<infer P> ? P extends { article: infer A } ? A : never : never }) => (
                      <ArticleCard key={b.article.id} article={b.article} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
