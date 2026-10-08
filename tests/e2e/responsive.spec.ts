import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'small Android', width: 320, height: 720 },
  { name: 'iPhone SE', width: 375, height: 812 },
  { name: 'modern phone', width: 390, height: 844 },
  { name: 'large phone', width: 430, height: 932 },
  { name: 'small tablet', width: 600, height: 900 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 960 },
] as const;

const publicPages = [
  '/login',
  '/sign-up',
  '/forgot-password',
  '/legal/privacy',
  '/legal/terms',
] as const;

test('public entry and legal pages remain within responsive viewport widths', async ({ page }) => {
  test.setTimeout(90000);
  for (const path of publicPages.slice(0, 1)) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    for (const viewport of viewports) await assertNoHorizontalOverflow(page, path, viewport.width, viewport.name);
  }
  for (const path of publicPages.slice(1)) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    for (const width of [390, 768, 1440]) await assertNoHorizontalOverflow(page, path, width, `${width}px`);
  }
});

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page, path: string, width: number, label: string) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(overflow.document, `${path} overflows at ${label} (${width}px): ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.viewport);
}
