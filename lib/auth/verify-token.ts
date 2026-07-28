import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose';

/**
 * Verifies a NextAuth session JWT token in the Edge Runtime.
 *
 * NextAuth v4 with the JWT session strategy signs tokens using the
 * `NEXTAUTH_SECRET` environment variable with the HS256 algorithm.
 * This helper decodes and verifies the token signature + expiration
 * so that expired or tampered tokens are rejected at the middleware
 * layer before reaching any route handler.
 *
 * @returns The decoded JWT payload if valid, or `null` if invalid/expired.
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined
): Promise<Record<string, unknown> | null> {
  if (!token || !secret) {
    return null;
  }

  try {
    const secretKey = new TextEncoder().encode(secret);

    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    return payload as Record<string, unknown>;
  } catch {
    // Token is expired, tampered, or invalid
    return null;
  }
}
