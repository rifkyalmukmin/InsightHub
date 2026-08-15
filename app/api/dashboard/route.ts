import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import {
  getDashboardStats,
  isDashboardPeriod,
} from '@/services/analytics/dashboard';
import { internalServerError } from '@/lib/utils/api-error';

export const GET = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period') ?? '7d';
    const period = isDashboardPeriod(periodParam) ? periodParam : '7d';

    const stats = await getDashboardStats(userId, period);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return internalServerError('Dashboard GET', error);
  }
});
