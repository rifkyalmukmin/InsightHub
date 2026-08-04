import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import {
  getUserPreferences,
  saveUserPreferences,
  parsePreferencesInput,
} from '@/lib/preferences';
import { logError } from '@/lib/logger';

export const GET = withRateLimit(async () => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;

    const preferences = await getUserPreferences(auth.user.id);

    return NextResponse.json({ success: true, data: preferences });
  } catch (error) {
    logError('Settings GET', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
});

export const PUT = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const updates = parsePreferencesInput(body);

    if (!updates) {
      return NextResponse.json(
        { success: false, error: 'Invalid preferences data' },
        { status: 400 }
      );
    }

    const preferences = await saveUserPreferences(auth.user.id, updates);

    return NextResponse.json({
      success: true,
      data: preferences,
      message: 'Settings saved',
    });
  } catch (error) {
    logError('Settings PUT', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save settings' },
      { status: 500 }
    );
  }
});
