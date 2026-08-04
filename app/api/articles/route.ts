import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import { validateQuery, articleQuerySchema } from '@/lib/validations';
import { queryArticles } from '@/services/analytics/articleQuery';
import { logError } from '@/lib/logger';

export const GET = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const { searchParams } = new URL(request.url);
    const queryValidation = validateQuery(articleQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { success: false, error: queryValidation.error },
        { status: 400 }
      );
    }

    const { query, topic, source, sentiment, from, to, sort } = queryValidation.data;
    const page = queryValidation.data.page ?? 1;
    const limit = queryValidation.data.limit ?? 20;

    const result = await queryArticles({
      userId,
      query,
      topic,
      source,
      sentiment,
      from,
      to,
      sort,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result.articles,
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  } catch (error) {
    logError('Articles fetch', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch articles' },
      { status: 500 }
    );
  }
});
