import { assertSecureAuthSecret } from '@/lib/utils/env';

const ORIGINAL_ENV = { ...process.env };

describe('assertSecureAuthSecret', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when NEXTAUTH_SECRET is missing', () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => assertSecureAuthSecret()).toThrow();
  });

  it('throws when the secret is shorter than 32 characters', () => {
    process.env.NEXTAUTH_SECRET = 'too-short';
    expect(() => assertSecureAuthSecret()).toThrow();
  });

  it('rejects the placeholder value shipped in .env.example', () => {
    process.env.NEXTAUTH_SECRET = 'your-nextauth-secret-key-min-32-chars';
    expect(() => assertSecureAuthSecret()).toThrow();
  });

  it('rejects the older documented weak secret', () => {
    process.env.NEXTAUTH_SECRET = 'change-me-in-production-min-32-chars';
    expect(() => assertSecureAuthSecret()).toThrow();
  });

  it('accepts a sufficiently long random secret', () => {
    process.env.NEXTAUTH_SECRET = 'a-truly-random-secret-value-0123456789abcdef';
    expect(() => assertSecureAuthSecret()).not.toThrow();
  });

  it('trims surrounding whitespace before validating', () => {
    process.env.NEXTAUTH_SECRET = '  a-truly-random-secret-value-0123456789abcdef  ';
    expect(() => assertSecureAuthSecret()).not.toThrow();
  });
});
