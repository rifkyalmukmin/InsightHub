import { getClientIp } from '@/lib/utils/ip';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost', { headers });
}

describe('getClientIp', () => {
  it('ignores x-forwarded-for when TRUST_PROXY is not enabled', () => {
    delete process.env.TRUST_PROXY;
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('unknown');
  });

  it('falls back to x-real-ip when TRUST_PROXY is not enabled', () => {
    delete process.env.TRUST_PROXY;
    expect(getClientIp(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('trusts x-forwarded-for when TRUST_PROXY is enabled', () => {
    process.env.TRUST_PROXY = 'true';
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('prefers x-forwarded-for over x-real-ip when TRUST_PROXY is enabled', () => {
    process.env.TRUST_PROXY = '1';
    expect(
      getClientIp(req({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '9.9.9.9' }))
    ).toBe('1.2.3.4');
  });

  it('returns unknown when no IP headers are present', () => {
    process.env.TRUST_PROXY = 'true';
    expect(getClientIp(req())).toBe('unknown');
  });
});
