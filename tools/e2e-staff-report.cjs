// The staff page's Owner report, against tools/mock-pay-server.mjs (needs dist/staff.html built).
//   node tools/mock-pay-server.mjs dist 8790 &   then   node tools/e2e-staff-report.cjs http://127.0.0.1:8790 [ready|not-ready]
// ready:     the mock reports from its own records (events, purchases) — after a purchase, money shows up.
// not-ready: server started with MOCK_REPORT=0 — the page says the database update is not applied, nothing else breaks.
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8790';
const suite = process.argv[3] || 'ready';
const GAME = `${base}/play/index.html`;
const STAFF = `${base}/staff/index.html`;
const results = [];
const check = (ok, label, extra = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
const text = page => page.evaluate(() => document.body.innerText);

async function closeIntroSheets(page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
    const b = await page.$('.sheet button:text-is("Collect"), .sheet button:text-is("Let\'s go"), .sheet button:text-is("OK")');
    if (!b) return;
    await b.click({ force: true });
  }
}
async function staffSignIn(page, email) {
  await page.goto(STAFF, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.click('button:text-is("Email me a sign-in code")');
  await page.waitForSelector('#code');
  await page.fill('#code', '123456');
  await page.click('button:text-is("Sign in")');
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })); // a normal phone: automated browsers are not measured
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));

  if (suite === 'ready') {
    // A player opens the game and buys 100 Treats, so there is something to report.
    await page.goto(GAME, { waitUntil: 'networkidle' });
    await page.fill('input[type=text]', 'Biscuit');
    await page.click('text=Start school');
    await closeIntroSheets(page);
    await page.click('button:has-text("Shop")', { force: true });
    await page.waitForTimeout(700);
    await page.click('button.shop-item:has-text("100 Treats")', { force: true });
    await page.click('.sheet button:text-is("Continue to checkout")');
    await page.waitForSelector('#signin-email', { timeout: 8000 }).catch(() => null);
    if (await page.$('#signin-email')) {
      await page.fill('#signin-email', 'buyer@example.com');
      await page.click('.sheet button:text-is("Email me a code")');
      await page.waitForSelector('#signin-code');
      await page.fill('#signin-code', '123456');
      await page.click('.sheet button:text-is("Sign in")');
    }
    await page.waitForSelector('text=Pay', { timeout: 15000 });
    await page.click('text=Pay');
    await page.waitForTimeout(2500);
    const s = await (await fetch(`${base}/mock/state`)).json();
    check(s.purchases.some(p => p.product === 'pack100' && p.status === 'paid'), 'mock server recorded a paid pack100');
  }

  // The desk is another person on another device: a fresh browser context (the game's session is per origin).
  const desk = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  desk.on('pageerror', e => errors.push(e.message));
  await staffSignIn(desk, 'info@pawtasticacademy.com');
  await desk.waitForSelector('.report', { timeout: 8000 });
  await desk.waitForTimeout(1500);
  const t = await text(desk);
  check(/Owner report/.test(t), 'staff page has an Owner report section');
  if (suite === 'not-ready') {
    check(/Not available yet/.test(t) && /database update 0010/.test(t), 'without migration 0010 the report says so plainly', t.match(/Not available yet[^\n]*\n[^\n]*/)?.[0]?.slice(0, 120));
    check(!/\$\d/.test(t.split('Owner report')[1]?.split('Weekly Challenge prizes')[0] ?? ''), 'no numbers are invented');
    check(/Look up a code/.test(t) && /Weekly Challenge prizes/.test(t), 'the rest of the desk still works');
  } else {
    check(/verified Stripe payments/i.test(t), 'money is labelled as verified Stripe payments');
    check(/TEST MODE — not real money/.test(t), 'test-mode data is labelled as not real money');
    check(/\$4\.99/.test(t) && /100 Treats/.test(t), 'the pack100 purchase shows as $4.99', (t.match(/Paid, after refunds[^\n]*/) || [''])[0]);
    check(/Devices that played/.test(t) && /Opened the game/.test(t), 'player and event counts are shown');
    check(/Paid but not delivered after 1 hour/.test(t), 'watch list covers undelivered purchases');
    await desk.click('button:text-is("30 days")');
    await desk.waitForTimeout(1200);
    const pressed = await desk.$eval('.report button[aria-pressed="true"]', el => el.textContent);
    check(pressed === '30 days', 'switching to 30 days', pressed);
  }
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
