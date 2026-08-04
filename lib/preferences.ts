import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

export interface UserPreferences {
  notifications?: {
    email?: boolean;
    push?: boolean;
    digest?: boolean;
  };
  reading?: {
    language?: string;
    articlesPerPage?: number;
  };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: {
    email: true,
    push: false,
    digest: true,
  },
  reading: {
    language: 'en',
    articlesPerPage: 20,
  },
};

export function mergePreferences(stored: unknown): UserPreferences {
  if (!stored || typeof stored !== 'object') {
    return DEFAULT_PREFERENCES;
  }
  const prefs = stored as UserPreferences;
  return {
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...prefs.notifications },
    reading: { ...DEFAULT_PREFERENCES.reading, ...prefs.reading },
  };
}

export function parsePreferencesInput(body: unknown): UserPreferences | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as UserPreferences;
  const result: UserPreferences = {};

  if (input.notifications) {
    result.notifications = {};
    if (typeof input.notifications.email === 'boolean') {
      result.notifications.email = input.notifications.email;
    }
    if (typeof input.notifications.push === 'boolean') {
      result.notifications.push = input.notifications.push;
    }
    if (typeof input.notifications.digest === 'boolean') {
      result.notifications.digest = input.notifications.digest;
    }
  }

  if (input.reading) {
    result.reading = {};
    if (typeof input.reading.language === 'string' && input.reading.language.length <= 10) {
      result.reading.language = input.reading.language;
    }
    if (
      typeof input.reading.articlesPerPage === 'number' &&
      input.reading.articlesPerPage >= 5 &&
      input.reading.articlesPerPage <= 100
    ) {
      result.reading.articlesPerPage = input.reading.articlesPerPage;
    }
  }

  const hasUpdates =
    (result.notifications && Object.keys(result.notifications).length > 0) ||
    (result.reading && Object.keys(result.reading).length > 0);

  return hasUpdates ? result : null;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return mergePreferences(user?.preferences);
}

export async function saveUserPreferences(
  userId: string,
  updates: UserPreferences
): Promise<UserPreferences> {
  const current = await getUserPreferences(userId);
  const merged: UserPreferences = {
    notifications: { ...current.notifications, ...updates.notifications },
    reading: { ...current.reading, ...updates.reading },
  };

  await prisma.user.update({
    where: { id: userId },
    data: { preferences: merged as object },
  });

  logger.info({ userId }, 'User preferences updated');
  return merged;
}
