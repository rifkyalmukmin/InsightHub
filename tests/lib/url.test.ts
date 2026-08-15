import { getCrawlUrlError, getCrawlUrlErrorAsync } from '@/lib/utils/url';
import { validateBody, registerSchema, createSourceSchema, updateSourceSchema } from '@/lib/validations';
import { lookup } from 'dns/promises';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

const mockLookup = lookup as jest.Mock;

describe('getCrawlUrlError — static checks', () => {
  it('allows public HTTPS URLs', () => {
    expect(getCrawlUrlError('https://example.com/article')).toBeNull();
  });

  it('blocks localhost', () => {
    expect(getCrawlUrlError('http://localhost:3000/admin')).not.toBeNull();
    expect(getCrawlUrlError('http://foo.localhost/')).not.toBeNull();
  });

  it('blocks private IP ranges', () => {
    expect(getCrawlUrlError('http://192.168.1.1/internal')).not.toBeNull();
    expect(getCrawlUrlError('http://10.0.0.1/metadata')).not.toBeNull();
    expect(getCrawlUrlError('http://127.0.0.1/')).not.toBeNull();
    expect(getCrawlUrlError('http://169.254.169.254/latest/meta-data/')).not.toBeNull();
    expect(getCrawlUrlError('http://172.16.0.1/')).not.toBeNull();
    expect(getCrawlUrlError('http://0.0.0.0/')).not.toBeNull();
  });

  it('blocks IPv4 encodings that the URL parser normalizes to private IPs', () => {
    // decimal, hex, octal, short-form — all normalize to 127.0.0.1
    expect(getCrawlUrlError('http://2130706433/')).not.toBeNull();
    expect(getCrawlUrlError('http://0x7f000001/')).not.toBeNull();
    expect(getCrawlUrlError('http://0177.0.0.1/')).not.toBeNull();
    expect(getCrawlUrlError('http://127.1/')).not.toBeNull();
    expect(getCrawlUrlError('http://0x7f.0.0.1/')).not.toBeNull();
  });

  it('blocks IPv6 loopback and IPv4-mapped loopback', () => {
    expect(getCrawlUrlError('http://[::1]/')).not.toBeNull();
    expect(getCrawlUrlError('http://[::ffff:127.0.0.1]/')).not.toBeNull();
    expect(getCrawlUrlError('http://[::ffff:7f00:1]/')).not.toBeNull();
  });

  it('blocks IPv6 private and link-local ranges', () => {
    expect(getCrawlUrlError('http://[fd00::1]/')).not.toBeNull();
    expect(getCrawlUrlError('http://[fe80::1]/')).not.toBeNull();
    expect(getCrawlUrlError('http://[::]/')).not.toBeNull();
  });

  it('allows public IPv6 addresses', () => {
    expect(getCrawlUrlError('http://[2606:4700::1111]/')).toBeNull();
  });

  it('blocks non-HTTP protocols', () => {
    expect(getCrawlUrlError('file:///etc/passwd')).not.toBeNull();
    expect(getCrawlUrlError('ftp://example.com/file')).not.toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(getCrawlUrlError('not-a-url')).not.toBeNull();
  });
});

describe('getCrawlUrlErrorAsync — DNS resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows domains that resolve to public addresses', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
    expect(await getCrawlUrlErrorAsync('https://example.com/feed')).toBeNull();
  });

  it('blocks domains that resolve to a private address (DNS rebinding)', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    expect(await getCrawlUrlErrorAsync('https://internal.example.com/')).not.toBeNull();
  });

  it('blocks domains that resolve to a private IPv6 address', async () => {
    mockLookup.mockResolvedValue([{ address: '::1', family: 6 }]);
    expect(await getCrawlUrlErrorAsync('https://ipv6-loopback.example.com/')).not.toBeNull();
  });

  it('blocks domains whose DNS lookup fails (NXDOMAIN / timeout)', async () => {
    mockLookup.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    expect(await getCrawlUrlErrorAsync('https://no-such-domain.invalid/')).not.toBeNull();
  });

  it('skips DNS for literal IPs (already evaluated statically)', async () => {
    expect(await getCrawlUrlErrorAsync('http://127.0.0.1/')).not.toBeNull();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('keeps static blocking for literal private IPs', async () => {
    expect(await getCrawlUrlErrorAsync('http://169.254.169.254/latest/meta-data/')).not.toBeNull();
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe('Validation schemas', () => {
  it('registerSchema rejects short passwords', () => {
    const result = registerSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      password: '123',
    });
    expect(result.success).toBe(false);
  });

  it('registerSchema accepts valid input', () => {
    const result = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'securepassword',
    });
    expect(result.success).toBe(true);
  });

  it('createSourceSchema accepts a public feed URL', () => {
    const result = createSourceSchema.safeParse({
      name: 'TechCrunch',
      domain: 'techcrunch.com',
      url: 'https://techcrunch.com',
      feedUrl: 'https://techcrunch.com/feed/',
    });
    expect(result.success).toBe(true);
  });

  it('createSourceSchema rejects an internal feed URL (SSRF)', () => {
    const result = createSourceSchema.safeParse({
      name: 'Internal',
      domain: 'internal.local',
      url: 'https://example.com',
      feedUrl: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(result.success).toBe(false);
    const parsed = result.success ? null : result.error.issues[0]?.message;
    expect(parsed).toContain('public');
  });

  it('updateSourceSchema rejects an internal feed URL', () => {
    const result = updateSourceSchema.safeParse({
      feedUrl: 'http://localhost:5432/feed',
    });
    expect(result.success).toBe(false);
  });

  it('updateSourceSchema allows clearing the feed URL with null', () => {
    const result = updateSourceSchema.safeParse({ feedUrl: null });
    expect(result.success).toBe(true);
  });

  it('validateBody surfaces the feed URL error through the helper', () => {
    const body = {
      name: 'Internal',
      domain: 'internal.local',
      url: 'https://example.com',
      feedUrl: 'http://127.0.0.1/feed',
    };
    const result = validateBody(createSourceSchema, body);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('feedUrl');
  });
});
