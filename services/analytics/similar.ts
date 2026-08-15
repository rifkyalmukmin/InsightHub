import prisma from '@/lib/db/prisma';

/**
 * Similar-article detection.
 *
 * Lightweight, zero-API approach: rank recent articles by Jaccard similarity
 * of title tokens plus a bonus for shared topics and same category. Good
 * enough to surface "related coverage" without embedding infrastructure.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'as', 'at', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'its', 'this', 'that', 'these', 'those', 'how', 'why', 'what', 'when',
  'who', 'which', 'not', 'no', 'new', 'more', 'most', 'has', 'have', 'had',
  'about', 'into', 'over', 'after', 'before', 'between', 'out', 'up', 'down',
  'off', 'your', 'you', 'we', 'they', 'their', 'our', 'his', 'her', 'than',
  'then', 'so', 'such', 'can', 'will', 'just', 'also', 'said', 'says',
  'according', 'report', 'reports',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOPWORDS.has(token))
  );
}

export interface SimilarArticle {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  category: string | null;
  createdAt: Date;
  publishDate: Date | null;
  source: { name: string; domain: string } | null;
  summary: { short: string | null } | null;
}

export interface SimilarArticleResult {
  article: SimilarArticle;
  score: number;
  sharedTopics: number;
}

/**
 * Find articles related to `articleId`. Returns results sorted by relevance,
 * each with a 0–1 similarity score. Empty when there are no decent matches.
 */
export async function findSimilarArticles(
  articleId: string,
  limit = 5
): Promise<SimilarArticleResult[]> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      title: true,
      category: true,
      tags: { select: { topicId: true } },
    },
  });

  if (!article) return [];

  const titleTokens = tokenize(article.title);

  // Candidate pool: the 100 most recent articles (skip the article itself).
  const candidates = await prisma.article.findMany({
    where: { id: { not: articleId } },
    select: {
      id: true,
      title: true,
      url: true,
      imageUrl: true,
      category: true,
      createdAt: true,
      publishDate: true,
      source: { select: { name: true, domain: true } },
      tags: { select: { topicId: true } },
      summary: { select: { short: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const articleTopics = new Set(article.tags.map((tag) => tag.topicId));

  const scored = candidates
    .map((candidate) => {
      const candidateTokens = tokenize(candidate.title);

      let intersection = 0;
      for (const token of candidateTokens) {
        if (titleTokens.has(token)) intersection++;
      }
      const union = titleTokens.size + candidateTokens.size - intersection;
      const jaccard = union === 0 ? 0 : intersection / union;

      const sharedTopics = candidate.tags.filter((tag) =>
        articleTopics.has(tag.topicId)
      ).length;
      const topicScore = Math.min(sharedTopics, 3) * 0.15;
      const categoryScore =
        article.category && candidate.category === article.category ? 0.05 : 0;

      return {
        article: candidate as SimilarArticle,
        score: jaccard + topicScore + categoryScore,
        sharedTopics,
      };
    })
    .filter((result) => result.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
