// "So close!" (out of moves) purchases, end to end in Chromium against tools/mock-pay-server.mjs.
//   node tools/mock-pay-server.mjs dist 8790 &   then   node tools/e2e-out-of-moves.cjs http://127.0.0.1:8790 [main|off]
// main: payments on — buying Treats from "So close!" must go through Stripe Checkout (never a demo grant),
//       and the player must be able to finish the same level afterwards.
// off:  server started with MOCK_PAYMENTS=0 — no dollar prices anywhere on "So close!".
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8790';
const suite = process.argv[3] || 'main';
const GAME = `${base}/play/index.html`;
const KEY = 'pawtastic-gd-wallet-v1';
const RUN = Date.now().toString(36);
const results = [];
const check = (ok, label, extra = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };

const readWallet = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const treats = w => w.treats.free + w.treats.converted + w.treats.paid;
const sheetText = page => page.$$eval('.sheet', els => els.map(e => e.innerText).join(' | ')).catch(() => '');
async function toast(page, re, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await page.$eval('.toast', el => el.innerText).catch(() => '');
    if (re.test(t)) return t;
    await page.waitForTimeout(150);
  }
  return null;
}
async function closeIntroSheets(page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
    const b = await page.$('.sheet button:text-is("Collect"), .sheet button:text-is("Let\'s go"), .sheet button:text-is("OK")');
    if (!b) return;
    await b.click({ force: true });
  }
}

// Plays into level 1, then saves the board as lost (0 moves left) with `n` Treats, the way the game
// saves it when "So close!" opens, and reopens the game at the map.
async function outOfMovesSave(page, n) {
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', 'Biscuit');
  await page.click('text=Start school');
  await closeIntroSheets(page);
  const w = await readWallet(page);
  w.inventory.boosters.shuffle = 1; // a shuffle saves the board, like a move does
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(w)]);
  await page.goto(`${GAME}?debug=1&screen=level&level=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button[aria-label^="Shuffle"]', { force: true });
  await page.waitForTimeout(1000);
  const lost = await readWallet(page);
  Object.assign(lost.activeLevel.snapshot, { movesLeft: 0, status: 'lost' });
  lost.treats = { free: n, converted: 0, paid: 0 };
  await page.goto(`${base}/mock/state`); // leave the game so it can't save over the edit
  await page.goto(GAME, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(lost)]);
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
}
async function continueLevel(page) {
  await page.click('button:has-text("Continue Level")', { force: true });
  await page.waitForSelector('.sheet h2:text-is("So close!")', { timeout: 8000 });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };

  if (suite === 'main') {
    const page = await newPage();
    await outOfMovesSave(page, 0);
    check(await page.$('button:has-text("Continue Level 1")'), 'the lost board is offered as "Continue Level 1"');
    await continueLevel(page);
    const buy = await page.$('.sheet button:has-text("Get 55 Treats for $2.99")');
    check(buy, '"So close!" with 0 Treats offers 55 Treats for $2.99');
    await buy.click({ force: true });
    await page.waitForTimeout(500);
    let sheets = await sheetText(page);
    check(!/demo — no real charge/i.test(sheets), 'the confirmation is not the demo sheet', sheets.slice(0, 160));
    check(/test mode — no real charge/i.test(sheets) && /Continue to checkout/.test(sheets), 'it is the real (test-mode) checkout confirmation');
    await page.click('.sheet button:has-text("Continue to checkout")', { force: true }).catch(() => {});
    await page.waitForTimeout(500);
    check(treats(await readWallet(page)) === 0, 'no Treats are added before paying');
    // Not signed in yet: sign in, the page reloads, and checkout carries on by itself.
    await page.waitForSelector('#signin-email', { timeout: 8000 });
    await page.fill('#signin-email', `stuck-${RUN}@example.com`);
    await page.click('.sheet button:text-is("Email me a code")');
    await page.waitForSelector('#signin-code');
    await page.fill('#signin-code', '123456');
    await page.click('.sheet button:text-is("Sign in")');
    await page.waitForURL(/\/mock-stripe\/checkout\//, { timeout: 15000 });
    const item = await page.innerText('body');
    check(/55 Treats/.test(item) && /2\.99/.test(item), 'Stripe Checkout opens for 55 Treats, $2.99', item.replace(/\s+/g, ' ').slice(0, 80));
    const before = await (await fetch(`${base}/mock/state`)).json();
    await Promise.all([page.waitForURL(/\/play\/index\.html/, { timeout: 15000 }), page.click('#pay')]);
    check(await toast(page, /Treats|added|thank/i), 'back in the game, the purchase is confirmed');
    await page.waitForTimeout(1500);
    const after = await (await fetch(`${base}/mock/state`)).json();
    check(after.purchases.length === before.purchases.length + 1 && after.purchases.at(-1).product === 'pack55', 'the server recorded exactly one pack55 purchase');
    let w = await readWallet(page);
    check(treats(w) === 55, 'the 55 Treats arrive from the server', `treats ${treats(w)}`);
    // The same level is still waiting at "So close!", now affordable.
    await continueLevel(page);
    const moves = await page.$('.sheet button:has-text("+5 moves")');
    check(moves, '"So close!" now offers +5 moves');
    // A finger tap right away, while the "Treats added" message is still showing: messages must
    // never swallow taps meant for the buttons under them.
    check(await page.$('.toast'), 'the "Treats added" message is still showing when the player taps');
    const box = await moves.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
    w = await readWallet(page);
    check(!(await page.$('.sheet h2:text-is("So close!")')) && treats(w) === 35, '+5 moves is bought with 20 Treats and play continues', `treats ${treats(w)}`);
    check(w.activeLevel?.snapshot?.movesLeft === 5 && w.activeLevel.snapshot.status === 'playing', 'the board has 5 moves and is playing again');

    // Backing out of Stripe charges nothing and adds nothing.
    const p2 = await newPage();
    await outOfMovesSave(p2, 0);
    await continueLevel(p2);
    await p2.click('.sheet button:has-text("Get 55 Treats")', { force: true });
    await p2.waitForTimeout(400);
    await p2.click('.sheet button:has-text("Continue to checkout")', { force: true });
    await p2.waitForSelector('#signin-email', { timeout: 8000 });
    await p2.fill('#signin-email', `backout-${RUN}@example.com`);
    await p2.click('.sheet button:text-is("Email me a code")');
    await p2.waitForSelector('#signin-code');
    await p2.fill('#signin-code', '123456');
    await p2.click('.sheet button:text-is("Sign in")');
    await p2.waitForURL(/\/mock-stripe\/checkout\//, { timeout: 15000 });
    await Promise.all([p2.waitForURL(/\/play\/index\.html/, { timeout: 15000 }), p2.click('#back')]);
    check(await toast(p2, /cancelled/i), 'backing out of Stripe says nothing was charged');
    await p2.waitForTimeout(800);
    check(treats(await readWallet(p2)) === 0, '…and adds no Treats');
  } else {
    const page = await newPage();
    await outOfMovesSave(page, 0);
    await continueLevel(page);
    const sheets = await sheetText(page);
    check(!/\$\d/.test(sheets), 'with payments off, "So close!" shows no dollar prices', sheets.slice(0, 160));
    check(/No thanks/.test(sheets), '"No thanks" is always there');
  }

  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
