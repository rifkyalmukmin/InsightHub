import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { StatsCards } from '@/components/features/dashboard/stats-cards';
import { NewsChart } from '@/components/features/dashboard/news-chart';
import { CategoryChart } from '@/components/features/dashboard/category-chart';
import { TrendingTopics } from '@/components/features/dashboard/trending-topics';
import { LatestNews } from '@/components/features/dashboard/latest-news';

export default function DashboardPage() {
  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
            <p className="text-muted-foreground">
              Your AI-powered news intelligence center
            </p>
          </div>
        </div>

        {/* Stats */}
        <StatsCards />

        {/* Charts Row */}
        <div className="grid gap-6 md:grid-cols-2">
          <NewsChart />
          <CategoryChart />
        </div>

        {/* Bottom Row */}
        <div className="grid gap-6 md:grid-cols-2">
          <TrendingTopics />
          <LatestNews />
        </div>
      </div>
    </DashboardLayout>
  );
}
