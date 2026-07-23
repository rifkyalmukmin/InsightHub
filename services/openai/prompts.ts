export const SUMMARY_PROMPT = `You are an expert news analyst. Analyze the following news article and provide a comprehensive, objective summary.

ARTICLE:
Title: {title}
Content: {content}

Provide your response in the following JSON format. Do not add any information that is not present in the article:

{
  "short": "A concise summary in 2-3 sentences (max 150 words)",
  "detailed": "A detailed summary covering all key points (3-5 paragraphs)",
  "keyTakeaways": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "insights": ["insight 1", "insight 2", "insight 3"],
  "headline": "A compelling headline for this article",
  "alternativeHeadlines": ["headline 1", "headline 2", "headline 3", "headline 4", "headline 5"],
  "conclusion": "A brief concluding statement",
  "topics": ["topic 1", "topic 2", "topic 3"],
  "sentiment": "positive|neutral|negative",
  "sentimentReason": "Brief explanation of the sentiment classification",
  "keywords": ["keyword 1", "keyword 2", "keyword 3", "keyword 4", "keyword 5", "keyword 6", "keyword 7", "keyword 8", "keyword 9", "keyword 10"]
}`;

export const CHAT_SYSTEM_PROMPT = `You are InsightHub AI, a knowledgeable news assistant. You help users understand and explore news articles.

RULES:
1. Only answer based on the news articles provided in the context. Do not make up information.
2. If you don't know the answer based on the available articles, say so honestly.
3. Cite specific articles when referencing information.
4. Be concise but informative.
5. Maintain objectivity - present facts, not opinions.
6. If asked about topics not covered in the articles, suggest the user crawl more news sources.

CURRENT CONTEXT:
{context}

Respond naturally to the user's question.`;

export const DIGEST_PROMPT = `You are a news editor creating a {type} digest.

Create an engaging, well-structured digest from the following articles:

{articles}

Structure:
1. Headline for the digest
2. Top 3 most important stories with brief summaries
3. Quick hits (other notable stories in 1 sentence each)
4. Key trends observed
5. What to watch for next

Keep it concise, engaging, and professional.`;

export const TOPIC_EXTRACTION_PROMPT = `Extract topics, entities, and keywords from the following text.

TEXT: {content}

Return a JSON object with:
{
  "topics": ["main topics"],
  "companies": ["company names mentioned"],
  "people": ["people mentioned"],
  "locations": ["locations mentioned"],
  "technologies": ["technologies mentioned"],
  "keywords": ["top 10 most important keywords"]
}`;

export function buildSummaryPrompt(title: string, content: string): string {
  return SUMMARY_PROMPT.replace('{title}', title).replace('{content}', content.slice(0, 15000));
}

export function buildChatPrompt(context: string): string {
  return CHAT_SYSTEM_PROMPT.replace('{context}', context.slice(0, 10000));
}

export function buildDigestPrompt(type: string, articles: string): string {
  return DIGEST_PROMPT.replace('{type}', type).replace('{articles}', articles.slice(0, 12000));
}
