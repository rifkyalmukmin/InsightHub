import { NextResponse } from 'next/server';
import {
  GET as getNotifications,
  POST as postNotifications,
} from '../../app/api/notifications/route';
import { POST as markNotificationRead } from '../../app/api/notifications/[id]/route';
import { getSessionUser } from '../../lib/auth/session';
import prisma from '../../lib/db/prisma';

jest.mock('@/lib/auth/session', () => ({
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rateLimit: {
      deleteMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest
        .fn()
        .mockResolvedValue({ count: 1, resetAt: new Date(Date.now() + 60_000) }),
      update: jest.fn(),
    },
  },
}));

const mockGetSessionUser = getSessionUser as jest.Mock;
const mockFindMany = prisma.notification.findMany as jest.Mock;
const mockCount = prisma.notification.count as jest.Mock;
const mockFindUnique = prisma.notification.findUnique as jest.Mock;
const mockUpdate = prisma.notification.update as jest.Mock;
const mockUpdateMany = prisma.notification.updateMany as jest.Mock;

function authAs(id: string) {
  mockGetSessionUser.mockResolvedValue({ user: { id } });
}

function unauthAs() {
  mockGetSessionUser.mockResolvedValue({
    user: {} as never,
    error: NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    ),
  });
}

const jsonRequest = (body: unknown) =>
  new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const ctxParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('Notifications API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  describe('GET /api/notifications', () => {
    it('rejects unauthenticated requests', async () => {
      unauthAs();
      const res = await getNotifications(new Request('http://localhost'));
      expect(res.status).toBe(401);
    });

    it('returns the user notifications with unread count', async () => {
      authAs('user-1');
      mockFindMany.mockResolvedValue([{ id: 'n1', title: 'Crawl complete', read: false }]);
      mockCount.mockResolvedValue(1);

      const res = await getNotifications(new Request('http://localhost'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.unreadCount).toBe(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(mockCount).toHaveBeenCalledWith({ where: { userId: 'user-1', read: false } });
    });
  });

  describe('POST /api/notifications (mark all read)', () => {
    it('rejects unauthenticated requests', async () => {
      unauthAs();
      const res = await postNotifications(jsonRequest({ markAllRead: true }));
      expect(res.status).toBe(401);
    });

    it('marks all of the user notifications as read', async () => {
      authAs('user-1');
      const res = await postNotifications(jsonRequest({ markAllRead: true }));
      expect(res.status).toBe(200);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
        data: { read: true },
      });
    });

    it('rejects an invalid body', async () => {
      authAs('user-1');
      const res = await postNotifications(jsonRequest({ nope: true }));
      expect(res.status).toBe(400);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/notifications/[id] (mark one read)', () => {
    it('rejects marking another user notification as read', async () => {
      authAs('user-1');
      mockFindUnique.mockResolvedValue({ id: 'n1', userId: 'user-2' });

      const res = await markNotificationRead(
        new Request('http://localhost'),
        ctxParams('n1')
      );

      expect(res.status).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('marks the user notification as read', async () => {
      authAs('user-1');
      mockFindUnique.mockResolvedValue({ id: 'n1', userId: 'user-1' });

      const res = await markNotificationRead(
        new Request('http://localhost'),
        ctxParams('n1')
      );

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { read: true },
      });
    });

    it('returns 404 for a missing notification', async () => {
      authAs('user-1');
      mockFindUnique.mockResolvedValue(null);

      const res = await markNotificationRead(
        new Request('http://localhost'),
        ctxParams('missing')
      );

      expect(res.status).toBe(404);
    });
  });
});
