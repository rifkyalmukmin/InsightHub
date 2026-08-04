import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import { validateBody, createTopicSchema } from '@/lib/validations';
import { slugify } from '@/lib/utils/slugify';
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
    const validation = validateBody(createTopicSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { name, description, color, icon } = validation.data;
    const slug = slugify(name);

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
