import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { redisRateLimit } from './rateLimit-redis';
import { getClientIp } from './ip';

const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
const DEFAULT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

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

    const limit = await rateLimit(ip, maxRequests, windowMs);

    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(limit.resetAt),
            'Retry-After': String(Math.ceil((limit.resetAt * 1000 - Date.now()) / 1000)),
          },
        }
      );
    }

    const response = await handler(request, ...args);

    response.headers.set('X-RateLimit-Limit', String(maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(limit.remaining));
    response.headers.set('X-RateLimit-Reset', String(limit.resetAt));

    return response;
  };
}
