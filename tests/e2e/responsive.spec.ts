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

test('mobile dashboard metrics stack cleanly and the navigation drawer covers the viewport', async ({ page }) => {
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
    <div class="shell">
      <header class="topbar">
        <details class="mobile-drawer" open>
          <summary>Menu</summary>
          <button class="mobile-drawer-backdrop" aria-label="Close menu"></button>
          <nav class="mobile-drawer-panel">
            <div class="mobile-drawer-heading"><strong>MDvoro</strong><span>Learn. Practice. Excel.</span></div>
          </nav>
        </details>
      </header>
      <main class="page">
        <section class="grid grid-4 dashboard-metrics">
          <article class="card metric premium-metric">
            <span class="metric-label">Readiness index</span>
            <strong class="metric-value">—</strong>
            <span class="metric-note">Transparent learning-health signal, not an official exam score.</span>
          </article>
        </section>
      </main>
    </div></body></html>`);
  await page.addStyleTag({ path: 'app/globals.css' });

  for (const [width, height] of [[360, 780], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const topbar = document.querySelector('.topbar')!;
      const drawer = document.querySelector('.mobile-drawer-panel')!;
      const metric = document.querySelector('.metric')!;
      const label = metric.querySelector('.metric-label')!;
      const value = metric.querySelector('.metric-value')!;
      const note = metric.querySelector('.metric-note')!;
      const box = (element: Element) => {
        const { top, bottom, left, right } = element.getBoundingClientRect();
        return { top, bottom, left, right };
      };
      return {
        topbarBackdrop: getComputedStyle(topbar).backdropFilter,
        drawer: box(drawer),
        labelDisplay: getComputedStyle(label).display,
        valueDisplay: getComputedStyle(value).display,
        noteDisplay: getComputedStyle(note).display,
        label: box(label), value: box(value), note: box(note),
        viewportHeight: document.documentElement.clientHeight,
      };
    });

    expect(layout.topbarBackdrop, `${width}px topbar backdrop`).toBe('none');
    expect(layout.drawer.top, `${width}px drawer top`).toBe(64);
    expect(layout.drawer.bottom, `${width}px drawer bottom`).toBe(layout.viewportHeight);
    expect(layout.labelDisplay).toBe('block');
    expect(layout.valueDisplay).toBe('block');
    expect(layout.noteDisplay).toBe('block');
    expect(layout.label.bottom).toBeLessThanOrEqual(layout.value.top);
    expect(layout.value.bottom).toBeLessThanOrEqual(layout.note.top);
    expect(layout.note.right).toBeLessThanOrEqual(width);
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
