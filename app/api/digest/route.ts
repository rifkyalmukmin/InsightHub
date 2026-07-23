import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { generateDigest } from '@/services/openai/digest';

export const POST = withRateLimit(async (request: Request) => {
  try {
    const body = await request.json();
    const { type, userId } = body;

    if (!type || !['morning', 'evening', 'weekly', 'monthly'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid digest type' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

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

// Import prisma for GET handler
import prisma from '@/lib/db/prisma';
