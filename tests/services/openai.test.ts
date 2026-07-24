import { summarizeArticle } from '../../services/openai/summarize';

describe('OpenAI Services', () => {
  describe('summarizeArticle', () => {
    it('should throw error when article not found', async () => {
      await expect(summarizeArticle('non-existent-id')).rejects.toThrow('Article not found');
    });
  });
});
