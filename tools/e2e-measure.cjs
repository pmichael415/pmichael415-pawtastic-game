// Measurement and the shop's purchase states, end to end in Chromium against tools/mock-pay-server.mjs.
//   node tools/mock-pay-server.mjs dist 8790 &   then   node tools/e2e-measure.cjs http://127.0.0.1:8790
// Checks: events reach the server by device id only (never a name, email or pup), each "once" event is
// stored once, the Shop labels what kind of purchase each thing is, "So close!" leads with a free restart,
// and the Shop's purchases card shows Restore / receipts.
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8790';
const GAME = `${base}/play/index.html`;
const KEY = 'pawtastic-gd-wallet-v1';
const results = [];
const check = (ok, label, extra = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
const state = async () => (await fetch(`${base}/mock/state`)).json();
const text = page => page.evaluate(() => document.body.innerText);

async function closeIntroSheets(page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
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
const settle = page => page.waitForTimeout(1300); // past the 800 ms event batch

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // Growth (owner, 10 Nov 2026): a browser driven by automation is never counted. Playwright's is (navigator.webdriver),
  // so first prove it sends nothing, then play the rest as a normal phone (webdriver false), which is what is measured.
  const botCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const bot = await botCtx.newPage();
  const beforeBot = await state();
  await enroll(bot, 'Robo');
  await settle(bot);
  const afterBot = await state();
  check(afterBot.events.length === beforeBot.events.length && afterBot.devices.length === beforeBot.devices.length, 'an automated browser sends no events and is not counted as a player');
  await botCtx.close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));

  const before = (await state()).events.length;
  await enroll(page, 'Biscuit');
  await settle(page);
  let ev = (await state()).events.slice(before);
  check(ev.some(e => e.name === 'opened'), 'opening the game is measured');

  const device = ev[0]?.device;
  const counter = (await state()).devices.find(d => d.device === device);
  check(device && counter, 'events use the same anonymous device id as the player counter', device);
  const leak = JSON.stringify(ev).match(/Biscuit|@|pup|dog/i);
  check(!leak, 'no name, pup or email travels with events', leak ? leak[0] : '');
  check(ev.every(e => e.props && e.props.where === 'site'), 'events say where the game runs (site)');

  // Shop: kinds and the purchases card.
  await page.click('button:has-text("Shop")', { force: true });
  await page.waitForTimeout(700);
  const shop = await text(page);
  check(/CONSUMABLE/.test(shop) && /ONE-TIME/.test(shop) && /SUBSCRIPTION/.test(shop), 'shop labels consumable, one-time and subscription purchases');
  check(/Your purchases/.test(shop) && /Restore purchases/.test(shop) && /Receipts & Pup Pass/.test(shop), 'shop has a purchases card with Restore and receipts');
  check(/Starter Pack: not bought/.test(shop) && /Pup Pass: not active/.test(shop), 'purchases card shows what is owned');
  check(!/on its way/.test(shop), 'no pending-delivery banner without a checkout');
  await page.click('section[aria-label="Treat packs"] button.shop-item:has-text("100 Treats")', { force: true });
  await page.waitForTimeout(500);
  const sheet = await page.$eval('.sheet', el => el.innerText).catch(() => '');
  check(/Consumable/.test(sheet) && /100 Treats/.test(sheet), 'confirm sheet names the kind of purchase', sheet.replace(/\s+/g, ' ').slice(0, 120));
  await page.click('.sheet button:text-is("Not now")', { force: true }).catch(() => page.keyboard.press('Escape'));
  await settle(page);
  ev = (await state()).events.slice(before);
  check(ev.some(e => e.name === 'shop_viewed'), 'shop visit is measured');
  check(ev.some(e => e.name === 'product_previewed' && e.props.product === 'pack100'), 'previewing a pack is measured');

  // Restore with nothing bought says so, and nothing changes.
  const restored = page.waitForSelector('.sheet', { timeout: 4000 }).catch(() => null);
  await page.click('button:has-text("Restore purchases")', { force: true });
  await restored;
  const afterRestore = await page.evaluate(() => Array.from(document.querySelectorAll('.sheet, .toast')).map(e => e.innerText).join(' | '));
  check(/sign in|Sign in|already here/i.test(afterRestore), 'restore when signed out asks to sign in (or confirms nothing is missing)', afterRestore.replace(/\s+/g, ' ').slice(0, 100));
  for (const sel of ['.sheet button:text-is("Not now")', '.sheet button:text-is("Cancel")', '.sheet button[aria-label="Close"]']) await page.click(sel, { force: true }).catch(() => null);
  await page.keyboard.press('Escape').catch(() => null);

  // Same day, second opening: 'opened' is stored once per device per day.
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await settle(page);
  ev = (await state()).events.slice(before);
  check(ev.filter(e => e.name === 'opened').length === 1, '"opened" is kept once a day per device', String(ev.filter(e => e.name === 'opened').length));

  // Playing: first start is measured once; "So close!" leads with a free Try again.
  await page.goto(`${GAME}?debug=1&screen=level&level=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await settle(page);
  ev = (await state()).events.slice(before);
  check(ev.filter(e => e.name === 'first_play_started').length === 1, 'the first level start is measured once');
  const w = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  if (w?.activeLevel?.snapshot) {
    Object.assign(w.activeLevel.snapshot, { movesLeft: 0, status: 'lost' });
    w.treats = { free: 0, converted: 0, paid: 0 };
    await page.goto(`${base}/mock/state`);
    await page.goto(GAME, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(w)]);
    await page.goto(GAME, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.click('button:has-text("Continue Level")', { force: true });
    await page.waitForSelector('.sheet h2:text-is("So close!")', { timeout: 8000 });
    const buttons = await page.$$eval('.sheet button', els => els.map(e => e.innerText.trim()));
    check(buttons[0] === 'Try again', '"So close!" leads with a free Try again', buttons.join(' / '));
    check(!buttons.slice(0, 2).some(b => /\$/.test(b)), 'no price among the first two choices', buttons.join(' / '));
    const first = await page.$eval('.sheet button:text-is("Try again")', el => el.className);
    const pay = await page.$eval('.sheet button:has-text("$")', el => el.className).catch(() => '');
    check(/\bbtn\b/.test(first) && !/secondary/.test(first) && /secondary/.test(pay), 'the paid option is styled as secondary');
    await page.click('.sheet button:text-is("Try again")', { force: true });
    await page.waitForTimeout(1500);
    const after = await text(page);
    check(!(await page.$('.sheet h2:text-is("So close!")')) && !/Level not passed/.test(after), 'Try again restarts the level with no store sheet in the way', after.replace(/\s+/g, ' ').slice(0, 80));
    const w2 = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    check(w2.lives.count === 3 && w2.activeLevel?.levelId === 1, 'the restart used one life, like any start, and level 1 is active again', `lives ${w2.lives.count}`);
  } else {
    check(false, 'level 1 saved a board to lose');
  }

  // Where the device came from rides on "opened" (a tagged link: the front-desk poster).
  const tagged = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await tagged.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  const poster = await tagged.newPage();
  const beforePoster = (await state()).events.length;
  await poster.goto(`${GAME}?utm_source=frontdesk&utm_medium=qr&utm_campaign=season1&utm_content=hawthorne`, { waitUntil: 'networkidle' });
  await poster.fill('input[type=text]', 'Pixel');
  await poster.click('text=Start school');
  await settle(poster);
  const opened = (await state()).events.slice(beforePoster).find(e => e.name === 'opened');
  check(opened?.props?.src_s === 'frontdesk' && opened.props.src_m === 'qr' && opened.props.src_t === 'hawthorne', 'the first source (a front-desk poster) rides on "opened"', JSON.stringify(opened?.props));
  await tagged.close();

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
