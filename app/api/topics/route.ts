import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import prisma from '@/lib/db/prisma';

export const GET = withRateLimit(async () => {
  try {
    const topics = await prisma.topic.findMany({
      include: {
        _count: { select: { articles: true } },
      },
      orderBy: {
        articles: {
          _count: 'desc',
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: topics,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch topics' },
      { status: 500 }
    );
  }
});

export const POST = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { name, description, color, icon } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Topic name is required' },
        { status: 400 }
      );
    }

    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

    const topic = await prisma.topic.create({
      data: {
        name,
        slug,
        description,
        color,
        icon,
      },
    });

    return NextResponse.json({
      success: true,
      data: topic,
      message: 'Topic created successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create topic' },
      { status: 500 }
    );
  }
});
