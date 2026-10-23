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
  '/reset-password',
  '/legal/privacy',
  '/legal/terms',
] as const;

test('public entry and legal pages remain within responsive viewport widths', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The local HTTP test server cannot serve assets after Safari applies this site’s production HSTS policy. Chromium covers the mobile viewport sizes.');
  test.setTimeout(90000);
  for (const path of publicPages.slice(0, 1)) {
    await page.goto(path, { waitUntil: 'load' });
    await expect(page.locator('body')).toBeVisible();
    for (const viewport of viewports) await assertNoHorizontalOverflow(page, path, viewport.width, viewport.name);
  }
  for (const path of publicPages.slice(1)) {
    await page.goto(path, { waitUntil: 'load' });
    await expect(page.locator('body')).toBeVisible();
    for (const width of [390, 768, 1440]) await assertNoHorizontalOverflow(page, path, width, `${width}px`);
  }
});

test('auth screens share the branded layout and an opaque full-colour logo', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The local HTTP test server cannot serve assets after this site’s production HSTS policy.');
  for (const path of ['/login', '/sign-up', '/forgot-password', '/reset-password']) {
    await page.goto(path, { waitUntil: 'load' });
    const layout = page.locator('.auth-login-wrap');
    await expect(layout).toBeVisible();
    await expect(layout.locator('.auth-login-header')).toBeVisible();
    await expect(layout.locator('.auth-login-card')).toBeVisible();
    const logo = layout.locator('.mdvoro-logo-light');
    await expect(logo).toBeVisible();
    const logoState = await logo.evaluate(element => ({
      opacity: getComputedStyle(element).opacity,
      filter: getComputedStyle(element).filter,
      width: (element as HTMLImageElement).naturalWidth,
    }));
    expect(logoState).toMatchObject({ opacity: '1', filter: 'none', width: 880 });
  }
});

test('mobile dashboard metrics stack cleanly and the navigation drawer covers the viewport', async ({ page }) => {
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
    <div class="shell">
      <header class="topbar">
        <div class="mobile-drawer is-open">
          <button type="button" class="mobile-menu-button" aria-label="Close menu">Menu</button>
          <button type="button" class="mobile-drawer-backdrop" aria-label="Close menu"></button>
          <nav class="mobile-drawer-panel" role="dialog" aria-modal="true">
            <div class="mobile-drawer-heading"><strong>MDvoro</strong><span>Learn. Practice. Excel.</span></div>
          </nav>
        </div>
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
        topbar: box(topbar),
        drawer: box(drawer),
        labelDisplay: getComputedStyle(label).display,
        valueDisplay: getComputedStyle(value).display,
        noteDisplay: getComputedStyle(note).display,
        label: box(label), value: box(value), note: box(note),
        viewportHeight: document.documentElement.clientHeight,
      };
    });

    expect(layout.topbarBackdrop, `${width}px topbar backdrop`).toBe('none');
    expect(layout.drawer.top, `${width}px drawer top`).toBe(layout.topbar.bottom);
    expect(layout.drawer.bottom, `${width}px drawer bottom`).toBe(layout.viewportHeight);
    expect(layout.labelDisplay).toBe('block');
    expect(layout.valueDisplay).toBe('block');
    expect(layout.noteDisplay).toBe('block');
    expect(layout.label.bottom).toBeLessThanOrEqual(layout.value.top);
    expect(layout.value.bottom).toBeLessThanOrEqual(layout.note.top);
    expect(layout.note.right).toBeLessThanOrEqual(width);
  }
});

test('dashboard question-progress hero fits narrow and wide screens in both text directions', async ({ page }) => {
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">
    <main class="page"><section class="dashboard-welcome card">
      <div class="dashboard-welcome-copy"><div class="eyebrow">Personal learning workspace</div><h1>Dashboard</h1><p class="subtitle">One place for your exam, practice, memory and next best action.</p><div class="dashboard-welcome-meta"><span>Choose exam</span><span>Secure learning session</span></div></div>
      <div class="dashboard-question-progress" role="img" aria-label="Questions answered: 1,863 of 5,497, 34 percent"><svg class="dashboard-question-progress-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="dashboard-question-progress-track" cx="50" cy="50" r="44"/><circle class="dashboard-question-progress-value" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="182.46"/></svg><div class="dashboard-question-progress-copy"><span>Questions answered</span><strong>34<small>%</small></strong><span>1,863 / 5,497 available</span></div></div>
      <div class="dashboard-welcome-action"><a class="btn btn-primary" href="/qbank">Start Question Bank</a><a class="dashboard-secondary-link" href="/study-plan">View your study plan</a></div>
    </section></main></body></html>`);
  await page.addStyleTag({ path: 'app/globals.css' });

  for (const direction of ['ltr', 'rtl'] as const) {
    await page.locator('html').evaluate((element, dir) => element.setAttribute('dir', dir), direction);
    for (const [width, height] of [[320, 700], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]] as const) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.dashboard-welcome')!;
        const ring = document.querySelector('.dashboard-question-progress')!;
        const action = document.querySelector('.dashboard-welcome-action')!;
        const bounds = (element: Element) => {
          const { left, right, top, bottom } = element.getBoundingClientRect();
          return { left, right, top, bottom };
        };
        return {
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          card: bounds(card), ring: bounds(ring), action: bounds(action),
        };
      });
      expect(layout.documentWidth, `${direction} ${width}px horizontal overflow`).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.ring.left, `${direction} ${width}px ring escapes card`).toBeGreaterThanOrEqual(layout.card.left);
      expect(layout.ring.right, `${direction} ${width}px ring escapes card`).toBeLessThanOrEqual(layout.card.right);
      await expect(page.getByRole('link', { name: 'Start Question Bank' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'View your study plan' })).toBeVisible();
    }
  }
});

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page, path: string, width: number, label: string) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(overflow.document, `${path} overflows at ${label} (${width}px): ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.viewport);
}
