import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser, isAdmin } from '@/lib/auth/session';
import { validateBody, articleIdSchema } from '@/lib/validations';
import { consumeUsage } from '@/lib/utils/usage';
import { startCrawlJob } from '@/services/crawl/crawler';
import { importRssFeed } from '@/services/rss/importer';
import { internalServerError } from '@/lib/utils/api-error';
import prisma from '@/lib/db/prisma';

/**
 * Sync a source now:
 * - RSS source (feedUrl set) → import the feed inline (free, no paid API).
 * - Otherwise → enqueue a Firecrawl crawl job for the worker.
 */
export const POST = withRateLimit(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const auth = await getSessionUser();
      if (auth.error) return auth.error;
      const userId = auth.user.id;

      const { id: rawId } = await params;
      const idValidation = validateBody(articleIdSchema, { id: rawId });
      if (!idValidation.success) {
        return NextResponse.json(
          { success: false, error: idValidation.error },
          { status: 400 }
        );
      }
      const { id } = idValidation.data;

      const source = await prisma.newsSource.findUnique({ where: { id } });
      if (!source) {
        return NextResponse.json(
          { success: false, error: 'Source not found' },
          { status: 404 }
        );
      }
      // Owner may sync their own source; unowned (global) sources are admin-only.
      if (source.userId ? source.userId !== userId : !isAdmin(auth.user)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      if (source.feedUrl) {
        try {
          const result = await importRssFeed(source.id);
          return NextResponse.json({
            success: true,
            data: { type: 'rss', ...result },
            message: `Feed synced — ${result.added} new article${
              result.added === 1 ? '' : 's'
            } (${result.skipped} already indexed)`,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to import feed — check the feed URL is valid';
          return NextResponse.json({ success: false, error: message }, { status: 400 });
        }
      }

      // Firecrawl crawl path — daily per-user quota applies (paid API).
      const usage = await consumeUsage(userId, 'crawl');
      if (!usage.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `Daily crawl limit reached. Try again after ${usage.resetAt}.`,
          },
          { status: 429 }
        );
      }

      const result = await startCrawlJob({
        url: source.url,
        sourceId: source.id,
        maxPages: 10,
        depth: 1,
        userId: source.userId ?? undefined,
      });

      return NextResponse.json({
        success: true,
        data: { type: 'crawl', jobId: result.jobId, logId: result.logId },
        message: `Crawling started for ${source.name}`,
      });
    } catch (error) {
      return internalServerError('Source sync POST', error);
    }
  }
);
