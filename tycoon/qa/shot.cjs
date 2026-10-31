// Quick screenshot helper: node qa/shot.cjs <path> <out.png> [waitMs] [--fresh]
const { chromium, devices } = require('playwright');
(async () => {
  const [path = '/', out = 'qa/out/shot.png', wait = '2500'] = process.argv.slice(2);
  const fresh = process.argv.includes('--fresh');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:5173' + (fresh ? '/help' : path));
  if (fresh) { await page.evaluate(() => localStorage.clear()); await page.waitForTimeout(500); await page.goto('http://127.0.0.1:5173' + path, { waitUntil: 'domcontentloaded' }).catch(async () => { await page.waitForTimeout(800); await page.goto('http://127.0.0.1:5173' + path); }); }
  await page.waitForTimeout(Number(wait));
  await page.screenshot({ path: out });
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await browser.close();
})();
