import { getOpenAIClient, OpenAIModel, OPENAI_MODELS } from './client';
import { buildChatPrompt } from './prompts';
import prisma from '@/lib/db/prisma';

export interface ChatResult {
  content: string;
  sources: string[];
  tokensUsed: number;
}

export async function chatWithArticles(
  message: string,
  context: string,
  model: OpenAIModel = OPENAI_MODELS.GPT_4O_MINI
): Promise<ChatResult> {
  const client = getOpenAIClient();
  const prompt = buildChatPrompt(context);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: message },
    ],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const content = response.choices[0].message.content ?? '';
  const tokensUsed = response.usage?.total_tokens ?? 0;

  // Extract article IDs mentioned in the response for citation
  const sourcePattern = /Article (\w+)/g;
  const sources: string[] = [];
  let match;
  while ((match = sourcePattern.exec(content)) !== null) {
    sources.push(match[1]);
  }

  return { content, sources, tokensUsed };
}

export async function createChatStream(
  messages: { role: string; content: string }[],
  context: string,
  model: OpenAIModel = OPENAI_MODELS.GPT_4O_MINI
): Promise<AsyncIterable<string>> {
  const client = getOpenAIClient();
  const systemPrompt = buildChatPrompt(context);

  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'system' as const, content: systemPrompt }, ...messages.map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }))],
    temperature: 0.7,
    max_tokens: 1500,
    stream: true,
  });

  async function* generate(): AsyncIterable<string> {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  return generate();
}
