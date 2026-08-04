import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import { validateBody, digestSchema } from '@/lib/validations';
import { generateDigest } from '@/services/openai/digest';
import prisma from '@/lib/db/prisma';

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

    const digest = await generateDigest(type, userId);

    return NextResponse.json({
      success: true,
      data: digest,
      message: `${type} digest generated successfully`,
    });
  } catch (error) {
    console.error('Digest error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Digest generation failed',
      },
      { status: 500 }
    );
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
