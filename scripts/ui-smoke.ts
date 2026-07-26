/**
 * UI smoke test — drives a real browser through the signed-in app.
 *
 * Type checking proves a page compiles; it says nothing about whether it renders. This
 * signs up through the actual form, visits every route, and fails on a console error, a
 * failed request, or a page that renders no heading — the three ways a page can be "green"
 * in CI and blank in a browser.
 *
 * It also writes screenshots to .screenshots/ so the result can be compared against
 * design/screenshots/ by eye, which is the only way to check fidelity.
 *
 *   pnpm dev  (or build && start)
 *   pnpm ui:smoke
 */
import { mkdirSync } from 'node:fs';

import { chromium, type ConsoleMessage, type Page } from 'playwright';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const OUT = '.screenshots';

let failures = 0;
const fail = (message: string) => {
  console.error(`  ✗ ${message}`);
  failures += 1;
};
const pass = (message: string) => console.log(`  ✓ ${message}`);

async function main() {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  // 390px is the design's mobile canvas; the desktop pass runs after.
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();

  const problems: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    // An aborted request is not a failed one. Next prefetches every visible link as RSC
    // payload and cancels those still in flight when you navigate — reporting them would
    // make this test cry wolf on every single run.
    if (reason.includes('ABORTED')) return;
    if (/favicon|\.map$/.test(request.url())) return;
    problems.push(`request failed (${reason}): ${request.url()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));

  const email = `smoke-${Date.now()}@example.test`;

  console.log('\nSign up');
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/home/, { timeout: 15000 });
  pass('signed up and landed on /home');

  const routes: Array<{ path: string; expect: RegExp; shot: string }> = [
    { path: '/home', expect: /Matchweek|Quiet week|Nothing to predict|No fixtures/i, shot: 'home' },
    { path: '/predict', expect: /Matchweek|Predict|No fixtures/i, shot: 'predict' },
    { path: '/live', expect: /in play|What's on/i, shot: 'live' },
    { path: '/table', expect: /Table/i, shot: 'table' },
    { path: '/season-picks', expect: /Predict the table|Teams aren|No season/i, shot: 'season-picks' },
    { path: '/teams', expect: /Teams/i, shot: 'teams' },
    { path: '/rules', expect: /How scoring works/i, shot: 'rules' },
    { path: '/profile', expect: /Profile/i, shot: 'profile' },
    { path: '/settings/notifications', expect: /Notifications/i, shot: 'notifications' },
    { path: '/leagues', expect: /Leagues/i, shot: 'leagues' },
    { path: '/leagues/new', expect: /New league/i, shot: 'leagues-new' },
    { path: '/join', expect: /Join a league/i, shot: 'join' },
    { path: '/install', expect: /home screen/i, shot: 'install' },
  ];

  console.log('\nRoutes');
  for (const route of routes) {
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });

    const heading = await page.locator('h1').first().textContent().catch(() => null);
    if (!heading || heading.trim() === '') {
      fail(`${route.path} rendered no <h1>`);
      continue;
    }
    if (!route.expect.test(heading)) {
      fail(`${route.path} heading was "${heading.trim()}", expected ${route.expect}`);
      continue;
    }

    await page.screenshot({ path: `${OUT}/${route.shot}-mobile.png`, fullPage: true });
    pass(`${route.path} — "${heading.trim()}"`);
  }

  console.log('\nLeague flow');
  await page.goto(`${BASE}/leagues/new`);
  await page.getByLabel('League name').fill('Smoke Test League');
  await page.getByRole('button', { name: 'Create league' }).click();
  await page.waitForURL(/\/leagues\/[0-9a-f-]{36}/, { timeout: 15000 });
  const leagueUrl = page.url();
  pass('created a league');

  await page.screenshot({ path: `${OUT}/league-home-mobile.png`, fullPage: true });

  for (const [suffix, shot] of [
    ['/leaderboard', 'leaderboard'],
    ['/selection', 'selection'],
    ['/recap', 'recap'],
    ['/members', 'members'],
    ['/admin', 'league-admin'],
  ] as const) {
    await page.goto(`${leagueUrl}${suffix}`, { waitUntil: 'networkidle' });
    const heading = await page.locator('h1').first().textContent();
    if (!heading?.trim()) fail(`${suffix} rendered no <h1>`);
    else {
      await page.screenshot({ path: `${OUT}/${shot}-mobile.png`, fullPage: true });
      pass(`${suffix} — "${heading.trim()}"`);
    }
  }

  console.log('\nNot found and boundaries');
  await page.goto(`${BASE}/leagues/00000000-0000-4000-8000-000000000000`, {
    waitUntil: 'networkidle',
  });
  const notFound = await page.locator('h1').first().textContent();
  if (notFound && /nothing here/i.test(notFound)) {
    pass('an unknown league renders the designed not-found, not a stack trace');
    await page.screenshot({ path: `${OUT}/not-found-mobile.png`, fullPage: true });
  } else {
    fail(`unknown league rendered "${notFound}"`);
  }

  console.log('\nAccess control');
  await page.goto(`${BASE}/ops`, { waitUntil: 'networkidle' });
  const opsPath = new URL(page.url()).pathname;
  if (opsPath === '/ops') {
    fail('a non-admin reached /ops');
  } else {
    // Redirected rather than 403'd, so /ops does not confirm it exists.
    pass(`a non-admin is redirected away from /ops (to ${opsPath})`);
  }

  console.log('\nDesktop pass');
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const route of routes) {
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/${route.shot}-desktop.png`, fullPage: true });
  }
  pass('desktop screenshots captured');

  console.log('\nAccessibility spot checks');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${BASE}/predict`, { waitUntil: 'networkidle' });

  // Every interactive element must clear the 44px floor the design tokens set.
  const tooSmall = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], input, select')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // not rendered
      // Visually-hidden-until-focused elements (the skip link) collapse to 1px by design;
      // their real size only exists while focused, so measure that instead.
      if (el.className.toString().includes('sr-only')) continue;
      if (rect.height < 44) {
        offenders.push(`${el.tagName}.${el.className.toString().slice(0, 40)} h=${Math.round(rect.height)}`);
      }
    }
    return offenders;
  });

  if (tooSmall.length > 0) {
    fail(`${tooSmall.length} tap targets under 44px:\n      ${tooSmall.slice(0, 6).join('\n      ')}`);
  } else {
    pass('every tap target clears 44px');
  }

  console.log('\nResponsive shell');

  // Mobile: bottom tab bar present, desktop sidebar absent.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  const mobileNavs = await page.locator('nav[aria-label="Main"]:visible').count();
  const mobileBottomTab = await page
    .locator('nav[aria-label="Main"]:visible a[href="/predict"]')
    .isVisible()
    .catch(() => false);
  if (mobileNavs === 1 && mobileBottomTab) pass('mobile shows exactly one nav (bottom tabs)');
  else fail(`mobile nav wrong: ${mobileNavs} visible nav(s), predict tab visible=${mobileBottomTab}`);

  // Desktop: sidebar present, bottom bar gone. Both visible at once would mean the
  // breakpoints overlap and every page has two navs.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  const desktopNavs = await page.locator('nav[aria-label="Main"]:visible').count();
  const sidebar = await page.locator('aside:visible').count();
  if (desktopNavs === 1 && sidebar === 1) pass('desktop shows exactly one nav (sidebar)');
  else fail(`desktop nav wrong: ${desktopNavs} visible nav(s), ${sidebar} sidebar(s)`);

  // The content column must not stretch edge to edge on a wide screen.
  const mainWidth = await page.locator('main #main, #main').first().evaluate((el) => {
    const inner = el.querySelector('div');
    return inner ? inner.getBoundingClientRect().width : el.getBoundingClientRect().width;
  });
  if (mainWidth < 1200) pass(`desktop content column is bounded (${Math.round(mainWidth)}px)`);
  else fail(`desktop content spans ${Math.round(mainWidth)}px — no max width`);

  console.log('\nCommand palette');
  await page.keyboard.press('Meta+k');
  const paletteOpen = await page
    .locator('[role="dialog"][aria-label="Command palette"]')
    .isVisible()
    .catch(() => false);
  if (paletteOpen) {
    pass('⌘K opens the palette');
    await page.keyboard.press('Escape');
    const closed = !(await page
      .locator('[role="dialog"][aria-label="Command palette"]')
      .isVisible()
      .catch(() => false));
    if (closed) pass('Escape closes it');
    else fail('Escape did not close the palette');
  } else {
    fail('⌘K did not open the palette');
  }

  console.log('\nPWA');
  const manifest = await page.evaluate(async () => {
    const res = await fetch('/manifest.webmanifest');
    return res.ok ? await res.json() : null;
  });
  if (manifest?.name && manifest.icons?.length >= 3) {
    pass(`manifest serves (${manifest.icons.length} icons, display ${manifest.display})`);
  } else {
    fail('manifest missing or incomplete');
  }

  const maskable = (manifest?.icons ?? []).some(
    (icon: { purpose?: string }) => icon.purpose === 'maskable',
  );
  if (maskable) pass('a maskable icon is declared');
  else fail('no maskable icon — Android will crop the logo');

  const swOk = await page.evaluate(async () => {
    const res = await fetch('/sw.js');
    return res.ok;
  });
  if (swOk) pass('service worker is served');
  else fail('/sw.js not reachable');

  console.log('\nLight theme');
  // Desktop shows the three-way radio group; mobile shows a single cycling button. Both
  // are real controls, so drive each where it actually renders.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: 'Light' }).first().click();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (bg === 'rgb(11, 12, 13)') fail(`light theme did not apply (body still ${bg})`);
  else pass(`light theme applies (body ${bg})`);

  // The whole point of the blocking inline script: the choice must survive a reload with
  // no flash of the wrong theme.
  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme'),
  );
  if (afterReload === 'light') pass('theme choice persists across a reload');
  else fail(`theme did not persist (data-theme=${afterReload})`);

  // The mobile control is a cycling button; one press must change the theme.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  const before = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme'),
  );
  await page.getByRole('button', { name: /^Theme:/ }).first().click();
  const after = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme'),
  );
  if (before !== after) pass('the mobile theme button cycles');
  else fail(`mobile theme button did nothing (still ${after})`);

  // Pin light explicitly. The cycle test above left the theme wherever it landed, and a
  // screenshot named "-light" that is actually dark is worse than no screenshot.
  await page.evaluate(() => {
    localStorage.setItem('matchday-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });

  for (const [route, shot] of [
    ['/home', 'home'],
    ['/predict', 'predict'],
    ['/live', 'live'],
    ['/leagues', 'leagues'],
  ] as const) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    const isLight = await page.evaluate(
      () => document.documentElement.getAttribute('data-theme') === 'light',
    );
    if (!isLight) fail(`${route} lost the light theme on navigation`);
    await page.screenshot({ path: `${OUT}/${shot}-light.png`, fullPage: true });
  }
  pass('light-theme screenshots captured');

  if (problems.length > 0) {
    console.error('\nConsole and network problems:');
    for (const problem of [...new Set(problems)].slice(0, 10)) console.error(`  ✗ ${problem}`);
    failures += problems.length;
  }

  await browser.close();

  if (failures > 0) {
    console.error(`\n${failures} problem(s). Screenshots in ${OUT}/\n`);
    process.exit(1);
  }
  console.log(`\nAll pages render. Screenshots in ${OUT}/\n`);
}

main().catch((error) => {
  console.error('\n  ✗', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});

export type { Page };
