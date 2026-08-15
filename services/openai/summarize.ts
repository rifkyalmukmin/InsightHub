import { getOpenAIClient, OpenAIModel, OPENAI_MODELS } from './client';
import { buildSummaryPrompt } from './prompts';
import prisma from '@/lib/db/prisma';

export interface SummarizeResult {
  short: string;
  detailed: string;
  keyTakeaways: string[];
  insights: string[];
  headline: string;
  alternativeHeadlines: string[];
  conclusion: string;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentReason: string;
  keywords: string[];
  readingTime: number;
  tokensUsed: number;
  processingTime: number;
}

export async function summarizeArticle(
  articleId: string,
  model: OpenAIModel = OPENAI_MODELS.GPT_4O_MINI
): Promise<SummarizeResult> {
  const startTime = Date.now();
  const client = getOpenAIClient();

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true },
  });

  if (!article) {
    throw new Error('Article not found');
  }

  const prompt = buildSummaryPrompt(article.title, article.content);

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are an expert news analyst. Provide objective, factual summaries. Never add information not present in the source material. Always respond with valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' as const },
  });

  const processingTime = (Date.now() - startTime) / 1000;
  const tokensUsed = response.usage?.total_tokens ?? 0;
  const content = response.choices[0].message.content ?? '';

  let parsed: SummarizeResult;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Fallback: try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse AI response');
    }
  }

  // Calculate reading time
  const wordCount = article.content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);

  const result: SummarizeResult = {
    short: parsed.short || '',
    detailed: parsed.detailed || '',
    keyTakeaways: parsed.keyTakeaways || [],
    insights: parsed.insights || [],
    headline: parsed.headline || article.title,
    alternativeHeadlines: parsed.alternativeHeadlines || [],
    conclusion: parsed.conclusion || '',
    topics: parsed.topics || [],
    sentiment: parsed.sentiment || 'neutral',
    sentimentReason: parsed.sentimentReason || '',
    keywords: parsed.keywords || [],
    readingTime,
    tokensUsed,
    processingTime,
  };

  // Save summary to database
  await prisma.summary.upsert({
    where: { articleId },
    create: {
      articleId,
      short: result.short,
      detailed: result.detailed,
      keyTakeaways: result.keyTakeaways,
      insights: result.insights,
      headline: result.headline,
      alternativeHeadlines: result.alternativeHeadlines,
      conclusion: result.conclusion,
      model,
      tokensUsed: result.tokensUsed,
      processingTime: result.processingTime,
    },
    update: {
      short: result.short,
      detailed: result.detailed,
      keyTakeaways: result.keyTakeaways,
      insights: result.insights,
      headline: result.headline,
      alternativeHeadlines: result.alternativeHeadlines,
      conclusion: result.conclusion,
      model,
      tokensUsed: result.tokensUsed,
      processingTime: result.processingTime,
    },
  });

  // Update article with extracted data
  await prisma.article.update({
    where: { id: articleId },
    data: {
      status: 'summarized',
      sentiment: result.sentiment,
      sentimentScore: result.sentiment === 'positive' ? 0.8 : result.sentiment === 'neutral' ? 0.5 : 0.2,
      readingTime: result.readingTime,
      wordCount,
    },
  });

  // Create or link topics
  for (const topicName of result.topics) {
    const slug = topicName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    const topic = await prisma.topic.upsert({
      where: { slug },
      create: { name: topicName, slug },
      update: {},
    });

    await prisma.articleTag.upsert({
      where: { articleId_topicId: { articleId, topicId: topic.id } },
      create: { articleId, topicId: topic.id },
      update: {},
    });
  }

  return result;
}

