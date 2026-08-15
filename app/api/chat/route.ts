import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/utils/rateLimit';
import { chatWithArticles, createChatStream } from '@/services/openai/chat';
import prisma from '@/lib/db/prisma';
import { searchArticles } from '@/services/analytics/search';
import { validateBody, chatSchema } from '@/lib/validations';
import { getSessionUser } from '@/lib/auth/session';
import { consumeUsage } from '@/lib/utils/usage';
import { internalServerError } from '@/lib/utils/api-error';

export const POST = withRateLimit(async (request: Request): Promise<NextResponse> => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await request.json();
    const validation = validateBody(chatSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { message, conversationId, topicId, model, stream } = validation.data;

    // Search for relevant articles to build context
    const searchResult = await searchArticles({
      query: message,
      limit: 5,
      userId,
    });

    if (searchResult.total === 0) {
      return NextResponse.json({
        success: true,
        data: {
          content: "I couldn't find any relevant articles to answer your question. Try crawling more news sources first.",
          sources: [],
        },
        message: 'No relevant articles found',
      });
    }

    // Daily per-user quota for paid OpenAI calls (checked before invoking).
    const usage = await consumeUsage(userId, 'chat');
    if (!usage.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Daily chat limit reached. Try again after ${usage.resetAt}.`,
        },
        { status: 429 }
      );
    }

    // Build context from search results
    const context = searchResult.articles
      .map((article: { id: string; title: string; summary?: { short?: string | null } | null; source?: { name?: string | null } | null; tags?: { topic: { name: string } }[] }, i: number) => {
        const summary = article.summary?.short || article.title;
        return `Article ${article.id} (${i + 1}):\nTitle: ${article.title}\nSource: ${article.source?.name}\nSummary: ${summary}\n`;
      })
      .join('\n\n');

    // Create or get conversation
    let convId = conversationId;
    if (convId) {
      const existing = await prisma.conversation.findUnique({
        where: { id: convId },
        select: { userId: true },
      });
      if (!existing || existing.userId !== userId) {
        return NextResponse.json(
          { success: false, error: 'Conversation not found' },
          { status: 404 }
        );
      }
    } else {
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          topicId: topicId || null,
          title: message.slice(0, 100),
          model,
        },
      });
      convId = conversation.id;
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: convId,
        role: 'user',
        content: message,
      },
    });

    if (stream) {
      // For streaming, we return a ReadableStream
      const chatStream = await createChatStream(
        [{ role: 'user', content: message }],
        context,
        model
      );

      // Save assistant message placeholder
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: convId,
          role: 'assistant',
          content: '',
          model,
          sources: searchResult.articles.map((a: { id: string }) => a.id),
        },
      });

      const encoder = new TextEncoder();
      let fullContent = '';

      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of chatStream) {
            fullContent += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          // Update the saved message with full content
          await prisma.message.update({
            where: { id: assistantMessage.id },
            data: { content: fullContent },
          });
          controller.close();
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const result = await chatWithArticles(message, context, model);

    // Save assistant message
    await prisma.message.create({
      data: {
        conversationId: convId,
        role: 'assistant',
        content: result.content,
        model,
        sources: result.sources,
        tokensUsed: result.tokensUsed,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        conversationId: convId,
        content: result.content,
        sources: result.sources,
      },
    });
  } catch (error) {
    return internalServerError('Chat POST', error);
  }
});

export const GET = withRateLimit(async (request: Request) => {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (conversationId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          topic: true,
        },
      });

      if (!conversation || conversation.userId !== userId) {
        return NextResponse.json(
          { success: false, error: 'Conversation not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: conversation,
      });
    }

    const conversations = await prisma.conversation.findMany({
      where: { userId },
      include: {
        _count: { select: { messages: true } },
        topic: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
});
