import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'InsightHub - AI News Summarizer',
  description: 'AI-powered news summarization and analytics platform',
  keywords: ['news', 'AI', 'summarizer', 'analytics', 'insights'],
  authors: [{ name: 'InsightHub Team' }],
  openGraph: {
    type: 'website',
    title: 'InsightHub - AI News Summarizer',
    description: 'AI-powered news summarization and analytics platform',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InsightHub - AI News Summarizer',
    description: 'AI-powered news summarization and analytics platform',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
