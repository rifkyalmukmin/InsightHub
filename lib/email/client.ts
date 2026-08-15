import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

/**
 * Escape HTML metacharacters so untrusted text cannot inject markup.
 * Digest titles/contents are AI-generated from crawled articles (untrusted
 * input) — a malicious site can prompt-inject raw HTML, so every value that
 * is interpolated into an email body must be escaped first.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const transport = createTransport();
  if (!transport) {
    logger.warn('SMTP not configured — email not sent');
    return false;
  }

  const from = process.env.SMTP_FROM || 'noreply@insighthub.ai';

  try {
    await transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    logger.info({ to: options.to, subject: options.subject }, 'Email sent');
    return true;
  } catch (error) {
    logger.error({ err: error, to: options.to }, 'Failed to send email');
    return false;
  }
}


export async function sendDigestEmail(
  to: string,
  title: string,
  content: string
): Promise<boolean> {
  // title/content are AI-generated from crawled articles (untrusted input) —
  // escape before interpolating into the HTML body to prevent HTML injection
  // (e.g. prompt-injected <img onerror> tracking pixels or phishing markup).
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #3B82F6;">InsightHub Digest</h1>
      <h2>${escapeHtml(title)}</h2>
      <div style="line-height: 1.6; color: #333;">
        ${escapeHtml(content).replace(/\n/g, '<br>')}
      </div>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">
        You received this because email digests are enabled in your InsightHub settings.
      </p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `InsightHub: ${title}`,
    html,
    text: `${title}\n\n${content}`,
  });
}
