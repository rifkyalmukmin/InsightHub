/**
 * Regression tests for the P0 authorization fix:
 * unowned/global resources (userId: null) must NOT be modifiable by any
 * authenticated user — only admins may edit/delete them. Users can still
 * fully manage their own resources and read global ones.
 */
import {
  GET as getArticle,
  DELETE as deleteArticle,
} from '../../app/api/articles/[id]/route';
import {
  PUT as updateSource,
  DELETE as deleteSource,
} from '../../app/api/sources/[id]/route';
import { DELETE as deleteTopic } from '../../app/api/topics/[id]/route';
import { POST as crawlPost } from '../../app/api/crawl/route';
import { getSessionUser } from '../../lib/auth/session';
import prisma from '../../lib/db/prisma';

jest.mock('@/lib/auth/session', () => ({
  getSessionUser: jest.fn(),
  isAdmin: (user: { role?: string }) => user?.role === 'admin',
}));

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    article: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    newsSource: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    topic: {
      findUnique: jest.fn(),
      delete: jest.fn(),
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
const mockFindArticle = prisma.article.findUnique as jest.Mock;
const mockDeleteArticle = prisma.article.delete as jest.Mock;
const mockFindSource = prisma.newsSource.findUnique as jest.Mock;
const mockDeleteSource = prisma.newsSource.delete as jest.Mock;
const mockFindTopic = prisma.topic.findUnique as jest.Mock;
const mockDeleteTopic = prisma.topic.delete as jest.Mock;

function authAs(id: string, role: string) {
  mockGetSessionUser.mockResolvedValue({ user: { id, role } });
}

const ctxParams = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonRequest = (method: string, body?: unknown) =>
  new Request('http://localhost', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('Authorization — global resource protection (P0 regression)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindArticle.mockResolvedValue(null);
    mockFindSource.mockResolvedValue(null);
    mockFindTopic.mockResolvedValue(null);
  });

  describe('DELETE /api/articles/[id]', () => {
    it('rejects a regular user deleting a global article (userId: null)', async () => {
      authAs('user-1', 'user');
      mockFindArticle.mockResolvedValue({ id: 'a-global', userId: null });

      const res = await deleteArticle(
        new Request('http://localhost'),
        ctxParams('a-global')
      );

      expect(res.status).toBe(403);
      expect(mockDeleteArticle).not.toHaveBeenCalled();
    });

    it('allows the owner to delete their own article', async () => {
      authAs('user-1', 'user');
      mockFindArticle.mockResolvedValue({ id: 'a-mine', userId: 'user-1' });
      mockDeleteArticle.mockResolvedValue({ id: 'a-mine' });

      const res = await deleteArticle(
        new Request('http://localhost'),
        ctxParams('a-mine')
      );

      expect(res.status).toBe(200);
      expect(mockDeleteArticle).toHaveBeenCalledWith({ where: { id: 'a-mine' } });
    });

    it('rejects a user deleting another user article', async () => {
      authAs('user-1', 'user');
      mockFindArticle.mockResolvedValue({ id: 'a-other', userId: 'user-2' });

      const res = await deleteArticle(
        new Request('http://localhost'),
        ctxParams('a-other')
      );

      expect(res.status).toBe(403);
    });

    it('allows an admin to delete a global article', async () => {
      authAs('admin-1', 'admin');
      mockFindArticle.mockResolvedValue({ id: 'a-global', userId: null });
      mockDeleteArticle.mockResolvedValue({ id: 'a-global' });

      const res = await deleteArticle(
        new Request('http://localhost'),
        ctxParams('a-global')
      );

      expect(res.status).toBe(200);
    });

    it('still allows reading global articles (read-only for regular users)', async () => {
      authAs('user-1', 'user');
      mockFindArticle.mockResolvedValue({ id: 'a-global', userId: null });

      const res = await getArticle(
        new Request('http://localhost'),
        ctxParams('a-global')
      );

      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/sources/[id]', () => {
    it('rejects a regular user editing a global source (userId: null)', async () => {
      authAs('user-1', 'user');
      mockFindSource.mockResolvedValue({ id: 'src-global', userId: null });

      const res = await updateSource(
        jsonRequest('PUT', { name: 'Renamed' }),
        ctxParams('src-global')
      );

      expect(res.status).toBe(403);
    });

    it('allows the owner to edit their own source', async () => {
      authAs('user-1', 'user');
      mockFindSource.mockResolvedValue({ id: 'src-mine', userId: 'user-1' });

      const res = await updateSource(
        jsonRequest('PUT', { name: 'Renamed' }),
        ctxParams('src-mine')
      );

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/sources/[id]', () => {
    it('rejects a regular user deleting a global source', async () => {
      authAs('user-1', 'user');
      mockFindSource.mockResolvedValue({ id: 'src-global', userId: null });

      const res = await deleteSource(
        new Request('http://localhost'),
        ctxParams('src-global')
      );

      expect(res.status).toBe(403);
      expect(mockDeleteSource).not.toHaveBeenCalled();
    });

    it('allows the owner to delete their own source', async () => {
      authAs('user-1', 'user');
      mockFindSource.mockResolvedValue({ id: 'src-mine', userId: 'user-1' });
      mockDeleteSource.mockResolvedValue({ id: 'src-mine' });

      const res = await deleteSource(
        new Request('http://localhost'),
        ctxParams('src-mine')
      );

      expect(res.status).toBe(200);
    });

    it('allows an admin to delete a global source', async () => {
      authAs('admin-1', 'admin');
      mockFindSource.mockResolvedValue({ id: 'src-global', userId: null });
      mockDeleteSource.mockResolvedValue({ id: 'src-global' });

      const res = await deleteSource(
        new Request('http://localhost'),
        ctxParams('src-global')
      );

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/topics/[id]', () => {
    it('rejects a regular user deleting a topic (global resource)', async () => {
      authAs('user-1', 'user');
      mockFindTopic.mockResolvedValue({ id: 'topic-1', name: 'AI' });

      const res = await deleteTopic(
        new Request('http://localhost'),
        ctxParams('topic-1')
      );

      expect(res.status).toBe(403);
      expect(mockDeleteTopic).not.toHaveBeenCalled();
    });

    it('allows an admin to delete a topic', async () => {
      authAs('admin-1', 'admin');
      mockFindTopic.mockResolvedValue({ id: 'topic-1', name: 'AI' });
      mockDeleteTopic.mockResolvedValue({ id: 'topic-1' });

      const res = await deleteTopic(
        new Request('http://localhost'),
        ctxParams('topic-1')
      );

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/crawl with existing source', () => {
    it('rejects a regular user crawling a global source', async () => {
      authAs('user-1', 'user');
      mockFindSource.mockResolvedValue({ id: 'src-global', userId: null });

      const res = await crawlPost(
        jsonRequest('POST', {
          sourceId: 'src-global',
          url: 'https://example.com',
        })
      );

      expect(res.status).toBe(403);
    });
  });
});
