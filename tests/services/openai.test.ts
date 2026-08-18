import { summarizeArticle } from '../../services/openai/summarize';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    article: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    summary: {
      upsert: jest.fn(),
    },
    topic: {
      upsert: jest.fn(),
    },
    articleTag: {
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../../services/openai/client', () => ({
  getOpenAIClient: jest.fn().mockReturnValue({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }),
  OPENAI_MODELS: { GPT_4O: 'gpt-4o', GPT_4O_MINI: 'gpt-4o-mini' },
}));

import prisma from '@/lib/db/prisma';

const mockArticleFindUnique = prisma.article.findUnique as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OpenAI Services', () => {
  describe('summarizeArticle', () => {
    it('should throw error when article not found', async () => {
      mockArticleFindUnique.mockResolvedValue(null);

      await expect(summarizeArticle('non-existent-id')).rejects.toThrow(
        'Article not found'
      );
    });
  });
});
