'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';
import { Plus, Tags as TagsIcon, Trash2, FileText, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TopicsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [newTopic, setNewTopic] = React.useState({ name: '', description: '', color: '#3B82F6' });
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);

  const { data: topics, isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const res = await fetch('/api/topics');
      if (!res.ok) throw new Error('Failed to fetch topics');
      const json = await res.json();
      return json.data || [];
    },
  });

  const addTopic = useMutation({
    mutationFn: async (data: typeof newTopic) => {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to add topic');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      setIsAddOpen(false);
      setNewTopic({ name: '', description: '', color: '#3B82F6' });
    },
  });

  const deleteTopic = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/topics/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete topic');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      toast({ title: 'Topic deleted' });
    },
    onError: (error) => {
      toast({
        title: 'Failed to delete topic',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTopic.mutate(newTopic);
  };

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-muted-foreground">Categorize and organize your news</p>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Topic
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Topic</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="topic-name">Name</Label>
                  <Input
                    id="topic-name"
                    value={newTopic.name}
                    onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
                    placeholder="AI"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="topic-desc">Description (optional)</Label>
                  <Input
                    id="topic-desc"
                    value={newTopic.description}
                    onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                    placeholder="Artificial Intelligence news"
                  />
                </div>
                <div>
                  <Label htmlFor="topic-color">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="topic-color"
                      value={newTopic.color}
                      onChange={(e) => setNewTopic({ ...newTopic, color: e.target.value })}
                      className="h-10 w-10 rounded cursor-pointer border-0"
                    />
                    <Input
                      value={newTopic.color}
                      onChange={(e) => setNewTopic({ ...newTopic, color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={addTopic.isPending} className="w-full">
                  Create Topic
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete topic?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove <span className="font-semibold text-foreground">{deleteTarget?.name}</span>{' '}
                from all articles it is linked to. The articles themselves are not deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteTopic.isPending}
                onClick={() => {
                  if (deleteTarget) deleteTopic.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                {deleteTopic.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : topics?.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <TagsIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No topics yet</h3>
              <p className="text-sm text-muted-foreground">
                Topics are automatically created when you crawl news.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic: {
              id: string;
              name: string;
              slug: string;
              description: string | null;
              color: string | null;
              _count: { articles: number };
            }) => (
              <motion.div key={topic.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: topic.color || '#3B82F6' }}
                        />
                        <div>
                          <h3 className="font-semibold capitalize">{topic.name}</h3>
                          {topic.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {topic.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">
                          <FileText className="h-3 w-3 mr-1" />
                          {topic._count.articles}
                        </Badge>
                        {session?.user?.role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setDeleteTarget({ id: topic.id, name: topic.name })}
                            title="Delete topic"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
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
