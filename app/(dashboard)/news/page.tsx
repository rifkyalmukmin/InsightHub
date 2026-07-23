import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { ArticleFeed } from '@/components/features/news/article-feed';

export default function NewsPage() {
  return (
    <DashboardLayout title="News">
      <div>
        <ArticleFeed />
      </div>
    </DashboardLayout>
  );
}
