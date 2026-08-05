import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';

/**
 * Logs the error server-side and returns a generic 500 response.
 * Internal error details (paths, provider messages, etc.) are never sent
 * to the client to avoid information disclosure.
 */
export function internalServerError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>
): NextResponse {
  logError(context, error, meta);
  return NextResponse.json(
    { success: false, error: 'Internal server error' },
    { status: 500 }
  );
}
