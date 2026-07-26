import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSessionUser } from '@/lib/auth/session';

export async function PUT(
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
    if (existing.userId && existing.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const source = await prisma.newsSource.update({
      where: { id },
      data: {
        name: body.name,
        domain: body.domain,
        url: body.url,
        description: body.description,
        category: body.category,
        status: body.status,
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
    if (existing.userId && existing.userId !== userId) {
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
