export function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/news/') && pathname !== '/news') {
    return 'Article';
  }

  const titles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/news': 'News',
    '/sources': 'Sources',
    '/bookmarks': 'Bookmarks',
    '/topics': 'Topics',
    '/chat': 'AI Chat',
    '/analytics': 'Analytics',
    '/settings': 'Settings',
  };

  return titles[pathname] ?? 'InsightHub';
}
