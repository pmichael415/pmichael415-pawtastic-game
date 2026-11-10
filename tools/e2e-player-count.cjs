// Player counter end to end in Chromium against tools/mock-pay-server.mjs.
//   node tools/mock-pay-server.mjs dist 8795 &                      then  node tools/e2e-player-count.cjs http://127.0.0.1:8795
//   MOCK_HELLO_FAIL=1 node tools/mock-pay-server.mjs dist 8796 &    then  node tools/e2e-player-count.cjs http://127.0.0.1:8796 fail
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8795';
const suite = process.argv[3] || 'main';
const GAME = `${base}/play/index.html`;
const results = [];
const check = (ok, label, extra = '') => { results.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
const state = async () => (await fetch(`${base}/mock/state`)).json();

async function closeSheets(page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
    const b = await page.$(['Collect', "Let's go", 'OK', 'Yay!', 'Play the game', 'Keep playing here'].map(n => `.sheet button:text-is("${n}")`).join(', '));
    if (!b) return;
    await b.click({ force: true });
  }
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // Growth (owner, 10 Nov 2026): automated browsers are never counted. Prove it, then count as a normal phone.
  const botCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const devicesBefore = (await (await fetch(`${process.argv[2] || 'http://127.0.0.1:8790'}/mock/state`)).json()).devices.length;
  const bot = await botCtx.newPage();
  await bot.goto(`${process.argv[2] || 'http://127.0.0.1:8790'}/play/index.html`, { waitUntil: 'networkidle' });
  await bot.waitForTimeout(1200);
  const devicesAfter = (await (await fetch(`${process.argv[2] || 'http://127.0.0.1:8790'}/mock/state`)).json()).devices.length;
  check(devicesAfter === devicesBefore, 'an automated browser does not say hello (never counted as a player)', `${devicesBefore} → ${devicesAfter}`);
  await botCtx.close();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const hellos = [];
  page.on('request', r => { if (r.url().endsWith('/api/public/game/hello')) hellos.push(r.postData()); });

  await page.goto(GAME, { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', 'Biscuit');
  await page.click('text=Start school');
  await page.waitForTimeout(1200);
  await closeSheets(page);
  check(await page.$('.map-nav, .node'), 'the game opens to the map');

  if (suite === 'fail') {
    check(hellos.length === 1, 'the hello is sent', String(hellos.length));
    check((await state()).devices.length === 0, 'the server failed it, and nothing was counted');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-device-v1')));
    check(saved?.id && saved.sent === null, 'a failed hello is not marked as sent, so it is tried again next time');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check(hellos.length === 2, 'reopening tries again', String(hellos.length));
    await page.click('body');
    await closeSheets(page);
    await page.click('.node.current', { force: true, timeout: 8000 });
    await page.waitForSelector('.level-title', { timeout: 8000 }).catch(() => {});
    check(await page.$('.level-title'), 'with the counter failing, a level still opens and plays');
  } else {
    const s1 = await state();
    check(s1.devices.length === 1, 'opening the game counts this browser once', String(s1.devices.length));
    const body = JSON.parse(hellos[0] ?? '{}');
    check(Object.keys(body).join() === 'device' && /^[A-Za-z0-9_-]{16,64}$/.test(body.device), 'the hello holds only a random id', hellos[0]);
    check(!/Biscuit/.test(hellos[0] ?? ''), 'the dog name is not sent');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check(hellos.length === 1 && (await state()).devices.length === 1, 'reopening the same day sends nothing more', String(hellos.length));
    // Sign in, then check the hello still carries no sign-in.
    await page.click('body');
    await closeSheets(page);
    await page.click('button[aria-label="Sound and effects"]', { force: true });
    await page.waitForTimeout(300);
    await page.click('.sheet button:text-is("Save progress to the cloud")');
    await page.fill('#signin-email', 'counter@example.com');
    await page.click('.sheet button:text-is("Email me a code")');
    await page.fill('#signin-code', '123456');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.click('.sheet button:text-is("Sign in")')]);
    await page.waitForTimeout(1000);
    // A new day: the saved "sent" day is moved back, as if the phone was opened tomorrow.
    await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('pawtastic-gd-device-v1')); v.sent = '2000-01-01'; localStorage.setItem('pawtastic-gd-device-v1', JSON.stringify(v)); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    check(hellos.length === 2 && JSON.parse(hellos[1]).device === body.device, 'the next day the same id says hello again', String(hellos.length));
    const s2 = await state();
    check(s2.devices.every(d => !d.auth && !d.cookie), 'the hello never carries a sign-in or cookie, even when signed in');
    await page.click('body');
    await closeSheets(page);
    await page.click('button[aria-label="Sound and effects"]', { force: true });
    await page.waitForTimeout(300);
    await page.click('.sheet button:text-is("Game rules & privacy")');
    await page.waitForTimeout(500);
    check(/counts how many phones and computers open it each day/.test(await page.innerText('body')), 'the privacy section explains the counter');
  }

  check(errors.length === 0, 'no page errors', errors.join(' / '));
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
