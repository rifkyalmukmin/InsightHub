import { FirecrawlAppV1 as FirecrawlApp } from '@mendable/firecrawl-js';

let firecrawlClient: FirecrawlApp | null = null;

export function getFirecrawlClient(): FirecrawlApp {
  if (!firecrawlClient) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    const baseUrl = process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev';

    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY is not set');
    }

    firecrawlClient = new FirecrawlApp({
      apiKey,
      apiUrl: baseUrl,
    });
  }
  return firecrawlClient;
}

export interface CrawlOptions {
  url: string;
  maxPages?: number;
  depth?: number;
  scrapeOptions?: {
    formats?: string[];
  };
}

export interface CrawlResult {
  success: boolean;
  jobId?: string;
  data?: {
    markdown?: string;
    content?: string;
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      pageURL?: string;
      author?: string;
      publishedTime?: string;
      image?: string;
      [key: string]: string | undefined;
    };
  }[];
  error?: string;
}
