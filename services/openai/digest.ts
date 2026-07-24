import { getOpenAIClient, OPENAI_MODELS } from './client';
import { buildDigestPrompt } from './prompts';
import prisma from '@/lib/db/prisma';

export interface DigestResult {
  title: string;
  content: string;
  articleIds: string[];
}

export async function generateDigest(
  type: 'morning' | 'evening' | 'weekly' | 'monthly',
  userId: string
): Promise<DigestResult> {
  const client = getOpenAIClient();

  // Determine date range
  const now = new Date();
  let startDate: Date;
  switch (type) {
    case 'morning':
    case 'evening':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'monthly':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  // Fetch articles
  const articles = await prisma.article.findMany({
    where: {
      userId: userId || undefined,
      createdAt: { gte: startDate },
      status: 'summarized',
    },
    include: {
      summary: true,
      source: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (articles.length === 0) {
    return {
      title: `No news for ${type} digest`,
      content: 'No articles available for this period.',
      articleIds: [],
    };
  }

  // Build articles text for AI
  const articlesText = articles
    .map((a: any, i: number) => {
      const summary = a.summary?.short || 'No summary available';
      return `${i + 1}. ${a.title}\n   Source: ${a.source?.name}\n   Summary: ${summary}\n`;
    })
    .join('\n');

  const prompt = buildDigestPrompt(type, articlesText);

  const response = await client.chat.completions.create({
    model: OPENAI_MODELS.GPT_4O_MINI,
    messages: [
      {
        role: 'system',
        content: 'You are a professional news editor. Create engaging, well-structured news digests.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = response.choices[0].message.content ?? '';
  const title = articles[0]?.summary?.headline || `${type.charAt(0).toUpperCase() + type.slice(1)} News Digest`;

  const result: DigestResult = {
    title,
    content,
    articleIds: articles.map((a: { id: string }) => a.id),
  };

  // Save digest to database
  await prisma.digest.create({
    data: {
      userId,
      type,
      title,
      content,
      articles: result.articleIds,
      startDate,
      endDate: now,
      sent: false,
    },
  });

  return result;
}
