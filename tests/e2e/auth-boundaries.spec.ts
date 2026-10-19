import { expect, test } from '@playwright/test';

async function installTurnstileStub(page: import('@playwright/test').Page) {
  await page.route(/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/, route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.turnstile = { render: (_element, options) => { queueMicrotask(() => options.callback('test-captcha-token')); return 'test-widget'; }, remove: () => {} };`,
  }));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'turnstile', { configurable: false, value: {
      render: (_element: HTMLElement, options: { callback: (token: string) => void }) => {
        queueMicrotask(() => options.callback('test-captcha-token'));
        return 'test-widget';
      },
      remove: () => {},
    } });
  });
}

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
  await installTurnstileStub(page);
  await page.route('**/auth/v1/recover**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('mdvoro_cookie_consent', 'essential'));
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByRole('textbox', { name: 'Email' }).fill('student@example.com');
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  const resetRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/auth/v1/recover'));
  await page.getByRole('button', { name: 'Save' }).click();
  const request = await resetRequest;
  expect(request.postDataJSON()).toMatchObject({ gotrue_meta_security: { captcha_token: 'test-captcha-token' } });
  expect(new URL(request.url()).searchParams.get('redirect_to')).toContain('/auth/callback?next=/reset-password');
  await expect(page.locator('.form-success')).toHaveText('If the account exists, a reset link has been sent.');
});

test('password login sends Turnstile token to Supabase Auth', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The local HTTP test server cannot serve resources after Safari applies production HSTS.');
  await installTurnstileStub(page);
  await page.route('**/auth/v1/token**', route => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ code: 400, message: 'Invalid login credentials' }),
  }));
  await page.addInitScript(() => localStorage.setItem('mdvoro_cookie_consent', 'essential'));
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('student@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('not-a-real-password');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  const authRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/auth/v1/token'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  const request = await authRequest;
  expect(request.postDataJSON()).toMatchObject({ gotrue_meta_security: { captcha_token: 'test-captcha-token' } });
  await expect(page.locator('.form-error')).toHaveText('We could not complete that request. Check your details and try again.');
});

test('Google sign-in starts the Supabase OAuth flow with the trusted callback', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The local HTTP test server cannot serve resources after Safari applies production HSTS.');
  await page.route('**/auth/v1/authorize**', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('mdvoro_cookie_consent', 'essential'));
  await page.goto('/login');
  const oauthRequest = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/auth/v1/authorize'));
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const request = await oauthRequest;
  const url = new URL(request.url());
  expect(url.searchParams.get('provider')).toBe('google');
  expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:3000/auth/callback');
  expect(url.searchParams.get('prompt')).toBe('select_account');
});

test('remember email restores the saved address and can be cleared without saving a password', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The local HTTP test server cannot serve resources after Safari applies production HSTS.');
  await page.addInitScript(() => {
    localStorage.setItem('mdvoro_cookie_consent', 'essential');
    localStorage.setItem('mdvoro.remembered-email', 'student@example.com');
  });
  await page.goto('/login');
  const email = page.getByRole('textbox', { name: 'Email address' });
  const remember = page.getByLabel('Remember me');
  await expect(email).toHaveValue('student@example.com');
  await expect(remember).toBeChecked();
  await remember.uncheck();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mdvoro.remembered-email'))).toBeNull();
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeEmpty();
});

test('password visibility can be toggled without changing the entered value', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The local HTTP test server cannot serve resources after Safari applies production HSTS.');
  await page.addInitScript(() => localStorage.setItem('mdvoro_cookie_consent', 'essential'));
  await page.goto('/login');
  const password = page.getByRole('textbox', { name: 'Password' });
  await password.fill('example-password');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('example-password');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
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
