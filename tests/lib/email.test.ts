import { sendDigestEmail, escapeHtml } from '@/lib/email/client';

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: (...args: unknown[]) => mockSendMail(...args),
  })),
}));

const ORIGINAL_ENV = { ...process.env };

describe('escapeHtml', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands first (no double-encoding)', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Hello, world!')).toBe('Hello, world!');
  });
});

describe('sendDigestEmail', () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: 'test' });
    process.env.SMTP_HOST = 'smtp.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function sentHtml(): string {
    expect(mockSendMail).toHaveBeenCalled();
    return mockSendMail.mock.calls[0][0].html as string;
  }

  it('escapes HTML in the title', async () => {
    const sent = await sendDigestEmail(
      'user@test.com',
      '<img src=x onerror=alert(1)>',
      'Body'
    );

    expect(sent).toBe(true);
    const html = sentHtml();
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes HTML in the content', async () => {
    await sendDigestEmail('user@test.com', 'Title', 'Hello <script>alert("xss")</script>');

    const html = sentHtml();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps plain text and line breaks intact', async () => {
    await sendDigestEmail('user@test.com', 'Today’s News', 'Headline one\nHeadline two');

    const html = sentHtml();
    expect(html).toContain('Today’s News');
    expect(html).toContain('Headline one<br>Headline two');
  });
});
