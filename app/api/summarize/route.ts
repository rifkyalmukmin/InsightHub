import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { summarizeArticle } from '@/services/openai/summarize';
import prisma from '@/lib/db/prisma';

export const POST = withRateLimit(async (request: Request) => {
  try {
    const body = await request.json();
    const { articleId, model } = body;

    if (!articleId) {
      return NextResponse.json(
        { success: false, error: 'Article ID is required' },
        { status: 400 }
      );
    }

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
    console.error('Summarize error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Summarization failed',
      },
      { status: 500 }
    );
  }
});
