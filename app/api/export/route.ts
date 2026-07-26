import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import prisma from '@/lib/db/prisma';

export const POST = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await request.json();
    const { articleIds, format } = body;

    if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Article IDs are required' },
        { status: 400 }
      );
    }

    if (!['pdf', 'markdown', 'csv'].includes(format)) {
      return NextResponse.json(
        { success: false, error: 'Invalid format. Use pdf, markdown, or csv.' },
        { status: 400 }
      );
    }

    const articles = await prisma.article.findMany({
      where: {
        id: { in: articleIds },
        OR: [{ userId }, { userId: null }],
      },
      include: {
        summary: true,
        source: true,
        tags: { include: { topic: true } },
      },
    });

    let content: string;
    let mimeType: string;
    let extension: string;

    if (format === 'csv') {
      const headers = ['Title', 'URL', 'Author', 'Published', 'Source', 'Category', 'Summary', 'Topics'];
      const rows = articles.map((a: { title?: string | null; url?: string | null; author?: string | null; publishDate?: Date | null; source?: { name?: string | null } | null; category?: string | null; summary?: { short?: string | null } | null; tags: { topic: { name: string } }[] }) => [
        `"${(a.title || '').replace(/"/g, '""')}"`,
        `"${(a.url || '').replace(/"/g, '""')}"`,
        `"${(a.author || '').replace(/"/g, '""')}"`,
        a.publishDate?.toISOString() || '',
        `"${(a.source?.name || '').replace(/"/g, '""')}"`,
        `"${(a.category || '').replace(/"/g, '""')}"`,
        `"${(a.summary?.short || '').replace(/"/g, '""')}"`,
        `"${a.tags.map((t: { topic: { name: string } }) => t.topic.name).join(', ')}"`,
      ]);
      content = [headers.join(','), ...rows].join('\n');
      mimeType = 'text/csv';
      extension = 'csv';
    } else if (format === 'markdown') {
      content = articles.map((a: { title: string | null; source?: { name?: string | null } | null; author?: string | null; publishDate?: Date | null; url: string | null; summary?: { short?: string | null; keyTakeaways?: string[] | null } | null; markdown?: string | null; content: string | null; tags: { topic: { name: string } }[] }) => {
        const lines = [
          `# ${a.title}`,
          '',
          `**Source:** ${a.source?.name} | **Author:** ${a.author || 'Unknown'} | **Published:** ${a.publishDate?.toLocaleDateString() || 'Unknown'}`,
          '',
          `**URL:** ${a.url}`,
          '',
          '## Summary',
          '',
          a.summary?.short || 'No summary available.',
          '',
          '## Content',
          '',
          a.markdown || (a.content ? a.content.slice(0, 5000) : '') + '...',
        ];

        if (a.summary?.keyTakeaways?.length) {
          lines.push('', '## Key Takeaways', '');
          a.summary.keyTakeaways.forEach((takeaway: string) => lines.push(`- ${takeaway}`));
        }

        if (a.tags.length) {
          lines.push('', '## Topics', '');
          a.tags.forEach((t) => lines.push(`- ${t.topic.name}`));
        }

        return lines.join('\n');
      }).join('\n\n---\n\n');
      mimeType = 'text/markdown';
      extension = 'md';
    } else {
      // PDF - return HTML content that can be converted to PDF client-side
      content = JSON.stringify({
        type: 'pdf-data',
        articles: articles.map((a: any) => ({
          title: a.title ?? undefined,
          url: a.url ?? undefined,
          author: a.author ?? undefined,
          publishDate: a.publishDate ? a.publishDate.toISOString() : undefined,
          source: a.source?.name ?? undefined,
          category: a.category ?? undefined,
          summary: a.summary?.short ?? undefined,
          keyTakeaways: a.summary?.keyTakeaways ?? undefined,
          content: a.content ? a.content.slice(0, 10000) : undefined,
        })),
      });
      mimeType = 'application/json';
      extension = 'json';
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="insighthub-export.${extension}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Export failed' },
      { status: 500 }
    );
  }
});
