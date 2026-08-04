import { getCrawlUrlError } from '@/lib/utils/url';
import { validateBody, registerSchema } from '@/lib/validations';

describe('URL validation', () => {
  it('allows public HTTPS URLs', () => {
    expect(getCrawlUrlError('https://example.com/article')).toBeNull();
  });

  it('blocks localhost', () => {
    expect(getCrawlUrlError('http://localhost:3000/admin')).not.toBeNull();
  });

  it('blocks private IP ranges', () => {
    expect(getCrawlUrlError('http://192.168.1.1/internal')).not.toBeNull();
    expect(getCrawlUrlError('http://10.0.0.1/metadata')).not.toBeNull();
    expect(getCrawlUrlError('http://127.0.0.1/')).not.toBeNull();
  });

  it('blocks non-HTTP protocols', () => {
    expect(getCrawlUrlError('file:///etc/passwd')).not.toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(getCrawlUrlError('not-a-url')).not.toBeNull();
  });
});

describe('Validation schemas', () => {
  it('registerSchema rejects short passwords', () => {
    const result = registerSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      password: '123',
    });
    expect(result.success).toBe(false);
  });

  it('registerSchema accepts valid input', () => {
    const result = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'securepassword',
    });
    expect(result.success).toBe(true);
  });
});
