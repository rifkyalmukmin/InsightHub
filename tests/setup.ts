import '@testing-library/jest-dom';

// Jest does not load .env (Next.js does at runtime), so env-dependent code
// paths would behave differently per machine. Provide deterministic values —
// a real secret from the shell still wins via ||=.
process.env.NEXTAUTH_SECRET ||= 'jest-secret-0123456789abcdef0123456789abcdef';

beforeAll(() => {
  // Setup for all tests
});

afterAll(() => {
  // Cleanup after all tests
});
