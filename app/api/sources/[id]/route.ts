import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSessionUser, isAdmin } from '@/lib/auth/session';
import { validateBody, articleIdSchema, updateSourceSchema } from '@/lib/validations';

export async function PUT(
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

    // Verify ownership
    const existing = await prisma.newsSource.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Source not found' },
        { status: 404 }
      );
    }
    // Owner may modify their own source; unowned (global) sources are
    // admin-only so any authenticated user can no longer edit/delete them.
    if (existing.userId ? existing.userId !== userId : !isAdmin(auth.user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = validateBody(updateSourceSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { name, domain, url, description, category, status } = validation.data;

    const source = await prisma.newsSource.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(domain !== undefined && { domain }),
        ...(url !== undefined && { url }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json({
      success: true,
      data: source,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update source' },
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

    // Verify ownership
    const existing = await prisma.newsSource.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Source not found' },
        { status: 404 }
      );
    }
    // Owner may modify their own source; unowned (global) sources are
    // admin-only so any authenticated user can no longer edit/delete them.
    if (existing.userId ? existing.userId !== userId : !isAdmin(auth.user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await prisma.newsSource.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Source deleted successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete source' },
      { status: 500 }
    );
  }
}
