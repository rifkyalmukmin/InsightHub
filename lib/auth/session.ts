import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';

export interface AuthenticatedUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string;
}

export interface SessionResult {
  user: AuthenticatedUser;
  /** Return this value from your handler to reject the request. */
  error?: NextResponse;
}

/**
 * Verifies that the request has a valid NextAuth session and returns the
 * authenticated user. If the session is missing or invalid, returns an
 * `error` NextResponse (401) that should be returned immediately.
 *
 * Usage:
 * ```ts
 * export const GET = withRateLimit(async (request: Request) => {
 *   const auth = await getSessionUser();
 *   if (auth.error) return auth.error;
 *   const userId = auth.user.id;
 *   // ...
 * });
 * ```
 */
export async function getSessionUser(): Promise<SessionResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.id) {
    return {
      user: {} as AuthenticatedUser,
      error: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      role: (session.user as { role?: string }).role,
    },
  };
}
