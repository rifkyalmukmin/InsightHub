/**
 * Publicly-documented placeholder secrets that must never be accepted —
 * including the value shipped in .env.example. Copying .env.example
 * verbatim must fail fast instead of silently signing forgeable sessions.
 */
const KNOWN_WEAK_SECRETS = new Set([
  'change-me-in-production-min-32-chars',
  // Value from .env.example — kept in sync deliberately (see .env.example)
  'your-nextauth-secret-key-min-32-chars',
]);

export function validateEnv() {
  const required = [
    'DATABASE_URL',
    'NEXTAUTH_URL',
    'NEXTAUTH_SECRET',
    'OPENAI_API_KEY',
    'FIRECRAWL_API_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Guards against a missing, too-short, or publicly-known NEXTAUTH_SECRET.
 * Throws so the app fails fast instead of silently accepting forged sessions.
 */
export function assertSecureAuthSecret(): void {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret || secret.length < 32 || KNOWN_WEAK_SECRETS.has(secret)) {
    throw new Error(
      'NEXTAUTH_SECRET must be a random value of at least 32 characters ' +
        '(e.g. openssl rand -base64 32). The placeholder from .env.example is ' +
        'rejected on purpose — generate a real value.'
    );
  }
}
