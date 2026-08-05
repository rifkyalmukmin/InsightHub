import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { rateLimit } from '@/lib/utils/rateLimit';

const handler = NextAuth(authOptions);

// Tighter limits than the default API rate limit — the sign-in endpoint is the
// primary brute-force target. Applied per-IP and, for credentials logins, per-account.
const LOGIN_IP_MAX = 30;
const LOGIN_EMAIL_MAX = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Next.js 15 passes `params` as a Promise for dynamic route segments. NextAuth's
// handler derives the action from the request pathname (App Router) and does not
// read ctx.params, so forwarding with a cast is safe.
interface NextAuthCtx {
  params: Promise<{ nextauth: string[] }>;
}

type NextAuthHandlerContext = Parameters<typeof handler>[1];

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimitedResponse(
  message: string,
  maxRequests: number,
  resetAt: number
): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(resetAt),
        'Retry-After': String(Math.max(1, Math.ceil((resetAt * 1000 - Date.now()) / 1000))),
      },
    }
  );
}

export async function GET(request: Request, ctx: NextAuthCtx) {
  return handler(request, ctx as NextAuthHandlerContext);
}

export async function POST(request: Request, ctx: NextAuthCtx) {
  const ip = getClientIp(request);

  const ipLimit = await rateLimit(`login:ip:${ip}`, LOGIN_IP_MAX, LOGIN_WINDOW_MS);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(
      'Too many login attempts. Please try again later.',
      LOGIN_IP_MAX,
      ipLimit.resetAt
    );
  }

  // The credentials callback posts a form-encoded body containing the email.
  // Rate-limit per account so a leaked credential can't be brute-forced.
  let email: string | undefined;
  try {
    const text = await request.clone().text();
    email = new URLSearchParams(text).get('email')?.trim().toLowerCase() || undefined;
  } catch {
    // Body is not readable/form-encoded (e.g. OAuth redirect) — IP limit still applies.
  }

  if (email) {
    const emailLimit = await rateLimit(
      `login:email:${email}`,
      LOGIN_EMAIL_MAX,
      LOGIN_WINDOW_MS
    );
    if (!emailLimit.allowed) {
      return rateLimitedResponse(
        'Too many login attempts for this account. Please try again later.',
        LOGIN_EMAIL_MAX,
        emailLimit.resetAt
      );
    }
  }

  return handler(request, ctx as NextAuthHandlerContext);
}
