import { NextResponse } from 'next/server';
import { getSessionUser, isAdmin } from '@/lib/auth/session';
import { validateBody, articleIdSchema } from '@/lib/validations';
import prisma from '@/lib/db/prisma';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;

    const { id: rawId } = await params;
    const idValidation = validateBody(articleIdSchema, { id: rawId });
    if (!idValidation.success) {
      return NextResponse.json(
        { success: false, error: idValidation.error },
        { status: 400 }
      );
    }
    const { id } = idValidation.data;

    const existing = await prisma.topic.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Topic not found' },
        { status: 404 }
      );
    }

    // Topics are global resources with no per-user owner — only admins may
    // delete them so regular users cannot destroy shared taxonomy.
    if (!isAdmin(auth.user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await prisma.topic.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: 'Topic deleted successfully',
    });
  } catch (error) {
    console.error('Topic delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete topic' },
      { status: 500 }
    );
  }
}
