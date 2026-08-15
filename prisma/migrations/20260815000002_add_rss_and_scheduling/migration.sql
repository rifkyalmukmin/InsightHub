-- Add RSS feed import and scheduled auto-refresh support to NewsSource.

ALTER TABLE "NewsSource" ADD COLUMN "feedUrl" TEXT;
ALTER TABLE "NewsSource" ADD COLUMN "autoRefresh" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "NewsSource" ADD COLUMN "nextCrawlAt" TIMESTAMP(3);

CREATE INDEX "NewsSource_autoRefresh_idx" ON "NewsSource"("autoRefresh");
CREATE INDEX "NewsSource_nextCrawlAt_idx" ON "NewsSource"("nextCrawlAt");
