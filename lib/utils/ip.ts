/**
 * Resolves the client IP used for rate limiting.
 *
 * `x-forwarded-for` is fully client-controlled unless the app runs behind a
 * proxy that overwrites it (Vercel, Cloudflare, nginx/Caddy with proper
 * config). Trusting it unconditionally lets anyone rotate the header to get a
 * fresh rate-limit bucket — bypassing registration/login/API limits entirely.
 *
 * So `x-forwarded-for` is only read when TRUST_PROXY is enabled (set it when
 * deploying behind Vercel, Cloudflare, or a reverse proxy that strips/replaces
 * client-supplied headers). Otherwise the request falls back to `x-real-ip`
 * (set by nginx/Cloudflare) and finally `unknown`.
 *
 * Note: `x-real-ip` is equally spoofable on a bare server — for a strictly
 * correct setup, put the app behind a trusted proxy and enable TRUST_PROXY.
 */
export function getClientIp(request: Request): string {
  if (isTrustProxyEnabled()) {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

function isTrustProxyEnabled(): boolean {
  const value = process.env.TRUST_PROXY?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}
