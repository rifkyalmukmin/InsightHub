'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, Search, Moon, Sun, CheckCheck } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';
import { MobileNav } from './sidebar';
import type { Notification } from '@/types';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = React.useState(false);
  const notificationsRef = React.useRef<HTMLDivElement>(null);

  // Prefill the header search from /news?q= so both search boxes stay in sync
  const pathnameRef = React.useRef(pathname);
  React.useEffect(() => {
    pathnameRef.current = pathname;
    if (pathname === '/news') {
      const q = new URLSearchParams(window.location.search).get('q');
      setSearchQuery(q ?? '');
    }
  }, [pathname]);

  const fetchNotifications = React.useCallback(async () => {
    setIsLoadingNotifications(true);
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const json = await res.json();
      setNotifications(json.data || []);
      setUnreadCount(json.unreadCount ?? 0);
    } catch {
      // ignore — the bell just stays empty on transient failures
    } finally {
      setIsLoadingNotifications(false);
    }
  }, []);

  // Fetch on mount and re-fetch whenever the panel is opened
  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Close the panel on outside click (a fixed overlay would be contained by the
  // header's backdrop-blur stacking context, so use a document listener instead)
  React.useEffect(() => {
    if (!notificationsOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [notificationsOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      if (pathnameRef.current === '/news') router.push('/news');
      return;
    }
    router.push(`/news?q=${encodeURIComponent(query)}`);
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch {
      // ignore
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      fetch(`/api/notifications/${notification.id}`, { method: 'POST' }).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    setNotificationsOpen(false);
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card/95 backdrop-blur px-6">
      <MobileNav />

      {title && (
        <h1 className="text-lg font-semibold hidden md:block">{title}</h1>
      )}

      <form onSubmit={handleSearch} role="search" className="flex-1 flex items-center gap-2 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search articles..."
          className="h-9 border-0 bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative" ref={notificationsRef}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={notificationsOpen ? 'Close notifications' : 'Open notifications'}
            aria-expanded={notificationsOpen}
            onClick={() => {
              if (!notificationsOpen) fetchNotifications();
              setNotificationsOpen((open) => !open);
            }}
            className="relative"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 overflow-hidden rounded-lg border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <p className="text-sm font-semibold">Notifications</p>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={handleMarkAllRead}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-80">
                {isLoadingNotifications && notifications.length === 0 ? (
                  <div className="space-y-2 p-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">No notifications yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Crawl a news source and you&apos;ll be notified when it finishes.
                    </p>
                  </div>
                ) : (
                  <ul className="py-1">
                    {notifications.map((notification) => (
                      <li key={notification.id}>
                        <button
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={cn(
                            'flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-accent transition-colors',
                            !notification.read && 'bg-primary/5'
                          )}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="text-sm font-medium">{notification.title}</span>
                            {!notification.read && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                            )}
                          </div>
                          {notification.message && (
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {notification.message}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground/80">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
