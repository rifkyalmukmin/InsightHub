'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, Edit, RefreshCw, Globe, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isPolling, setIsPolling] = React.useState(false);
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isCrawlOpen, setIsCrawlOpen] = React.useState(false);
  const [selectedSource, setSelectedSource] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState({
    name: '',
    domain: '',
    url: '',
    description: '',
    category: '',
  });

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: async () => {
      const res = await fetch('/api/sources');
      if (!res.ok) throw new Error('Failed to fetch sources');
      const json = await res.json();
      return json.data || [];
    },
    refetchInterval: isPolling ? 3000 : false,
  });

  React.useEffect(() => {
    if (!isPolling || !sources) return;

    const anyRunning = sources.some(
      (s: { crawlLogs: { status: string }[] }) => s.crawlLogs[0]?.status === 'running'
    );

    if (!anyRunning) {
      setIsPolling(false);
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    }
  }, [sources, isPolling, queryClient]);

  const addSource = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to add source');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setIsAddOpen(false);
      setFormData({ name: '', domain: '', url: '', description: '', category: '' });
    },
  });

  const deleteSource = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete source');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  const crawlSource = useMutation({
    mutationFn: async ({ sourceId, url }: { sourceId: string; url: string }) => {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, url }),
      });
      if (!res.ok) throw new Error('Crawl failed');
      return res.json();
    },
    onSuccess: () => {
      setIsPolling(true);
      toast({
        title: 'Crawl dimulai',
        description: 'Sedang mengambil berita. Halaman akan diperbarui otomatis.',
      });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setIsCrawlOpen(false);
    },
    onError: () => {
      toast({
        title: 'Crawl gagal',
        description: 'Periksa FIRECRAWL_API_KEY dan URL sumber berita.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addSource.mutate(formData);
  };

  const handleCrawl = () => {
    if (selectedSource) {
      const source = sources?.find((s: { id: string }) => s.id === selectedSource);
      if (source) {
        crawlSource.mutate({ sourceId: selectedSource, url: source.url });
      }
    }
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-muted-foreground">Manage your news sources</p>
          <div className="flex items-center gap-2">
            <Dialog open={isCrawlOpen} onOpenChange={setIsCrawlOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Crawl
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crawl Source</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="source-select">Select Source</Label>
                    <select
                      id="source-select"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={selectedSource || ''}
                      onChange={(e) => setSelectedSource(e.target.value)}
                    >
                      <option value="">Select a source...</option>
                      {sources?.map((s: { id: string; name: string }) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    onClick={handleCrawl}
                    disabled={crawlSource.isPending || !selectedSource}
                    className="w-full"
                  >
                    {crawlSource.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Start Crawling
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Source
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Source</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="TechCrunch"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="domain">Domain</Label>
                    <Input
                      id="domain"
                      value={formData.domain}
                      onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                      placeholder="techcrunch.com"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="url">URL</Label>
                    <Input
                      id="url"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder="https://techcrunch.com"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Tech news and startups"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category (optional)</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Technology"
                    />
                  </div>
                  <Button type="submit" disabled={addSource.isPending} className="w-full">
                    Add Source
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Sources List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : sources?.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sources yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add a news source to start crawling articles.
              </p>
              <Button onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Source
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sources.map((source: {
              id: string;
              name: string;
              domain: string;
              url: string;
              status: string;
              lastCrawlAt: string | null;
              _count: { articles: number };
              crawlLogs: { status: string; pagesCrawled: number | null; pagesTotal: number | null; createdAt: string; error: string | null }[];
            }) => (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <CardContent className="p-4 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Globe className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{source.name}</h3>
                        <p className="text-sm text-muted-foreground">{source.domain}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={
                              source.status === 'active'
                                ? 'success'
                                : source.status === 'error'
                                ? 'destructive'
                                : 'secondary'
                            }
                            className="text-[10px]"
                          >
                            {source.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {source._count.articles} articles
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {source.lastCrawlAt && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          {formatRelativeTime(source.lastCrawlAt)}
                        </span>
                      )}
                      {source.crawlLogs[0]?.status === 'running' && (
                        <span className="flex items-center gap-1 text-primary">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Crawling...
                        </span>
                      )}
                      {source.crawlLogs[0]?.status === 'error' && (
                        <span className="flex items-center gap-1 text-destructive">
                          <XCircle className="h-4 w-4" />
                          {source.crawlLogs[0].error?.slice(0, 50)}...
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => crawlSource.mutate({ sourceId: source.id, url: source.url })}
                        disabled={crawlSource.isPending}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSource.mutate(source.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
    </div>
  );
}
