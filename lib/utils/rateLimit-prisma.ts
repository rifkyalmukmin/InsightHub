import { NextResponse, NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import prisma from '@/lib/db/prisma';
import { redisRateLimit } from './rateLimit-redis';
import { getClientIp } from './ip';

const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
const DEFAULT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

// Authenticated requests are budgeted per-account (not per-IP) so users behind
// a shared NAT/proxy never exhaust each other's bucket and rotating IPs cannot
// dodge a per-account budget.
export const DEFAULT_USER_MAX = parseInt(
  process.env.RATE_LIMIT_USER_MAX_REQUESTS || '300',
  10
);
export const DEFAULT_USER_WINDOW = parseInt(
  process.env.RATE_LIMIT_USER_WINDOW_MS || String(DEFAULT_WINDOW),
  10
);

// When the client IP cannot be determined (bare server without proxy headers,
// getClientIp falls back to 'unknown') every anonymous request shares one
// bucket. Cap it well below the default so one busy client cannot exhaust the
// limit for everyone else on that bucket.
export const UNKNOWN_IP_MAX = parseInt(
  process.env.RATE_LIMIT_UNKNOWN_IP_MAX_REQUESTS || '30',
  10
);

/**
 * Best-effort resolution of the authenticated user's id from the session
 * cookie — a pure JWT decode, no DB hit. Returns null for anonymous requests.
 *
 * The route-handler `Request` is a Web API request, but next-auth's getToken
 * reads cookies only from a NextRequest (or an `Authorization` header), so we
 * wrap it the same way middleware.ts does. Failures fall back to anonymous
 * (IP-based) limiting rather than blocking traffic.
 */
async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  try {
    const nextRequest = new NextRequest(request.url, { headers: request.headers });
    const token = await getToken({ req: nextRequest, secret });
    return typeof token?.sub === 'string' && token.sub.length > 0 ? token.sub : null;
  } catch {
    return null;
  }
}

export async function rateLimit(
  identifier: string,
  maxRequests: number = DEFAULT_MAX,
  windowMs: number = DEFAULT_WINDOW
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redisResult = await redisRateLimit(identifier, maxRequests, windowMs);
  if (redisResult) return redisResult;

  const now = Date.now();
  const resetAtMs = now + windowMs;
  const resetAt = new Date(resetAtMs);

  // Clean up expired entries (only when using DB fallback)
  if (Math.random() < 0.01) {
    await prisma.rateLimit.deleteMany({
      where: { resetAt: { lt: new Date() } },
    });
  }

  // Find or create rate limit entry
  let entry = await prisma.rateLimit.findUnique({
    where: { identifier },
  });

  if (!entry || entry.resetAt < new Date()) {
    entry = await prisma.rateLimit.upsert({
      where: { identifier },
      update: {
        count: 1,
        resetAt: resetAt,
      },
      create: {
        identifier,
        count: 1,
        resetAt: resetAt,
      },
    });
    return { allowed: true, remaining: maxRequests - 1, resetAt: Math.floor(resetAtMs / 1000) };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(entry.resetAt.getTime() / 1000),
    };
  }

  entry = await prisma.rateLimit.update({
    where: { identifier },
    data: { count: { increment: 1 } },
  });

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: Math.floor(entry.resetAt.getTime() / 1000),
  };
}

export function withRateLimit<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
  maxRequests: number = DEFAULT_MAX,
  windowMs: number = DEFAULT_WINDOW
) {
  return async (request: Request, ...args: Args) => {
    // Only trust x-forwarded-for when behind a trusted proxy (see TRUST_PROXY)
    const ip = getClientIp(request);

    // Authenticated users are keyed by account, not by IP; anonymous traffic
    // is keyed by IP with a tighter cap on the 'unknown' placeholder. When a
    // caller passes explicit (non-default) limits — e.g. register's 10/hour —
    // that intent is respected for both buckets.
    const callerCustomized = maxRequests !== DEFAULT_MAX || windowMs !== DEFAULT_WINDOW;
    const userId = await getAuthenticatedUserId(request);
    const identifier = userId ? `user:${userId}` : `ip:${ip}`;
    const appliedMax = userId
      ? callerCustomized
        ? maxRequests
        : DEFAULT_USER_MAX
      : ip === 'unknown'
        ? Math.min(maxRequests, UNKNOWN_IP_MAX)
        : maxRequests;
    const appliedWindow = userId ? (callerCustomized ? windowMs : DEFAULT_USER_WINDOW) : windowMs;

    const limit = await rateLimit(identifier, appliedMax, appliedWindow);

    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(appliedMax),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(limit.resetAt),
            'Retry-After': String(Math.ceil((limit.resetAt * 1000 - Date.now()) / 1000)),
          },
        }
      );
    }

    const response = await handler(request, ...args);

    response.headers.set('X-RateLimit-Limit', String(appliedMax));
    response.headers.set('X-RateLimit-Remaining', String(limit.remaining));
    response.headers.set('X-RateLimit-Reset', String(limit.resetAt));

    return response;
  };
}
