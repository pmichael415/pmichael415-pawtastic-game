// A slow /config answer (5 s) must not turn the Shop into "coming soon".
//   MOCK_CONFIG_DELAY_MS=5000 node tools/mock-pay-server.mjs dist 8960 &   then   node tools/e2e-slow-config.cjs http://127.0.0.1:8960
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8960';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/play/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type=text]', { timeout: 20000 });
  await page.fill('input[type=text]', 'Slowpoke');
  await page.click('text=Start school');
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(600); const b = await page.$('.sheet button:text-is("Collect"), .sheet button:text-is("Let\'s go")'); if (!b) break; await b.click({ force: true }); }
  await page.click('button:has-text("Shop")', { force: true });
  await page.waitForTimeout(600);
  const shop = await page.innerText('body');
  const ok = /55 Treats/.test(shop) && /\$2\.99/.test(shop) && !/coming soon/i.test(shop);
  console.log(`${ok ? 'PASS' : 'FAIL'}  slow config (5 s): the Shop still sells Treats`);
  console.log(`${errors.length ? 'FAIL' : 'PASS'}  no page errors ${errors.join(' / ')}`);
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
