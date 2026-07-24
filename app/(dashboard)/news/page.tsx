import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { ArticleFeed } from '@/components/features/news/article-feed';
import { Suspense } from 'react';

export default function NewsPage() {
  return (
    <DashboardLayout title="News">
      <div>
        <Suspense fallback={<div>Loading...</div>}>
          <ArticleFeed />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
