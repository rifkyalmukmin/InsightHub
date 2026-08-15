import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import { validateBody, digestSchema } from '@/lib/validations';
import { generateDigest } from '@/services/openai/digest';
import { consumeUsage } from '@/lib/utils/usage';
import { getUserPreferences } from '@/lib/preferences';
import { sendDigestEmail } from '@/lib/email/client';
import prisma from '@/lib/db/prisma';
import { internalServerError } from '@/lib/utils/api-error';

export const POST = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await request.json();
    const validation = validateBody(digestSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { type } = validation.data;

    // Daily per-user quota for paid OpenAI calls (checked before invoking).
    const usage = await consumeUsage(userId, 'digest');
    if (!usage.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Daily digest limit reached. Try again after ${usage.resetAt}.`,
        },
        { status: 429 }
      );
    }

    const digest = await generateDigest(type, userId);

    // Send email if user has digest notifications enabled
    const prefs = await getUserPreferences(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    let emailSent = false;
    if (
      user?.email &&
      prefs.notifications?.digest !== false &&
      prefs.notifications?.email !== false &&
      digest.articleIds.length > 0
    ) {
      emailSent = await sendDigestEmail(user.email, digest.title, digest.content);
      if (emailSent) {
        const latestDigest = await prisma.digest.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (latestDigest) {
          await prisma.digest.update({
            where: { id: latestDigest.id },
            data: { sent: true, sentAt: new Date() },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...digest, emailSent },
      message: `${type} digest generated successfully`,
    });
  } catch (error) {
    return internalServerError('Digest POST', error);
  }
});

export const GET = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const digests = await prisma.digest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: digests,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch digests' },
      { status: 500 }
    );
  }
});
