// End-to-end test of Invite a friend against tools/mock-pay-server.mjs, in Chromium (Playwright).
//   npm run -s build:single && npm run -s build:staff
//   node tools/mock-pay-server.mjs dist 8791 &   then   node tools/e2e-referral.cjs http://127.0.0.1:8791

const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8791';
const GAME = `${base}/play/index.html`;
const STAFF = `${base}/staff/index.html`;
const results = [];
const check = (ok, label, extra = '') => { results.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
const state = async () => (await fetch(`${base}/mock/state`)).json();
const text = page => page.innerText('body');

async function closeIntroSheets(page, { keepOffer = false } = {}) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    const b = await page.$(`.sheet button:text-is("Collect"), .sheet button:text-is("Let's go"), .sheet button:text-is("OK"), .sheet button:text-is("Yay!")${keepOffer ? '' : ', .sheet button:text-is("Play the game")'}`);
    if (!b) return;
    await b.click({ force: true });
  }
}
async function enroll(page, name, url = GAME) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', name);
  await page.click('text=Start school');
  await page.waitForTimeout(800);
}
async function gameSignIn(page, email) {
  await page.waitForSelector('#signin-email');
  await page.fill('#signin-email', email);
  await page.click('.sheet button:text-is("Email me a code")');
  await page.waitForSelector('#signin-code');
  await page.fill('#signin-code', '123456');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.click('.sheet button:text-is("Sign in")')]);
}
async function staffSignIn(page, email) {
  await page.goto(STAFF, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.click('button:text-is("Email me a sign-in code")');
  await page.waitForSelector('#code');
  await page.fill('#code', '123456');
  await page.click('button:text-is("Sign in")');
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };

  // 1. A player gets a friend code: Invite friends → save progress (sign in) → the invite opens with the code.
  const sharer = await newPage();
  await enroll(sharer, 'Biscuit');
  await closeIntroSheets(sharer);
  check(await sharer.$('button:text-is("Invite friends")'), 'map has an Invite friends button');
  await sharer.click('button:text-is("Invite friends")', { force: true });
  await sharer.waitForTimeout(500);
  const pitch = await sharer.innerText('.sheet');
  check(/Give \$10 off\. Get a free bath/.test(pitch) && /save your progress/i.test(pitch), 'signed out: invite explains the offer and asks to save progress', pitch.replace(/\n/g, ' | ').slice(0, 160));
  await sharer.click('.sheet button:text-is("Save progress & get my code")');
  await gameSignIn(sharer, 'sharer@example.com');
  await closeIntroSheets(sharer);
  await sharer.waitForSelector('.sheet .friend-code', { timeout: 8000 }).catch(() => {});
  const code = (await sharer.$eval('.sheet .friend-code', el => el.textContent).catch(() => '')).trim();
  check(/^[A-HJ-NP-Z2-9]{6}$/.test(code), 'after sign-in the invite reopens with a 6-character friend code', code);
  check(await sharer.$('.sheet button:text-is("Share my invite")'), 'invite has a Share my invite button');
  const s1 = await state();
  check(Object.values(s1.codes).some(c => c.code === code && c.email === 'sharer@example.com'), 'server keeps the code for the signed-in player');
  await sharer.click('.sheet button:text-is("Done")');

  // 2. A friend opens the invite link: the address is tidied and the $10 off offer shows with the code.
  const friend = await newPage();
  await enroll(friend, 'Max', `${GAME}?ref=${code.toLowerCase()}`);
  check(!/ref=/.test(friend.url()), 'invite link: the ?ref= code is removed from the address', friend.url());
  // The offer waits for the daily rewards and the area intro to close, so sheets never stack.
  await closeIntroSheets(friend, { keepOffer: true });
  check((await friend.$$('.sheet')).length <= 1, 'friend offer never stacks on another sheet');
  await friend.waitForSelector('.sheet .friend-code', { timeout: 10000 }).catch(() => {});
  const offer = await friend.innerText('.sheet').catch(() => '');
  check(/\$10 off your first PAWtastic visit/.test(offer) && offer.includes(code), 'friend sees the $10 off offer with the code', offer.replace(/\n/g, ' | ').slice(0, 160));
  await closeIntroSheets(friend);
  check(/Friend offer: \$10 off/.test(await text(friend)), 'friend\'s map shows the friend offer banner');
  await friend.click('button[aria-label="Sound and effects"]', { force: true });
  await friend.waitForTimeout(300);
  check(/My \$10 off code/.test(await friend.innerText('.sheet')), 'friend\'s menu keeps the code (My $10 off code)');
  await friend.click('.sheet button:text-is("Done")');

  // 3. A player's own link, and an unknown code, show no offer.
  await sharer.goto(`${GAME}?ref=${code}`, { waitUntil: 'networkidle' });
  await closeIntroSheets(sharer);
  await sharer.waitForTimeout(1500);
  check(!/Friend offer/.test(await text(sharer)) && !(await sharer.evaluate(() => localStorage.getItem('pawtastic-gd-ref-v1'))), 'own code: no friend offer');
  const stranger = await newPage();
  await enroll(stranger, 'Rex', `${GAME}?ref=ZZZZZZ`);
  await closeIntroSheets(stranger);
  await stranger.waitForTimeout(1200);
  check(!/Friend offer/.test(await text(stranger)), 'unknown code: no friend offer');

  // 4. The staff page: only staff emails get in.
  const desk = await newPage();
  desk.on('dialog', d => d.accept());
  await staffSignIn(desk, 'someone@example.com');
  check(/isn't on the PAWtastic staff list/.test(await text(desk)), 'staff page refuses a non-staff email');
  await desk.click('button:text-is("Sign out")');
  await desk.waitForTimeout(500);
  await staffSignIn(desk, 'info@pawtasticacademy.com');
  check(/Look up a friend code/.test(await text(desk)), 'staff email signs in to the referral desk');
  await desk.fill('#lookup', 'QQQQQQ');
  await desk.click('button:text-is("Look up")');
  await desk.waitForTimeout(500);
  check(/doesn't match any player/.test(await text(desk)), 'staff: unknown code is reported');
  await desk.fill('#lookup', `${code.slice(0, 3)}-${code.slice(3).toLowerCase()}`);
  await desk.click('button:text-is("Look up")');
  await desk.waitForSelector('#friend');
  check((await text(desk)).includes('sharer@example.com'), 'staff: code shows the player who shared it (typed with a dash, lower case)');
  await desk.fill('#friend', 'Ana Diaz');
  await desk.fill('#dog', 'Max');
  await desk.selectOption('#where', 'hawthorne');
  await desk.click('button:has-text("Record first visit")');
  await desk.waitForTimeout(700);
  check(/Free baths waiting: 1/.test(await text(desk)) && /Recorded\. The player now has a free bath waiting/.test(await text(desk)), 'staff: recording a first visit earns the player a free bath');
  // The same new client again: the page asks first (the dialog is dismissed), so nothing is added.
  desk.removeAllListeners('dialog');
  desk.once('dialog', d => d.dismiss());
  await desk.fill('#friend', 'ana diaz');
  await desk.fill('#dog', 'max');
  await desk.click('button:has-text("Record first visit")');
  await desk.waitForTimeout(700);
  check((await state()).referrals.length === 1 && /already recorded/.test(await text(desk)), 'staff: the same new client is not recorded twice');

  // 5. The player hears about the free bath next time they open the game.
  await sharer.goto(GAME, { waitUntil: 'networkidle' });
  await sharer.waitForSelector('.sheet:has-text("earned a free bath")', { timeout: 15000 }).catch(() => {});
  const news = await sharer.innerText('.sheet').catch(() => '');
  check(/Biscuit earned a free bath!/.test(news) && news.includes(code), 'player is told their dog earned a free bath', news.replace(/\n/g, ' | ').slice(0, 140));
  await closeIntroSheets(sharer);
  await sharer.click('button:text-is("Invite friends")', { force: true });
  await sharer.waitForSelector('.sheet .bath-card', { timeout: 8000 }).catch(() => {});
  check(/1 free bath waiting for Biscuit/.test(await sharer.innerText('.sheet').catch(() => '')), 'invite shows 1 free bath waiting');
  await sharer.click('.sheet button:text-is("Done")');
  await sharer.reload({ waitUntil: 'networkidle' });
  await sharer.waitForTimeout(2500);
  check(!/earned a free bath/.test(await text(sharer)), 'the free bath news shows only once');

  // 6. The front desk gives the bath.
  desk.removeAllListeners('dialog');
  desk.on('dialog', d => d.accept());
  await desk.click('button:text-is("Bath given")');
  await desk.waitForTimeout(700);
  check(/Free baths waiting: 0 · Given: 1/.test(await text(desk)), 'staff: bath marked as given');
  check((await state()).referrals[0].status === 'bath-given', 'server records the bath as given');
  await desk.reload({ waitUntil: 'networkidle' });
  await desk.waitForTimeout(600);
  check(/Ana Diaz/.test(await text(desk)) && /Bath given/.test(await text(desk)), 'staff: recent list shows the referral after a reload (still signed in)');
  await sharer.click('button:text-is("Invite friends")', { force: true });
  await sharer.waitForTimeout(800);
  const after = await sharer.innerText('.sheet').catch(() => '');
  check(/Friends who visited: 1 · Free baths given: 1/.test(after) && !/waiting/.test(after), 'invite shows the bath as given', after.replace(/\n/g, ' | ').slice(0, 200));
  await sharer.click('.sheet button:text-is("Done")');

  // 7. The rules page explains the offer.
  await sharer.click('button[aria-label="Sound and effects"]', { force: true });
  await sharer.waitForTimeout(300);
  await sharer.click('.sheet button:text-is("Game rules & privacy")');
  await sharer.waitForTimeout(500);
  check(/Invite friends/.test(await text(sharer)) && /may change or end this offer/.test(await text(sharer)), 'rules page has the Invite friends terms');

  check(errors.length === 0, 'no page errors', errors.join(' / '));
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
