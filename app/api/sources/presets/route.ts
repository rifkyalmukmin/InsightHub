import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { getSessionUser } from '@/lib/auth/session';
import { validateBody } from '@/lib/validations';
import prisma from '@/lib/db/prisma';
import {
  KOMPAS_PRESETS,
  getKompasPreset,
  presetToSource,
} from '@/lib/sources/kompas-presets';

const addPresetsSchema = z.object({
  slugs: z.array(z.string().min(1)).min(1).max(20),
});

export const GET = withRateLimit(async () => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const existing = await prisma.newsSource.findMany({
      where: { userId },
      select: { url: true, domain: true },
    });
    const existingUrls = new Set(existing.map((s) => s.url));
    const existingDomains = new Set(existing.map((s) => s.domain));

    const presets = KOMPAS_PRESETS.map((preset) => {
      const source = presetToSource(preset);
      return {
        ...preset,
        added: existingUrls.has(preset.url) || existingDomains.has(source.domain),
      };
    });

    return NextResponse.json({ success: true, data: presets });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch presets' },
      { status: 500 }
    );
  }
});

export const POST = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await request.json();
    const validation = validateBody(addPresetsSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const created: string[] = [];
    const skipped: string[] = [];

    for (const slug of validation.data.slugs) {
      const preset = getKompasPreset(slug);
      if (!preset) {
        skipped.push(slug);
        continue;
      }

      const sourceData = presetToSource(preset);

      const existing = await prisma.newsSource.findFirst({
        where: {
          userId,
          OR: [{ url: preset.url }, { domain: sourceData.domain }],
        },
      });

      if (existing) {
        skipped.push(slug);
        continue;
      }

      await prisma.newsSource.create({
        data: { ...sourceData, userId, status: 'active' },
      });
      created.push(slug);
    }

    return NextResponse.json({
      success: true,
      data: { created, skipped },
      message:
        created.length > 0
          ? `${created.length} sumber Kompas.id ditambahkan`
          : 'Semua kategori sudah ada',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to add presets' },
      { status: 500 }
    );
  }
});
