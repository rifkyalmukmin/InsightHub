import {
  StatsCards,
  NewsChart,
  CategoryChart,
  TrendingTopics,
  LatestNews,
} from '@/components/features/dashboard/lazy-dashboard';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
          <p className="text-muted-foreground">Your AI-powered news intelligence center</p>
        </div>
      </div>

      <StatsCards />

      <div className="grid gap-6 md:grid-cols-2">
        <NewsChart />
        <CategoryChart />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <TrendingTopics />
        <LatestNews />
      </div>
    </div>
  );
}
