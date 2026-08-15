import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Validates URLs that the server will fetch (crawl targets, RSS feed URLs)
 * and blocks SSRF targets: localhost, private/link-local IPs, and domains
 * that resolve to a private address.
 *
 * - `getCrawlUrlError(url)` — static checks only (no I/O). Safe to call from
 *   Zod schemas and anywhere a cheap synchronous guard is wanted.
 * - `getCrawlUrlErrorAsync(url)` — static checks plus a DNS resolution check
 *   for domain hostnames. Call this right before the server actually fetches
 *   a user-supplied URL (the RSS importer runs the fetch on this server, so
 *   it is the primary SSRF surface).
 *
 * The WHATWG URL parser already normalizes decimal/hex/octal/short-form IPv4
 * (`2130706433`, `0x7f000001`, `0177.0.0.1`, `127.1`) to dotted decimal, so
 * the IPv4 regex below catches those encodings too. IPv6 is where the old
 * guard was bypassable: loopback, IPv4-mapped (`::ffff:127.0.0.1`), unique
 * local (`fc00::/7`) and link-local (`fe80::/10`) ranges are now blocked.
 *
 * Known limitation: the DNS check runs at validation time, so a domain that
 * flips its resolution *after* the check (classic DNS rebinding TOCTOU) can
 * still redirect the fetch at an internal address. Pair this with
 * network-level egress restrictions in production (e.g. a proxy that blocks
 * private destinations) for full coverage.
 */

const DNS_TIMEOUT_MS = 2000;

/** True when a dotted-decimal IPv4 address is loopback/private/link-local. */
function isPrivateIpv4Address(address: string): boolean {
  const m = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if (a > 255 || b > 255 || c > 255 || d > 255) return false;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}

/**
 * Extract the IPv4 embedded in an IPv4-mapped IPv6 address
 * (`::ffff:127.0.0.1`, `::ffff:7f00:1`, `0:0:0:0:0:ffff:7f00:1`), or null
 * when the address is not IPv4-mapped.
 */
function embeddedIpv4(ipv6: string): string | null {
  const lower = ipv6.toLowerCase();
  const marker = lower.match(/^(.*:)?ffff:(.*)$/);
  if (!marker) return null;
  const tail = marker[2];

  // Dotted-decimal tail (::ffff:127.0.0.1)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) return tail;

  // Hex tail — the last 32 bits are one or two hex groups (::ffff:7f00:1)
  const groups = tail.split(':');
  if (groups.length === 0 || groups.length > 2) return null;
  const hex = groups.map((g) => g.padStart(4, '0')).join('');
  if (!/^[0-9a-f]{8}$/.test(hex)) return null;
  const n = parseInt(hex, 16);
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

/** True when an IPv6 address is loopback, unspecified, private or link-local. */
function isPrivateIpv6(address: string): boolean {
  const a = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (a === '::' || a === '::1') return true;

  const embedded = embeddedIpv4(a);
  if (embedded && isPrivateIpv4Address(embedded)) return true;

  const firstHextet = a.split(':')[0] ?? '';
  // Unique local — fc00::/7 covers first hextets fc00–fdff
  if (/^f[cd][0-9a-f]{2}$/.test(firstHextet)) return true;
  // Link-local — fe80::/10 covers first hextets fe80–febf
  if (/^fe[89ab][0-9a-f]$/.test(firstHextet)) return true;

  return false;
}

/** True when an IP address string (v4 or v6, unbracketed) is private/internal. */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4Address(address);
  if (isIP(address) === 6) return isPrivateIpv6(address);
  return false;
}

/**
 * Static SSRF checks (no I/O): protocol, localhost, private IPv4/IPv6.
 * Returns an error message if blocked, or null if safe.
 */
export function getCrawlUrlError(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format';
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Only HTTP and HTTPS URLs are allowed';
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]'
  ) {
    return 'Local URLs are not allowed';
  }

  // Dotted-decimal IPv4 (including encodings normalized by the URL parser).
  // The WHATWG parser rejects out-of-range octets, so >255 here is defensive.
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((o) => o > 255)) {
      return 'Invalid IP address';
    }
    if (isPrivateIpv4Address(hostname)) {
      return 'Private IP addresses are not allowed';
    }
    return null;
  }

  // IPv6 literals arrive bracketed; isIP needs the unbracketed form.
  if (isIP(hostname.replace(/^\[|\]$/g, '')) === 6) {
    if (isPrivateIpv6(hostname)) {
      return 'Private IP addresses are not allowed';
    }
    return null;
  }

  return null;
}

/** DNS lookup bounded by a timeout; rejects (fail-closed) on error/timeout. */
async function lookupWithTimeout(hostname: string): Promise<{ address: string }[]> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('DNS lookup timed out')), DNS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      lookup(hostname, { all: true, verbatim: false }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full SSRF check: static checks plus DNS resolution for domain hostnames.
 * Domains that resolve to a private/internal address — and domains whose
 * lookup fails (NXDOMAIN, timeout) — are blocked, so an unreachable or
 * unverifiable URL never reaches the fetch.
 */
export async function getCrawlUrlErrorAsync(url: string): Promise<string | null> {
  const staticError = getCrawlUrlError(url);
  if (staticError) return staticError;

  const hostname = new URL(url).hostname.toLowerCase();
  // Literal IPs were already evaluated by the static checks.
  if (isIP(hostname.replace(/^\[|\]$/g, '')) !== 0) return null;

  try {
    const addresses = await lookupWithTimeout(hostname);
    if (addresses.some(({ address }) => isPrivateAddress(address))) {
      return 'URL resolves to a private or internal address';
    }
    return null;
  } catch {
    // NXDOMAIN / timeout / resolution failure — cannot verify it is public.
    return 'Could not verify the URL resolves to a public address';
  }
}
