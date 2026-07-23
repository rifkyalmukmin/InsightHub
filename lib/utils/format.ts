import { formatDistanceToNow, formatRelative, format } from 'date-fns';
import { enUS, es, fr, de, ja, zhCN } from 'date-fns/locale';
import type { Locale } from 'date-fns';

const locales: Record<string, Locale> = {
  en: enUS,
  es,
  fr,
  de,
  ja,
  zh: zhCN,
};

export function formatRelativeTime(date: Date | string, lang: string = 'en'): string {
  const locale = locales[lang] ?? enUS;
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale });
}

export function formatDateTime(date: Date | string, lang: string = 'en'): string {
  const locale = locales[lang] ?? enUS;
  return format(new Date(date), 'PPpp', { locale });
}

export function formatDate(date: Date | string, lang: string = 'en'): string {
  const locale = locales[lang] ?? enUS;
  return format(new Date(date), 'MMM d, yyyy', { locale });
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length).trimEnd() + '…';
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function readingTime(wordCount: number): number {
  return Math.ceil(wordCount / 200);
}
