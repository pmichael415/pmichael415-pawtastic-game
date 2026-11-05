// Blocked browser storage in a real browser (audit gap B): even getting `window.localStorage` throws (as some private
// modes and blocked-site-data settings do), or storage reads but every write fails (full). The new Daycare must start,
// play from memory and say plainly that progress can't be saved — never claim it saved. Chromium with iPhone 13
// emulation — not Safari. Needs the dev server. Run: NODE_PATH=/opt/node-tools/node_modules node qa/e2e-storage.cjs [base-url]
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`); };

async function scenario(browser, label, init) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState?.(), null, { timeout: 20000 });
    const start = page.getByRole('region', { name: 'Start your daycare' }).getByRole('button', { name: /Quick start/ });
    await start.tap();
    await page.waitForTimeout(800);
    const s = await page.evaluate(() => window.__tycoonState());
    check(`${label}: the game starts and Quick start builds a daycare in memory`, s && s.facilities.f1.rooms.length >= 2, `${s?.facilities.f1.rooms.length} rooms`);
    await page.getByRole('region', { name: 'Front desk' }).getByRole('button', { name: /^Check in / }).first().tap();
    await page.waitForTimeout(300);
    const checked = await page.evaluate(() => window.__tycoonState().facilities.f1.dogs.some((d) => d.checkedIn));
    check(`${label}: it plays — a pup can be checked in`, checked);
    const notice = await page.getByText(/Progress can't be saved in this browser/).count();
    check(`${label}: it says plainly that progress can't be saved`, notice > 0);
    const claims = await page.getByText(/^Saved\b|progress saved/i).count();
    check(`${label}: nothing claims it saved`, claims === 0);
    check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  } catch (e) {
    check(`${label}: run finished`, false, String(e).split('\n')[0]);
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await scenario(browser, 'getting localStorage throws', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  });
  await scenario(browser, 'storage reads but every write fails', () => {
    try { window.localStorage.clear(); } catch {}
    const proto = Object.getPrototypeOf(window.localStorage);
    proto.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
  });
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
