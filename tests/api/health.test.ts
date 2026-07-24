import { GET } from '../../app/api/health/route';

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('should return 200 with status ok', async () => {
      const response = await GET();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data).toHaveProperty('timestamp');
    });
  });
});
