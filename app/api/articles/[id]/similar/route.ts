import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import { validateBody, articleIdSchema } from '@/lib/validations';
import { findSimilarArticles } from '@/services/analytics/similar';
import prisma from '@/lib/db/prisma';

export const GET = withRateLimit(
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

      const article = await prisma.article.findUnique({
        where: { id },
        select: { id: true, userId: true },
      });
      if (!article) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      if (article.userId && article.userId !== userId) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      const url = new URL(request.url);
      const limit = Math.min(
        Math.max(parseInt(url.searchParams.get('limit') || '5', 10) || 5, 1),
        10
      );

      const similar = await findSimilarArticles(id, limit);

      return NextResponse.json({ success: true, data: similar });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to find similar articles' },
        { status: 500 }
      );
    }
  }
);
