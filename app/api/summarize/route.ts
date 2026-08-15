import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import { validateBody, summarizeSchema } from '@/lib/validations';
import { summarizeArticle } from '@/services/openai/summarize';
import { consumeUsage } from '@/lib/utils/usage';
import prisma from '@/lib/db/prisma';
import { internalServerError } from '@/lib/utils/api-error';

export const POST = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await request.json();
    const validation = validateBody(summarizeSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { articleId, model } = validation.data;

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { summary: true, source: true },
    });

    if (!article) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Verify ownership for user-scoped articles
    if (article.userId && article.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (article.summary) {
      return NextResponse.json({
        success: true,
        data: {
          article,
          summary: article.summary,
        },
        message: 'Article already summarized',
      });
    }

    // Daily per-user quota for paid OpenAI calls (checked before invoking).
    const usage = await consumeUsage(userId, 'summarize');
    if (!usage.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Daily summarize limit reached. Try again after ${usage.resetAt}.`,
        },
        { status: 429 }
      );
    }

    const result = await summarizeArticle(articleId, model);

    const updatedArticle = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        summary: true,
        source: true,
        tags: { include: { topic: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        article: updatedArticle,
        summary: result,
      },
      message: 'Article summarized successfully',
    });
  } catch (error) {
    return internalServerError('Summarize POST', error);
  }
});
