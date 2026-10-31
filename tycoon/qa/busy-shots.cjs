// Screenshots of a busy, upgraded daycare (overhead + walk + Hillsdale), iPhone 13 and desktop.
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const nyDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const st = { admitted: 30, baths: 12, plays: 40, earned: 3000, checkouts: 25, cleans: 5, boarders: 3, shares: 1, runs: 2 };
const dog = (id, name, breed, size, temper, place, extra = {}) => ({ id, name, breed, size, temper, site: 'hawthorne', place, checkedIn: true, happiness: 60 + (id.charCodeAt(1) % 35), clean: 70, boarding: false, played: 1, bathed: false, x: 0.5, y: 0.5, ...extra });
const dogs = [
  dog('a1', 'Biscuit', 1, 'small', 'gentle', { kind: 'room', group: 'small-gentle' }),
  dog('a2', 'Pip', 5, 'small', 'gentle', { kind: 'room', group: 'small-gentle' }),
  dog('a3', 'Ziggy', 4, 'small', 'active', { kind: 'room', group: 'small-active' }),
  dog('a4', 'Luna', 0, 'large', 'gentle', { kind: 'room', group: 'large-gentle' }),
  dog('a5', 'Bear', 2, 'large', 'active', { kind: 'room', group: 'large-active' }),
  dog('a6', 'Duke', 3, 'large', 'active', { kind: 'room', group: 'large-active' }),
  dog('a7', 'Maple', 0, 'large', 'gentle', { kind: 'suite', index: 0 }, { boarding: true }),
  dog('a8', 'Otis', 2, 'large', 'gentle', { kind: 'lobby' }, { checkedIn: false }),
  dog('a9', 'Nala', 4, 'small', 'active', { kind: 'lobby' }),
  dog('b1', 'Rocky', 3, 'large', 'active', { kind: 'room', group: 'small-gentle' }),
];
const save = { v: 4, coins: 1840, dogs, staff: [{ id: 's0', name: 'Phil', energy: 80 }, { id: 's1', name: 'Maya', energy: 60 }, { id: 's2', name: 'Jordan', energy: 10 }], cleanliness: 85, upgrades: ['yard1', 'boarding', 'splash', 'yard2'], decor: ['plant', 'balls', 'bone', 'pool'], tutorial: -1, stats: st, achievements: ['first', 'board'], missionDay: nyDay(), missionBase: st, missionsClaimed: [], recessBest: 420, recessDay: nyDay(), recessCoinsToday: 0, cosmetics: ['bandana-red'], equipped: 'bandana-red', lastSeen: Date.now(), seq: 99, site: 'hawthorne', clockMin: 10 * 60, gameDay: 4, reputation: 77, scuffles: [{ site: 'hawthorne', group: 'small-gentle' }] };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [label, opts] of [['phone', devices['iPhone 13']], ['desktop', { viewport: { width: 1280, height: 860 } }]]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(BASE + '/help');
    await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pawtastic-tycoon-save-v1', JSON.stringify(s)); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true })); }, save);
    await page.waitForTimeout(300);
    await page.goto(BASE + '/daycare', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__daycareWorld, null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__daycareWorld.jumpTo('playrooms'));
    await page.waitForTimeout(800);
    await page.locator('section[aria-label="3D daycare view"]').screenshot({ path: `qa/out/busy-${label}-overhead.png` });
    await page.evaluate(() => window.__daycareWorld.resetCamera());
    await page.waitForTimeout(600);
    await page.locator('section[aria-label="3D daycare view"]').screenshot({ path: `qa/out/busy-${label}-overhead-reset.png` });
    await page.getByRole('radio', { name: /Walk/ }).click();
    await page.evaluate(() => { const w = window.__daycareWorld; w.jumpTo('room:large-active'); });
    await page.waitForTimeout(1200);
    await page.locator('section[aria-label="3D daycare view"]').screenshot({ path: `qa/out/busy-${label}-walk.png` });
    await ctx.close();
  }
  await browser.close();
})();
