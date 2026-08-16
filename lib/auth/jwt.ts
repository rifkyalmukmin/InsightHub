import prisma from '@/lib/db/prisma';
import type { JWT } from 'next-auth/jwt';

/**
 * NextAuth `jwt` callback logic, extracted so it can be unit-tested.
 *
 * The JWT strategy keeps no server-side session state, so the token itself is
 * the only source of truth between requests. Two failure modes here previously
 * produced `session.user.id` values that did not exist in the `User` table,
 * which made every write (e.g. `NewsSource.create`) fail with an opaque
 * `NewsSource_userId_fkey` foreign-key 500:
 *
 * 1. **OAuth provider ids leaking into the token.** At sign-in NextAuth hands
 *    the callback a `user.id` that is the *provider's* account id (Google
 *    subject, GitHub id) — not a Prisma user id. `token.id` then won over
 *    `token.sub` in the session callback, so unless the DB lookup below
 *    succeeded, sessions carried a bogus user id.
 * 2. **Stale tokens after the user row disappears** (deleted user, or a
 *    development DB reset). Nothing verified the user still existed, so the
 *    token stayed valid and every write hit the FK constraint.
 *
 * The fix: at sign-in only ever persist a Prisma user id (resolved from the
 * DB, never trusted from the provider), and on every subsequent request
 * re-verify the user row exists — returning `null` invalidates the token,
 * which turns the FK 500 into a clean 401.
 */

export interface JwtResolveParams {
  token: JWT;
  user?: { id?: string; email?: string | null; role?: string } | null;
  account?: { provider?: string | null } | null;
}

export async function resolveJwtToken({
  token,
  user,
  account,
}: JwtResolveParams): Promise<JWT | null> {
  // `user`/`account` are only present on the initial sign-in call.
  if (user) {
    // Credentials: authorize() returns the real Prisma user id — safe to trust.
    if (!account || account.provider === 'credentials') {
      token.sub = user.id;
      token.id = user.id;
      token.role = user.role;
      return token;
    }

    // OAuth: the provider's id is NOT a Prisma user id. The signIn callback
    // upserted the user by email; resolve the Prisma id here and refuse to
    // mint a session if it can't be resolved (e.g. OAuth without an email).
    const dbUser = user.email
      ? await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, role: true },
        })
      : null;
    if (!dbUser) return null;
    token.sub = dbUser.id;
    token.id = dbUser.id;
    token.role = dbUser.role;
    return token;
  }

  // Every subsequent request: re-verify the user still exists. If it doesn't
  // (deleted user, DB reset), invalidate the token instead of letting writes
  // fail with a foreign-key error.
  const userId = (token.sub as string) ?? (token.id as string);
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!dbUser) return null;
  token.sub = dbUser.id;
  token.id = dbUser.id;
  if (dbUser.role) token.role = dbUser.role;
  return token;
}
