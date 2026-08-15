'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, Edit, RefreshCw, Globe, CheckCircle2, XCircle, Loader2, Newspaper } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isPolling, setIsPolling] = React.useState(false);
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isCrawlOpen, setIsCrawlOpen] = React.useState(false);
  const [isKompasOpen, setIsKompasOpen] = React.useState(false);
  const [selectedPresets, setSelectedPresets] = React.useState<string[]>([]);
  const [selectedSource, setSelectedSource] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState({
    name: '',
    domain: '',
    url: '',
    feedUrl: '',
    description: '',
    category: '',
    autoRefresh: 'none',
  });

  const { data: sources, isLoading, isError, refetch } = useQuery({
    queryKey: ['sources'],
    queryFn: async () => {
      const res = await fetch('/api/sources');
      if (!res.ok) throw new Error('Failed to fetch sources');
      const json = await res.json();
      return json.data || [];
    },
    refetchInterval: isPolling ? 5000 : false,
    placeholderData: (prev) => prev,
  });

  const sourceList = React.useMemo(() => sources ?? [], [sources]);

  React.useEffect(() => {
    if (!isPolling || sourceList.length === 0) return;

    const anyRunning = sourceList.some(
      (s: { crawlLogs: { status: string }[] }) => s.crawlLogs[0]?.status === 'running'
    );

    if (!anyRunning) {
      setIsPolling(false);
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    }
  }, [sourceList, isPolling, queryClient]);

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setIsAddOpen(false);
      setFormData({
        name: '',
        domain: '',
        url: '',
        feedUrl: '',
        description: '',
        category: '',
        autoRefresh: 'none',
      });
      const imported = data.data?.importResult;
      if (imported?.ok) {
        toast({ title: 'Feed imported', description: imported.message });
      } else if (imported && !imported.ok) {
        toast({
          title: 'Source added, feed failed',
          description: imported.message,
          variant: 'destructive',
        });
      }
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

  const { data: kompasPresets, isLoading: presetsLoading } = useQuery({
    queryKey: ['kompas-presets'],
    queryFn: async () => {
      const res = await fetch('/api/sources/presets');
      if (!res.ok) throw new Error('Failed to fetch presets');
      const json = await res.json();
      return json.data || [];
    },
    enabled: isKompasOpen,
  });

  const addKompasPresets = useMutation({
    mutationFn: async (slugs: string[]) => {
      const res = await fetch('/api/sources/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs }),
      });
      if (!res.ok) throw new Error('Failed to add presets');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['kompas-presets'] });
      setIsKompasOpen(false);
      setSelectedPresets([]);
      toast({
        title: 'Sections added',
        description: data.message,
      });
    },
    onError: () => {
      toast({
        title: 'Failed to add',
        description: 'Could not add the Kompas.id sections.',
        variant: 'destructive',
      });
    },
  });

  React.useEffect(() => {
    if (!isKompasOpen || !kompasPresets) return;
    setSelectedPresets(
      kompasPresets
        .filter((p: { added: boolean }) => !p.added)
        .map((p: { slug: string }) => p.slug)
    );
  }, [isKompasOpen, kompasPresets]);

  const togglePreset = (slug: string) => {
    setSelectedPresets((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const syncSource = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await fetch(`/api/sources/${sourceId}/sync`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Sync failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setIsPolling(true);
      toast({
        title: data.data?.type === 'rss' ? 'Feed synced' : 'Crawl started',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      setIsCrawlOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Sync failed',
        description:
          error instanceof Error
            ? error.message
            : 'Check your API keys and the source URL.',
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
      syncSource.mutate(selectedSource);
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
                    <Select
                      id="source-select"
                      value={selectedSource || ''}
                      onChange={(e) => setSelectedSource(e.target.value)}
                    >
                      <option value="">Select a source...</option>
                      {sourceList.map((s: { id: string; name: string }) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    onClick={handleCrawl}
                    disabled={syncSource.isPending || !selectedSource}
                    className="w-full"
                  >
                    {syncSource.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Start Crawling
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog
              open={isKompasOpen}
              onOpenChange={(open) => {
                setIsKompasOpen(open);
                if (!open) setSelectedPresets([]);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Newspaper className="h-4 w-4 mr-2" />
                  Kompas.id
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Kompas.id Sections</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Choose a news section to crawl. Use <strong>Latest News</strong> or{' '}
                  <strong>National</strong> for the best results.
                </p>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                  {presetsLoading ? (
                    [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)
                  ) : (
                    kompasPresets?.map(
                      (preset: {
                        slug: string;
                        name: string;
                        description: string;
                        category: string;
                        added: boolean;
                      }) => (
                        <label
                          key={preset.slug}
                          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                            preset.added
                              ? 'opacity-50 cursor-not-allowed bg-muted/30'
                              : selectedPresets.includes(preset.slug)
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedPresets.includes(preset.slug)}
                            disabled={preset.added}
                            onChange={() => togglePreset(preset.slug)}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{preset.name}</p>
                            <p className="text-xs text-muted-foreground">{preset.description}</p>
                            {preset.added && (
                              <Badge variant="secondary" className="text-[10px] mt-1">
                                Already added
                              </Badge>
                            )}
                          </div>
                        </label>
                      )
                    )
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const available =
                        kompasPresets
                          ?.filter((p: { added: boolean }) => !p.added)
                          .map((p: { slug: string }) => p.slug) ?? [];
                      setSelectedPresets(available);
                    }}
                    disabled={presetsLoading}
                  >
                    Select All
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={
                      addKompasPresets.isPending ||
                      selectedPresets.length === 0 ||
                      presetsLoading
                    }
                    onClick={() => addKompasPresets.mutate(selectedPresets)}
                  >
                    {addKompasPresets.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Add ({selectedPresets.length})
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
                    <Label htmlFor="feedUrl">RSS Feed URL (optional)</Label>
                    <Input
                      id="feedUrl"
                      value={formData.feedUrl}
                      onChange={(e) => setFormData({ ...formData, feedUrl: e.target.value })}
                      placeholder="https://techcrunch.com/feed/"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      When set, articles are imported straight from the feed — no crawl needed.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="autoRefresh">Auto-refresh</Label>
                    <Select
                      id="autoRefresh"
                      value={formData.autoRefresh}
                      onChange={(e) => setFormData({ ...formData, autoRefresh: e.target.value })}
                    >
                      <option value="none">Off</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Re-sync this source automatically (requires the crawl worker to be running).
                    </p>
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
        {isLoading && sourceList.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : isError && sourceList.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Failed to load sources</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Too many requests. Wait a moment and try again.
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : sourceList.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sources yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add Kompas.id sections or other news sources.
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Button onClick={() => setIsKompasOpen(true)}>
                  <Newspaper className="h-4 w-4 mr-2" />
                  Kompas.id
                </Button>
                <Button variant="outline" onClick={() => setIsAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Source
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sourceList.map((source: {
              id: string;
              name: string;
              domain: string;
              url: string;
              feedUrl: string | null;
              autoRefresh: string;
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
                          {source.feedUrl && (
                            <Badge variant="outline" className="text-[10px]">
                              RSS
                            </Badge>
                          )}
                          {source.autoRefresh !== 'none' && (
                            <Badge variant="secondary" className="text-[10px]">
                              {source.autoRefresh}
                            </Badge>
                          )}
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
                        onClick={() => syncSource.mutate(source.id)}
                        disabled={syncSource.isPending}
                        title={source.feedUrl ? 'Sync RSS feed' : 'Crawl now'}
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
