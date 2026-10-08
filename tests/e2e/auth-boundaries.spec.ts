import { expect, test } from '@playwright/test';

test('student and admin pages redirect anonymous visitors to sign in', async ({ page }) => {
  test.setTimeout(60000);
  for (const path of ['/dashboard', '/qbank', '/settings', '/admin/users']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  }
});

test('student and admin APIs reject anonymous requests without returning protected data', async ({ request }) => {
  for (const path of [
    '/api/qbank/catalog?examId=00000000-0000-4000-8000-000000000001',
    '/api/qbank/history',
    '/api/study-plan',
    '/api/admin/users',
    '/api/admin/audit',
  ]) {
    const response = await request.get(path);
    const body = await response.json();
    expect(response.status(), `${path} should require authentication: ${JSON.stringify(body)}`).toBe(401);
    expect(body).toMatchObject({ error: 'unauthorized' });
  }
});
