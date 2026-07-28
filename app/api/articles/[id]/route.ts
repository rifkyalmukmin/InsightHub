import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { validateBody, articleIdSchema } from '@/lib/validations';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const { id: rawId } = await params;
    const idValidation = validateBody(articleIdSchema, { id: rawId });
    if (!idValidation.success) {
      return NextResponse.json(
        { success: false, error: idValidation.error },
        { status: 400 }
      );
    }
    const { id } = idValidation.data;

    const article = await prisma.article.findUnique({
      where: { id },
      include: {
        summary: true,
        source: true,
        tags: { include: { topic: true } },
        bookmarks: {
          where: { userId },
        },
      },
    });

    if (!article) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Ensure user owns the article or it's a shared/global article
    if (article.userId && article.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: article,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch article' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const { id } = await params;

    // Verify ownership before deleting
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }
    if (article.userId && article.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await prisma.article.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Article deleted successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete article' },
      { status: 500 }
    );
  }
}
