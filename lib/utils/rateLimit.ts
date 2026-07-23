import { NextResponse } from 'next/server';

const RATE_LIMITS = new Map<string, { count: number; resetAt: number }>();

const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
const DEFAULT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

export function rateLimit(
  identifier: string,
  maxRequests: number = DEFAULT_MAX,
  windowMs: number = DEFAULT_WINDOW
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = RATE_LIMITS.get(identifier);

  if (!existing || now > existing.resetAt) {
    RATE_LIMITS.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}

export function withRateLimit(
  handler: (request: Request) => Promise<Response>,
  maxRequests: number = DEFAULT_MAX,
  windowMs: number = DEFAULT_WINDOW
) {
  return async (request: Request) => {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const limit = rateLimit(ip, maxRequests, windowMs);

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
            'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const response = await handler(request);

    // Add rate limit headers to successful response
    response.headers.set('X-RateLimit-Limit', String(maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(limit.remaining));
    response.headers.set('X-RateLimit-Reset', String(limit.resetAt));

    return response;
  };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  Array.from(RATE_LIMITS.entries()).forEach(([key, value]) => {
    if (now > value.resetAt + 60000) {
      RATE_LIMITS.delete(key);
    }
  });
}, 60000);
