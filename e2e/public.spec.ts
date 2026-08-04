import { test, expect } from '@playwright/test';

test.describe('Public pages', () => {
  test('home redirects to sign-in when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('sign-in page renders', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByText('Sign in to your InsightHub account')).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('sign-up page renders', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByText('Create an account')).toBeVisible();
  });
});

test.describe('API health', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('ok');
  });
});
