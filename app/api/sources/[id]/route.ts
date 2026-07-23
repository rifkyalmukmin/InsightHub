import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const { id } = await params;

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
