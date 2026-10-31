// End-to-end test of real purchases against tools/mock-pay-server.mjs, in Chromium (Playwright).
//   node tools/mock-pay-server.mjs dist 8790 &   then   node tools/e2e-payments.cjs http://127.0.0.1:8790 [suite]
// suite: main (default) | lost (server started with MOCK_LOSE_PAYMENTS=1) | off (MOCK_PAYMENTS=0)

const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8790';
const suite = process.argv[3] || 'main';
const GAME = `${base}/play/index.html`;
const EMAIL = 'buyer@example.com';
const results = [];
const check = (ok, label, extra = '') => { results.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };

const wallet = page => page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-wallet-v1')));
const state = async () => (await fetch(`${base}/mock/state`)).json();
const text = page => page.innerText('body');

async function closeIntroSheets(page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    const b = await page.$('.sheet button:text-is("Collect"), .sheet button:text-is("Let\'s go"), .sheet button:text-is("OK")');
    if (!b) return;
    await b.click({ force: true });
  }
}
async function enroll(page, name) {
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', name);
  await page.click('text=Start school');
  await closeIntroSheets(page);
}
async function toast(page, re, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await page.$eval('.toast', el => el.innerText).catch(() => '');
    if (re.test(t)) return t;
    await page.waitForTimeout(150);
  }
  return null;
}
async function openMenu(page) { await page.click('button[aria-label="Sound and effects"]', { force: true }); await page.waitForTimeout(400); }
async function signIn(page, email = EMAIL) {
  await page.waitForSelector('#signin-email');
  await page.fill('#signin-email', email);
  await page.click('.sheet button:text-is("Email me a code")');
  await page.waitForSelector('#signin-code');
  await page.fill('#signin-code', '123456');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.click('.sheet button:text-is("Sign in")')]);
}
async function payOnMockStripe(page) {
  await page.waitForURL(/\/mock-stripe\/checkout\//, { timeout: 10000 });
  const item = await page.innerText('#item');
  await Promise.all([page.waitForURL(/\/play\/index\.html/, { timeout: 10000 }), page.click('#pay')]);
  return item;
}
async function goShop(page) { await page.click('button:has-text("Shop")', { force: true }); await page.waitForTimeout(600); }

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };

  if (suite === 'off') {
    const page = await newPage();
    await enroll(page, 'Biscuit');
    await goShop(page);
    check(/Buying Treats is coming soon/.test(await text(page)), 'payments off: shop sells nothing');
    await page.goto(GAME, { waitUntil: 'networkidle' }); await closeIntroSheets(page);
    await openMenu(page);
    const menu = await page.innerText('.sheet');
    check(/Report a problem/.test(menu) && !/Sign in/.test(menu), 'payments off: menu has Report a problem, no sign-in', menu.replace(/\n/g, ' | '));
  }

  if (suite === 'lost') {
    const page = await newPage();
    await enroll(page, 'Biscuit');
    await goShop(page);
    await page.click('button.shop-item:has-text("55 Treats")', { force: true });
    await page.click('.sheet button:text-is("Continue to checkout")');
    await signIn(page);
    await payOnMockStripe(page);
    await page.waitForSelector('.sheet:has-text("Your payment is on its way")', { timeout: 45000 }).catch(() => {});
    check(/Your payment is on its way/.test(await text(page)), 'lost payment: player told it is on its way');
    const s = await state();
    check(s.reports.some(r => r.kind === 'not-delivered' && r.details?.sessionId), 'lost payment: not-delivered report sent with the session id');
  }

  if (suite === 'main') {
    const a = await newPage();
    await enroll(a, 'Biscuit');
    // 1. Buy 100 Treats: confirm, sign in, Stripe, back.
    await goShop(a);
    check(/Secure checkout by Stripe/.test(await text(a)) && /test mode/i.test(await text(a)), 'shop shows Stripe checkout and test-mode note');
    check(!/Reward Coins/.test(await text(a)), 'shop hides the demo Reward Coins');
    await a.click('button.shop-item:has-text("100 Treats")', { force: true });
    const confirm = await a.innerText('.sheet');
    check(/\$4\.99/.test(confirm) && /Continue to checkout/.test(confirm) && /test mode/i.test(confirm), 'confirm sheet: price, test mode, continue button');
    await a.click('.sheet button:text-is("Continue to checkout")');
    check(await a.$('#signin-email'), 'asks to sign in before paying');
    await signIn(a);
    const item = await payOnMockStripe(a);
    check(/100 Treats — \$4\.99/.test(item), 'Stripe page shows 100 Treats $4.99', item);
    check(await toast(a, /Thanks! 100 Treats added/), 'toast: Thanks! 100 Treats added');
    check(!/checkout=/.test(a.url()), 'return URL cleaned', a.url());
    let w = await wallet(a);
    check(w.treats.paid === 100 && w.purchases.applied.length === 1, 'wallet: 100 paid Treats, one purchase applied', JSON.stringify(w.treats));
    let s = await state();
    check(s.purchases.length === 1 && s.purchases[0].claimed, 'server: purchase marked claimed');
    const saved = Object.values(s.saves)[0];
    check(saved?.wallet?.purchases?.applied?.includes(s.purchases[0].id), 'server: saved game holds the applied purchase');
    // 2. Reload: nothing doubles.
    await a.goto(GAME, { waitUntil: 'networkidle' }); await closeIntroSheets(a); await a.waitForTimeout(1500);
    w = await wallet(a);
    check(w.treats.paid === 100, 'reload: still exactly 100 paid Treats');

    // 3. Second device: sign in and get everything back.
    const b = await newPage();
    await enroll(b, 'Rex');
    await openMenu(b);
    await b.click('.sheet button:text-is("Sign in to restore purchases")');
    await signIn(b);
    await closeIntroSheets(b); await b.waitForTimeout(1200);
    const wb = await wallet(b);
    check(wb.dog?.name === 'Biscuit' && wb.treats.paid === 100, 'second device: progress and purchase restored', `${wb.dog?.name} / ${wb.treats.paid}`);

    // 4. Pup Pass: subscribe.
    await a.click('button:has-text("Pup Pass")', { force: true }); await a.waitForTimeout(600);
    await a.click('button:has-text("Get the Pup Pass")', { force: true });
    check(/test mode/i.test(await a.innerText('.sheet')) && !/Demo — no card needed/.test(await a.innerText('.sheet')), 'pass sheet: real wording');
    await a.check('#pass-agree');
    await a.click('.sheet button:text-is("Continue to checkout")');
    const passItem = await payOnMockStripe(a);
    check(/Pup Pass — \$4\.99\/month/.test(passItem), 'Stripe page shows Pup Pass $4.99/month');
    check(await toast(a, /Pup Pass is active/), 'toast: Pup Pass is active');
    w = await wallet(a);
    check(w.pass.active && w.pass.autoRenew, 'wallet: pass active and renewing');
    // 5. Cancel through the customer portal.
    await closeIntroSheets(a);
    await a.click('button:has-text("Pup Pass")', { force: true }); await a.waitForTimeout(600);
    check(/Pup Pass active · Renews/.test(await text(a)), 'pass screen: active, renews');
    await a.click('button:text-is("Cancel Pup Pass")', { force: true });
    await Promise.all([a.waitForURL(/mock-stripe\/portal/), a.click('.sheet button:text-is("Continue to cancel")')]);
    await Promise.all([a.waitForURL(/\/play\/index\.html/), a.click('#cancel-sub')]);
    await closeIntroSheets(a); await a.waitForTimeout(1500);
    w = await wallet(a);
    check(w.pass.active && !w.pass.autoRenew, 'after cancel: pass stays until period end, no renewal');
    await a.click('button:has-text("Pup Pass")', { force: true }); await a.waitForTimeout(600);
    check(/Pup Pass active · Ends/.test(await text(a)), 'pass screen: active, ends');

    // 6. Starter Pack.
    await a.goto(GAME, { waitUntil: 'networkidle' }); await closeIntroSheets(a);
    await goShop(a);
    await a.click('.shop-row button:has-text("$1.99")', { force: true });
    await a.click('.sheet button:text-is("Continue to checkout")');
    await payOnMockStripe(a);
    check(await toast(a, /Starter Pack added/), 'toast: Starter Pack added');
    w = await wallet(a);
    check(w.starterPack.bought && w.inventory.costumes.includes('bandana') && w.inventory.boosters.bomb >= 1, 'wallet: Starter Pack items');

    // 7. Cancelled checkout.
    await closeIntroSheets(a);
    await goShop(a);
    await a.click('button.shop-item:has-text("55 Treats")', { force: true });
    await a.click('.sheet button:text-is("Continue to checkout")');
    await a.waitForURL(/mock-stripe\/checkout/);
    await Promise.all([a.waitForURL(/\/play\/index\.html/), a.click('#back')]);
    check(await toast(a, /Checkout cancelled/), "toast: Checkout cancelled. You weren't charged.");

    // 8. Spending limit ($25): spent 4.99 + 4.99 + 1.99 this month; a $19.99 pack would go over.
    await closeIntroSheets(a);
    await goShop(a);
    await a.click('button.chip:has-text("$25.00")', { force: true }); await a.waitForTimeout(500);
    await a.click('button.shop-item:has-text("480 Treats")', { force: true });
    check(await toast(a, /over your monthly limit of \$25\.00/), 'spending limit blocks a purchase over it');

    // 9. Refund issued in Stripe: Treats come back off.
    await fetch(`${base}/mock/refund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, product: 'pack100' }) });
    const before = (await wallet(a)).treats;
    await a.goto(GAME, { waitUntil: 'networkidle' }); await closeIntroSheets(a);
    check(await toast(a, /Refund processed: 100 Treats removed/, 10000), 'toast: refund processed');
    const after = (await wallet(a)).treats;
    check(before.paid - after.paid === 100, 'wallet: 100 paid Treats removed', `${before.paid} -> ${after.paid}`);

    // 10. Report a problem, and a refund request from the spending list.
    await openMenu(a);
    await a.click('.sheet button:text-is("Report a problem")');
    await a.fill('#report-text', 'The bone bomb did not explode.');
    await a.click('.sheet button:text-is("Send")');
    check(await toast(a, /Sent to PAWtastic/), 'report a problem: sent');
    await goShop(a);
    await a.click('button:text-is("Request refund")', { force: true });
    await a.click('.sheet button:text-is("Send")');
    check(await toast(a, /Sent to PAWtastic/), 'refund request: sent');
    s = await state();
    check(s.reports.some(r => r.kind === 'problem' && /bone bomb/.test(r.message) && r.email === EMAIL), 'server: problem report with reply email');
    check(s.reports.some(r => r.kind === 'refund' && r.details?.purchase), 'server: refund request names the purchase');

    // 11. Rules page has the purchase terms.
    await openMenu(a);
    await a.click('.sheet button:text-is("Game rules & privacy")');
    const rules = await a.innerText('section.rules');
    check(/renews automatically until you cancel/.test(rules) && /refunded within 7 days/.test(rules) && /\$100 a month/.test(rules), 'rules page: purchase terms');

    // 12. Sign out.
    await openMenu(a);
    await Promise.all([a.waitForNavigation({ waitUntil: 'networkidle' }), a.click('.sheet button:text-is("Sign out")')]);
    await closeIntroSheets(a);
    await openMenu(a);
    check(/Sign in to restore purchases/.test(await a.innerText('.sheet')), 'signed out: menu offers sign-in');
  }

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
