import { addDays, addMonths } from 'date-fns';
import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { startCrawlJob } from '@/services/crawl/crawler';
import { importRssFeed } from '@/services/rss/importer';

export type AutoRefreshInterval = 'none' | 'daily' | 'weekly' | 'monthly';

export const AUTO_REFRESH_INTERVALS: AutoRefreshInterval[] = [
  'none',
  'daily',
  'weekly',
  'monthly',
];

/** Compute the next scheduled run for an auto-refresh interval (null = never). */
export function computeNextCrawlAt(
  interval: string,
  from: Date = new Date()
): Date | null {
  switch (interval) {
    case 'daily':
      return addDays(from, 1);
    case 'weekly':
      return addDays(from, 7);
    case 'monthly':
      return addMonths(from, 1);
    default:
      return null;
  }
}

interface DueSourceLike {
  autoRefresh: string;
  nextCrawlAt: Date | null;
}

/** A source is due when auto-refresh is enabled and the window has elapsed. */
export function isAutoRefreshDue(source: DueSourceLike): boolean {
  if (source.autoRefresh === 'none') return false;
  if (!source.nextCrawlAt) return true;
  return source.nextCrawlAt.getTime() <= Date.now();
}

/**
 * Scheduler pass for the crawl worker.
 *
 * Finds every source whose auto-refresh window has elapsed and kicks off a
 * sync: RSS feed import for sources with a feedUrl, otherwise a Firecrawl
 * crawl job. The next run time is computed *before* syncing so a crash during
 * the sync cannot retrigger the same source repeatedly.
 */
export async function runDueSourceSyncs(): Promise<number> {
  const due = await prisma.newsSource.findMany({
    where: {
      status: 'active',
      autoRefresh: { not: 'none' },
      OR: [{ nextCrawlAt: null }, { nextCrawlAt: { lte: new Date() } }],
    },
    select: {
      id: true,
      name: true,
      url: true,
      feedUrl: true,
      autoRefresh: true,
      userId: true,
    },
    take: 20,
  });

  for (const source of due) {
    const nextCrawlAt = computeNextCrawlAt(source.autoRefresh);
    await prisma.newsSource.update({
      where: { id: source.id },
      data: { nextCrawlAt },
    });

    logger.info(
      { sourceId: source.id, name: source.name, nextCrawlAt },
      'Auto-refresh triggered for source'
    );

    try {
      if (source.feedUrl) {
        // RSS import is fast and safe to run inline; failures are logged and
        // the next window still applies (avoid hammering a broken feed).
        importRssFeed(source.id).catch((error) =>
          logger.warn(
            { sourceId: source.id, error: error instanceof Error ? error.message : error },
            'Scheduled RSS import failed'
          )
        );
      } else {
        await startCrawlJob({
          url: source.url ?? source.name,
          sourceId: source.id,
          maxPages: 10,
          depth: 1,
          userId: source.userId ?? undefined,
        });
      }
    } catch (error) {
      logger.warn(
        { sourceId: source.id, error: error instanceof Error ? error.message : error },
        'Scheduled sync failed'
      );
    }
  }

  return due.length;
}
