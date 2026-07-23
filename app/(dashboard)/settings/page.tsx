'use client';

import * as React from 'react';
import { useSession, signOut } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  User,
  Bell,
  Globe,
  Moon,
  Shield,
  LogOut,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useTheme } from 'next-themes';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = React.useState({
    email: true,
    push: false,
    digest: true,
  });
  const [preferences, setPreferences] = React.useState({
    language: 'en',
    articlesPerPage: 20,
  });

  const handleThemeChange = (checked: boolean) => {
    setTheme(checked ? 'dark' : 'light');
  };

  if (status === 'loading') {
    return (
      <DashboardLayout title="Settings">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-6 max-w-2xl">
        <Tabs defaultValue="profile">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Manage your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{session?.user?.name || 'User'}</h3>
                    <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={session?.user?.name || ''} disabled />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="flex items-center gap-2">
                    <Input id="email" value={session?.user?.email || ''} disabled />
                    <Badge variant="success" className="shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={() => signOut()}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize how InsightHub looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Moon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="dark-mode" className="cursor-pointer">
                        Dark Mode
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Toggle dark theme for the application
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={handleThemeChange}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Choose how you want to be notified</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="email-notif" className="cursor-pointer">
                        Email Notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Receive daily digest via email
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="email-notif"
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, email: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="push-notif" className="cursor-pointer">
                        Push Notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Get real-time updates in browser
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="push-notif"
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, push: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reading Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Input
                    id="language"
                    value={preferences.language}
                    onChange={(e) =>
                      setPreferences({ ...preferences, language: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="per-page">Articles per page</Label>
                  <Input
                    id="per-page"
                    type="number"
                    value={preferences.articlesPerPage}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        articlesPerPage: parseInt(e.target.value) || 20,
                      })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your account security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label>Two-Factor Authentication</Label>
                      <p className="text-xs text-muted-foreground">
                        Add an extra layer of security
                      </p>
                    </div>
                  </div>
                  <Switch disabled />
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Active Sessions</h4>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>Current device</span>
                    <Badge variant="secondary">macOS • Chrome</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
