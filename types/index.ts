import { Article, Summary, Topic, Bookmark, NewsSource, Conversation, Message } from '@prisma/client';

// Extended types with relations
export interface ArticleWithSummary extends Article {
  summary: Summary | null;
  topics: { topic: Topic; relevance: number }[];
  bookmark: Bookmark | null;
}

export interface ArticleWithRelations extends Article {
  summary: Summary | null;
  topics: TopicWithRelevance[];
  bookmark: Bookmark | null;
  source: NewsSource;
}

export interface TopicWithRelevance {
  topic: Topic;
  relevance: number;
}

export interface TopicWithArticles extends Topic {
  _count: { articles: number };
  articles?: ArticleWithRelations[];
}

export interface NewsSourceWithCount extends NewsSource {
  _count: { articles: number };
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
  topic: Topic | null;
}

export interface DashboardStats {
  totalNews: number;
  totalSources: number;
  totalSummaries: number;
  newsToday: number;
  newsThisWeek: number;
  trendingTopics: TrendingTopic[];
  newsPerDay: ChartData[];
  categoryDistribution: ChartData[];
  sourceDistribution: ChartData[];
}

export interface TrendingTopic {
  name: string;
  slug: string;
  count: number;
  color?: string;
}

export interface ChartData {
  name: string;
  value: number;
  [key: string]: string | number;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Crawl types
export interface CrawlRequest {
  url: string;
  maxPages?: number;
  depth?: number;
  scrapeOptions?: {
    formats?: string[];
  };
}

export interface CrawlResponse {
  jobId?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
}

// Summarize types
export interface SummarizeRequest {
  articleId: string;
  model?: 'gpt-4o' | 'gpt-4o-mini';
}

export interface SummarizeResponse {
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
}

// Chat types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: string[];
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  topicId?: string;
  model?: string;
  stream?: boolean;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  content: string;
  sources?: string[];
}

// Bookmark types
export type BookmarkType = 'bookmark' | 'favorite';

export interface BookmarkRequest {
  articleId: string;
  type?: BookmarkType;
  collection?: string;
  note?: string;
}

// Source types
export interface SourceRequest {
  name: string;
  domain: string;
  url: string;
  description?: string;
  category?: string;
}

// Export types
export type ExportFormat = 'pdf' | 'markdown' | 'csv';

export interface ExportRequest {
  articleIds: string[];
  format: ExportFormat;
}

// Digest types
export type DigestType = 'morning' | 'evening' | 'weekly' | 'monthly';

export interface DigestRequest {
  type: DigestType;
  userId: string;
}

// Search types
export interface SearchFilters {
  query?: string;
  topic?: string;
  source?: string;
  author?: string;
  sentiment?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest' | 'relevant';
  userId?: string;
}

// Notification types
export interface Notification {
  id: string;
  type: 'digest' | 'alert' | 'system';
  title: string;
  message?: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
}
