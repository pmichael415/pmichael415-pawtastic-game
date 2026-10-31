// End-to-end QA: three games combined in one hub + Share / referrals (iPhone 13 profile, touch).
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-tycoon-save-v1';
let pass = 0, fail = 0; const out = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const save = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
  async function fresh(path, setup = {}) {
    await page.goto(BASE + '/help');
    await page.evaluate((s) => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true })); }, setup);
    await page.waitForTimeout(300);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
  }

  // Three games, one hub
  await fresh('/');
  for (const t of ['Daycare Tycoon', 'Recess Rush', 'Graduation Day']) check(`hub shows ${t}`, await page.getByRole('heading', { name: t, exact: true }).isVisible());
  const nav = await page.locator('nav[aria-label="Game tabs"] a').allInnerTexts();
  check('bottom navigation reaches all three games', nav.join('|') === 'Home|Daycare|Recess Rush|Graduation|Shop', nav.join('|'));
  await page.getByRole('link', { name: /Play Graduation Day/ }).tap();
  await page.waitForURL(/\/graduation/);
  const frame = page.frameLocator('iframe[title="Graduation Day match-3 game"]');
  await frame.getByText(/ENROLL YOUR PUP|Tap to start|GRADUATION DAY/i).first().waitFor({ timeout: 15000 });
  check('Graduation Day runs inside the hub', true);
  check('Graduation Day screen has the shared back-to-hub button', await page.getByRole('link', { name: 'Back to PAWtastic Games home' }).isVisible());
  const fb = await page.locator('iframe[title="Graduation Day match-3 game"]').boundingBox();
  const vh = page.viewportSize().height;
  check('the game fills the screen above the bottom navigation', fb && fb.height > 420 && fb.y + fb.height <= vh - 60, JSON.stringify(fb));

  // Graduation progress → shared achievements & daycare bandana (no coin conversion)
  const levels = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), { stars: 2, score: 500 }]));
  await fresh('/', { 'pawtastic-gd-wallet-v1': JSON.stringify({ progress: { unlocked: 9, levels, badges: [] }, dog: { name: 'Nugget' } }) });
  check('hub shows Graduation Day progress', await page.getByText('8/40').isVisible() && await page.getByText(/Nugget is on level 9 · 16★/).isVisible());
  let s = await save();
  check('finishing Orientation unlocks the Honor Roll Bandana for daycare pups', s.cosmetics.includes('bandana-honor'), JSON.stringify(s.cosmetics));
  check('…and the shared Honor Roll achievement', s.achievements.includes('honor'));
  check('no coins were converted between games', s.coins === 500, `coins=${s.coins}`);

  // Share button on every screen
  for (const p of ['/', '/daycare', '/recess', '/graduation', '/shop', '/visit', '/help', '/account']) {
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    const b = await page.getByRole('button', { name: 'Share and invite friends' }).boundingBox().catch(() => null);
    check(`Share button on ${p}`, !!b && b.width >= 44 && b.height >= 44 && b.y < 120, JSON.stringify(b));
  }

  // Share sheet on the daycare: invite link, copy, this-screen share, recommend PAWtastic
  await fresh('/daycare');
  await page.getByRole('button', { name: 'Share and invite friends' }).tap();
  const input = page.getByRole('textbox', { name: 'Your invite link' });
  await input.waitFor();
  const link = await input.inputValue();
  const u = new URL(link);
  const code = u.searchParams.get('ref');
  check('invite link has a personal code and campaign tags', /^[A-HJ-NP-Z2-9]{8}$/.test(code || '') && u.searchParams.get('utm_source') === 'referral' && u.searchParams.get('utm_content') === 'daycare', link);
  check('the code stays the same for this player', code === await page.evaluate(() => localStorage.getItem('pawtastic-ref-code')));
  await page.getByRole('button', { name: 'Copy invite link' }).tap();
  await page.waitForTimeout(300);
  check('Copy puts the invite link on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === link);
  check('the daycare adds "Share my daycare card"', await page.getByRole('button', { name: /Share my daycare card/ }).isVisible());
  check('friend counts degrade gracefully when the server is unreachable', await page.getByTestId('referral-stats').innerText().then((t) => /aren't available|Checking/.test(t)));
  await page.evaluate(() => { navigator.share = undefined; });
  await page.getByRole('button', { name: 'Hawthorne' }).tap();
  await page.waitForTimeout(300);
  const rec = await page.evaluate(() => navigator.clipboard.readText());
  check('"Recommend PAWtastic" shares the real Hawthorne evaluation form, tagged with the code', rec.includes('https://pawtasticacademy.com/booking-page-ht?') && rec.includes(`utm_term=${code}`) && /daycare, boarding and baths/.test(rec) && !/\$|%\s*off|discount/i.test(rec), rec.slice(0, 160));

  // Rewards when friends finish their first day (server response simulated)
  await page.route('**/api/public/referrals**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ joined: 3, completed: 2 }) }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const before = (await save()).coins;
  await page.getByRole('button', { name: 'Share and invite friends' }).tap();
  await page.getByTestId('referral-stats').filter({ hasText: '3 friends joined' }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  s = await save();
  check('2 friends who finished their first day pay +200 coins and the Best Buddy Bandana', s.coins - before === 200 && s.cosmetics.includes('bandana-buddy') && s.referralsRewarded === 2, `coins ${before}→${s.coins}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Share and invite friends' }).tap();
  await page.waitForTimeout(800);
  check('the same friends never pay twice', (await save()).coins === s.coins);
  await page.screenshot({ path: 'qa/out/share-sheet.png' });

  // A friend arriving through the link
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'] });
  const friend = await ctx2.newPage();
  await friend.goto(`${BASE}/?ref=${code}&utm_source=referral`, { waitUntil: 'domcontentloaded' });
  await friend.waitForFunction(() => (window.__pawtasticEvents || []).some((e) => e.name === 'session_start'), null, { timeout: 15000 }).catch(() => {});
  const ev = await friend.evaluate(() => ({ by: localStorage.getItem('pawtastic-referred-by'), events: (window.__pawtasticEvents || []).map((e) => ({ n: e.name, p: e.props })) }));
  check("a friend's device remembers who invited them", ev.by === code);
  check("the friend's first session is tagged for counting", ev.events.some((e) => e.n === 'referral_open' && e.p.ref === code) && ev.events.some((e) => e.n === 'session_start' && e.p.ref === code && e.p.first_visit === true), JSON.stringify(ev.events.slice(0, 3)));
  await ctx2.close();
  // own link never counts
  await page.goto(`${BASE}/?ref=${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  check('opening your own link never counts as a referral', (await page.evaluate(() => localStorage.getItem('pawtastic-referred-by'))) === null);

  // Daycare header layout after adding Share
  await fresh('/daycare');
  const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, coins: !!document.querySelector('[aria-label$=" coins"]') }));
  check('daycare: no sideways overflow with Share in the header; coins in the clock bar', layout.overflow <= 0 && layout.coins, JSON.stringify(layout));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(2); });
