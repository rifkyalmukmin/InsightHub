import { ArticleFeed } from '@/components/features/news/article-feed';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewsPage() {
  return (
    <div>
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        }
      >
        <ArticleFeed />
      </Suspense>
    </div>
  );
}
