// Screenshots of every main screen of PAWtastic Games at iPhone size, for the overview sheet.
//   node qa/overview-shots.cjs [base]   → qa/out/overview/*.png
const { chromium, devices } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = 'qa/out/overview';
fs.mkdirSync(OUT, { recursive: true });
const nyDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const st = { admitted: 30, baths: 12, plays: 40, earned: 3000, checkouts: 25, cleans: 5, boarders: 3, shares: 1, runs: 2, scuffles: 0 };
const dog = (id, name, breed, size, temper, place, extra = {}) => ({ id, name, breed, size, temper, site: 'hawthorne', place, checkedIn: true, happiness: 60 + (id.charCodeAt(1) % 35), clean: 70, boarding: false, played: 1, bathed: false, x: 0.5, y: 0.5, visits: 3, ...extra });
const dogs = [
  dog('a1', 'Biscuit', 1, 'small', 'gentle', { kind: 'room', group: 'small-gentle' }),
  dog('a2', 'Pip', 5, 'small', 'gentle', { kind: 'room', group: 'small-gentle' }),
  dog('a3', 'Ziggy', 4, 'small', 'active', { kind: 'room', group: 'small-active' }),
  dog('a4', 'Luna', 0, 'large', 'gentle', { kind: 'room', group: 'large-gentle' }),
  dog('a5', 'Bear', 2, 'large', 'active', { kind: 'room', group: 'large-active' }),
  dog('a6', 'Duke', 3, 'large', 'active', { kind: 'room', group: 'large-active' }),
  dog('a7', 'Maple', 0, 'large', 'gentle', { kind: 'suite', index: 0 }, { boarding: true }),
  dog('a8', 'Otis', 2, 'large', 'gentle', { kind: 'lobby' }, { checkedIn: false }),
  dog('a9', 'Nala', 4, 'small', 'active', { kind: 'lobby' }, { checkedIn: false }),
];
const save = { v: 4, coins: 1840, dogs, staff: [{ id: 's0', name: 'Phil', energy: 80 }, { id: 's1', name: 'Maya', energy: 60 }], cleanliness: 85, upgrades: ['yard1', 'boarding', 'splash', 'yard2'], decor: ['plant', 'balls', 'bone', 'pool'], tutorial: -1, stats: st, achievements: ['first', 'board'], missionDay: nyDay(), missionBase: st, missionsClaimed: [], recessBest: 420, recessDay: nyDay(), recessCoinsToday: 0, cosmetics: ['bandana-red'], equipped: 'bandana-red', lastSeen: Date.now(), seq: 99, site: 'hawthorne', clockMin: 10 * 60, gameDay: 4, reputation: 77, home: 'hawthorne', team: 'hawthorne', teamChangedAt: Date.now() - 86400000, adventure: { team: 'hawthorne', chapter: 1, base: st } };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  const go = async (path, wait = 1800) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(wait); };

  // 1) A brand-new player is asked to pick a team.
  await go('/help', 300);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true })); });
  await go('/', 500);
  await page.getByRole('dialog', { name: 'Pick your team!' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  await shot('01-pick-team');

  // A player who has been playing a while (Team Hawthorne).
  await go('/help', 300);
  await page.evaluate((s) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('pawtastic-tycoon-save-v1', JSON.stringify(s));
    localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true }));
    localStorage.setItem('pawtastic-team-points', JSON.stringify({ day: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()), total: 18 }));
  }, save);
  await go('/', 2200);
  await shot('02-home');

  // 3–4) Daycare: overhead, then first-person walk.
  await go('/daycare', 500);
  await page.waitForFunction(() => !!window.__daycareWorld, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await shot('03-daycare-overhead');
  await page.getByRole('radio', { name: /Walk/ }).click();
  await page.evaluate(() => window.__daycareWorld.jumpTo('room:large-active'));
  await page.waitForTimeout(1500);
  await shot('04-daycare-walk');
  await page.getByRole('radio', { name: /Overhead/ }).click().catch(() => {});

  // 5) Recess Rush, mid-run if there is a start button.
  await go('/recess', 1500);
  const start = page.getByRole('button', { name: /start|play|run/i }).first();
  if (await start.isVisible().catch(() => false)) { await start.click(); await page.waitForTimeout(3500); }
  await shot('05-recess-rush');

  // 6) Graduation Day inside the hub.
  await go('/graduation', 4000);
  await shot('06-graduation');

  // 7) Shop.
  await go('/shop', 1500);
  await shot('07-shop');

  // 8) Share sheet.
  await go('/', 1500);
  await page.getByRole('button', { name: 'Share and invite friends' }).first().click();
  await page.waitForTimeout(900);
  await shot('08-share');
  await page.keyboard.press('Escape');

  // 9) Visit / book a free evaluation.
  await go('/visit', 1500);
  await shot('09-visit');

  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
