// iPhone Home Screen app sign-in and purchases, against tools/mock-pay-server.mjs (Chromium, iPhone screen).
// Two separate browser contexts act as the two places iOS keeps apart: Safari and the Home Screen app.
//   node tools/mock-pay-server.mjs dist 8830 &   then   node tools/e2e-homescreen.cjs http://127.0.0.1:8830

const { chromium, devices } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8830';
const GAME = `${base}/play/index.html`;
const EMAIL = 'phone@example.com';
const results = [];
const check = (ok, label, extra = '') => { results.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
const wallet = page => page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-wallet-v1')));
const state = async () => (await fetch(`${base}/mock/state`)).json();

async function closeSheets(page, keep = []) {
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(600);
    const names = ['Collect', "Let's go", 'OK', 'Play the game', 'Yay!'].filter(n => !keep.includes(n));
    const b = await page.$(names.map(n => `.sheet button:text-is("${n}")`).join(', '));
    if (!b) return;
    await b.click({ force: true });
  }
}
async function enroll(page, name) {
  await page.fill('input[type=text]', name);
  await page.click('text=Start school');
  await page.waitForTimeout(600);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const iphone = devices['iPhone 13'];
  const context = async ({ standalone }) => {
    const ctx = await browser.newContext({ ...iphone, isMobile: true, hasTouch: true });
    if (standalone) await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };

  // The Home Screen app: a player who has been playing, not signed in.
  const appPage = await context({ standalone: true });
  await appPage.goto(GAME, { waitUntil: 'networkidle' });
  await enroll(appPage, 'Biscuit');
  await closeSheets(appPage);
  // Sign-in from the app: the email step explains the Safari code.
  await appPage.click('button[aria-label="Sound and effects"]', { force: true });
  await appPage.waitForTimeout(300);
  await appPage.click('.sheet button:text-is("Save progress to the cloud")');
  await appPage.fill('#signin-email', EMAIL);
  await appPage.click('.sheet button:text-is("Email me a code")');
  await appPage.waitForSelector('#signin-code');
  const hint = await appPage.innerText('.sheet');
  check(/Playing from your Home Screen\?/.test(hint) && /Safari opens and shows a 6-digit code/.test(hint), 'app: the code step explains the Safari code', hint.replace(/\n/g, ' | ').slice(0, 200));

  // Safari: the email's link lands here (what iOS does), signs in, and shows the code for the app.
  const safari = await context({ standalone: false });
  const link = (await (await fetch(`${base}/mock/magic-link?email=${encodeURIComponent(EMAIL)}`)).json()).url;
  await safari.goto(link, { waitUntil: 'networkidle' });
  await enroll(safari, 'Biscuit');
  await closeSheets(safari, ['Keep playing here']);
  await safari.waitForSelector('.sheet .friend-code', { timeout: 15000 }).catch(() => {});
  const sheet = await safari.innerText('.sheet').catch(() => '');
  const code = (await safari.$eval('.sheet .friend-code', el => el.textContent).catch(() => '')).trim();
  check(/Playing from your Home Screen\?/.test(sheet) && /^\d{6}$/.test(code), 'Safari: after the email link, shows a 6-digit code for the app', code);
  await safari.click('.sheet button:text-is("Keep playing here")');

  // The purchase happens in Safari (as it did for the owner).
  await safari.click('button:has-text("Shop")', { force: true });
  await safari.waitForTimeout(500);
  await safari.click('button.shop-item:has-text("55 Treats")', { force: true });
  await safari.click('.sheet button:text-is("Continue to checkout")');
  await safari.waitForURL(/\/mock-stripe\/checkout\//, { timeout: 10000 });
  await Promise.all([safari.waitForURL(/\/play\/index\.html/, { timeout: 10000 }), safari.click('#pay')]);
  await safari.waitForTimeout(2500);
  check((await wallet(safari)).treats.paid === 55, 'Safari: 55 Treats bought');
  const bought = (await state()).purchases.find(p => p.product === 'pack55');
  check(bought?.claimed, 'server: the purchase was claimed by Safari');

  // A wrong code is refused; the right one signs the app in, and the purchase reaches the app too.
  await appPage.fill('#signin-code', code === '000000' ? '111111' : '000000');
  await appPage.click('.sheet button:text-is("Sign in")');
  await appPage.waitForTimeout(800);
  check(/didn.t work|wrong|check/i.test(await appPage.innerText('.sheet')), 'app: a wrong code is refused');
  await appPage.fill('#signin-code', code);
  await Promise.all([appPage.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), appPage.click('.sheet button:text-is("Sign in")')]);
  await appPage.waitForTimeout(3000);
  await closeSheets(appPage);
  const signed = await appPage.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-session-v1') ?? 'null'));
  check(signed?.email === EMAIL, 'app: signed in to the same account with the code');
  const w = await wallet(appPage);
  check(w.treats.paid === 55 && w.purchases.applied.includes(bought?.id), 'app: the Treats bought in Safari are in the app', JSON.stringify(w.treats));
  check(!(await appPage.$('.sheet .friend-code')), 'app: no code sheet inside the Home Screen app');

  // The same code can't be used twice.
  const reuse = await fetch(`${base}/api/public/game/signin-code/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, code }) });
  check(reuse.status === 400, 'server: a used code is refused');

  // Safari's menu can make a new code any time.
  await safari.click('button[aria-label="Sound and effects"]', { force: true });
  await safari.waitForTimeout(300);
  check(/Sign in my Home Screen app/.test(await safari.innerText('.sheet')), 'Safari menu: Sign in my Home Screen app');
  await safari.click('.sheet button:text-is("Done")');

  check(errors.length === 0, 'no page errors', errors.join(' / '));
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
