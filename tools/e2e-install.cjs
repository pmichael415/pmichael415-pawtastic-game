// Browser test of "Add to Home Screen" against tools/mock-pay-server.mjs (payments may be on or off). Graduation Day's
// own site points players to the PAWtastic Games hub (the one stop, owner 7 Nov 2026): its map shows the hub notice
// instead of an install banner, and installing is offered from the menu.
//   node tools/mock-pay-server.mjs dist 8810 &   then   node tools/e2e-install.cjs http://127.0.0.1:8810
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8810';
const GAME = `${base}/play/index.html`;
const results = [];
const check = (ok, label, extra = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
async function closeIntroSheets(page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    const b = await page.$('.sheet button:text-is("Collect"), .sheet button:text-is("Let\'s go")');
    if (!b) return; await b.click({ force: true });
  }
}
async function enroll(page) {
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', 'Biscuit'); await page.click('text=Start school'); await closeIntroSheets(page);
}
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctxFor = async (opts, init) => {
    const ctx = await browser.newContext(opts);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); return page;
  };

  // Manifest and icons.
  const m = await (await fetch(`${base}/manifest.webmanifest`)).json();
  check(m.short_name === 'PAWtastic' && m.name === 'PAWtastic Academy: Graduation Day' && m.display === 'standalone' && m.start_url === '/play/index.html', 'manifest: name, short name, standalone, start page');
  const iconsOk = await Promise.all(m.icons.map(async i => (await fetch(base + i.src)).ok));
  check(iconsOk.every(Boolean) && m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), 'manifest: all icons load, including a maskable one');

  const HUB = 'https://play.pawtasticacademy.com/graduation';
  const openMenuAdd = async (page) => {
    await page.click('button[aria-label="Sound and effects"]', { force: true }); await page.waitForTimeout(300);
    await page.click('.sheet button:text-is("Add to Home Screen")', { force: true }); await page.waitForTimeout(300);
  };

  // Desktop: the hub notice on the map (no install banner); installing from the menu.
  let page = await ctxFor({ viewport: { width: 1280, height: 900 } });
  await enroll(page);
  check(await page.$eval('link[rel=manifest]', l => l.getAttribute('href')) === '/manifest.webmanifest', 'page links the manifest');
  check(await page.$eval('meta[name="apple-mobile-web-app-title"]', x => x.content) === 'PAWtastic', 'page names the Home Screen app PAWtastic');
  check(/Graduation Day now lives in PAWtastic Games/.test(await page.innerText('body')), 'map shows the PAWtastic Games notice');
  check(await page.$eval('.hub-card a', a => a.getAttribute('href')) === HUB, 'the notice opens Graduation Day in the hub', HUB);
  check(!(await page.$('.install-card')), 'no install banner on Graduation Day\'s own site');
  await page.goto(GAME, { waitUntil: 'networkidle' }); await closeIntroSheets(page);
  check(!!(await page.$('.hub-card')), 'the notice stays after reloading');
  await openMenuAdd(page);
  check(/install icon at the right end of the address bar/.test(await page.innerText('.sheet')), 'desktop: install steps for Chrome/Edge (from the menu)');
  await page.click('.sheet button:text-is("Got it")');

  // iPhone Safari: Share steps, plus the cloud-save tip.
  page = await ctxFor({ ...devices['iPhone 13'] });
  await enroll(page);
  await openMenuAdd(page);
  const ios = await page.innerText('.sheet');
  check(/Tap the Share button/.test(ios) && /Add to Home Screen/.test(ios), 'iPhone: Share → Add to Home Screen steps');
  check(/Tap Save progress first/.test(ios), 'iPhone: tip to save progress before moving to the app');

  // Android Chrome: the browser's own install prompt.
  page = await ctxFor({ ...devices['Pixel 7'] });
  await enroll(page);
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await openMenuAdd(page); await page.waitForTimeout(500);
  check(await page.evaluate(() => window.__prompted === true), "Android: opens the browser's install prompt");

  // Already on the Home Screen (iPhone app of the old site): still shown the way to the hub, no menu item.
  page = await ctxFor({ ...devices['iPhone 13'] }, () => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  await enroll(page);
  check(!!(await page.$('.hub-card')) && !(await page.$('.install-card')), 'installed old-site app: the PAWtastic Games notice, no install banner');
  await page.click('button[aria-label="Sound and effects"]', { force: true }); await page.waitForTimeout(300);
  check(!/Add to Home Screen/.test(await page.innerText('.sheet')), 'installed app: no menu item');

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
