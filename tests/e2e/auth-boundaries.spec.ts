import { expect, test } from '@playwright/test';

test('student and admin pages redirect anonymous visitors to sign in', async ({ page }) => {
  test.setTimeout(60000);
  for (const path of ['/dashboard', '/qbank', '/settings', '/admin/users']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  }
});

test('login links to password recovery and sends the reset request without revealing account existence', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The local HTTP test server cannot serve resources after Safari applies production HSTS.');
  await page.route('**/auth/v1/recover**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('mdvoro_cookie_consent', 'essential'));
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByRole('textbox', { name: 'Email' }).fill('student@example.com');
  const resetRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/auth/v1/recover'));
  await page.getByRole('button', { name: 'Save' }).click();
  await resetRequest;
  await expect(page.getByRole('status')).toHaveText('If the account exists, a reset link has been sent.');
});

test('remember email restores the saved address and can be cleared without saving a password', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The local HTTP test server cannot serve resources after Safari applies production HSTS.');
  await page.addInitScript(() => {
    localStorage.setItem('mdvoro_cookie_consent', 'essential');
    localStorage.setItem('mdvoro.remembered-email', 'student@example.com');
  });
  await page.goto('/login');
  const email = page.getByRole('textbox', { name: 'Email' });
  const remember = page.getByLabel('Remember my email on this device');
  await expect(email).toHaveValue('student@example.com');
  await expect(remember).toBeChecked();
  await remember.uncheck();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mdvoro.remembered-email'))).toBeNull();
  await expect(page.getByLabel('Password')).toBeEmpty();
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
