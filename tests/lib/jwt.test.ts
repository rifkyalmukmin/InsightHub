import { resolveJwtToken } from '@/lib/auth/jwt';
import prisma from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: { user: { findUnique: jest.fn() } },
}));

const mockFindUnique = prisma.user.findUnique as jest.Mock;

describe('resolveJwtToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trusts the credentials user id at sign-in (it is a Prisma id)', async () => {
    const token = await resolveJwtToken({
      token: {},
      user: { id: 'user-1', role: 'user' },
      account: { provider: 'credentials' },
    });

    expect(token).toEqual({ sub: 'user-1', id: 'user-1', role: 'user' });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('resolves OAuth provider ids to the Prisma user id at sign-in', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', role: 'admin' });

    const token = await resolveJwtToken({
      token: { sub: 'google-provider-id' },
      user: { id: 'google-provider-id', email: 'a@b.com' },
      account: { provider: 'google' },
    });

    expect(token).toEqual({ sub: 'user-1', id: 'user-1', role: 'admin' });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
      select: { id: true, role: true },
    });
  });

  it('refuses to mint a session for OAuth without a resolvable email', async () => {
    const token = await resolveJwtToken({
      token: {},
      user: { id: 'provider-id', email: null },
      account: { provider: 'github' },
    });

    expect(token).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('re-verifies the user exists on every subsequent request', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', role: 'user' });

    const token = await resolveJwtToken({
      token: { sub: 'user-1', id: 'user-1', role: 'user' },
    });

    expect(token).toEqual({ sub: 'user-1', id: 'user-1', role: 'user' });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, role: true },
    });
  });

  it('invalidates the token when the user no longer exists (deleted / DB reset)', async () => {
    mockFindUnique.mockResolvedValue(null);

    const token = await resolveJwtToken({ token: { sub: 'deleted-user' } });

    expect(token).toBeNull();
  });

  it('invalidates a stale token carrying a provider id instead of a Prisma id', async () => {
    mockFindUnique.mockResolvedValue(null);

    const token = await resolveJwtToken({ token: { sub: 'google-provider-id' } });

    expect(token).toBeNull();
  });

  it('refreshes the role from the DB on each request', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', role: 'admin' });

    const token = await resolveJwtToken({
      token: { sub: 'user-1', id: 'user-1', role: 'user' },
    });

    expect(token?.role).toBe('admin');
  });
});
