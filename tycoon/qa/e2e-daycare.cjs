// End-to-end QA for the daycare on an iPhone 13 profile (touch input, 390x664 viewport).
// Usage: node qa/e2e-daycare.cjs [baseUrl]
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-tycoon-save-v1';
const nyDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const stats0 = { admitted: 0, baths: 0, plays: 0, earned: 0, checkouts: 0, cleans: 0, boarders: 0, shares: 0, runs: 0 };
const dog = (id, name, extra = {}) => ({ id, name, breed: 1, size: 'small', temper: 'gentle', site: 'hawthorne', place: { kind: 'lobby' }, checkedIn: false, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false, x: 0.5, y: 0.5, ...extra });
const save = (o = {}) => ({ v: 4, coins: 500, dogs: [], staff: [{ id: 's0', name: 'Phil', energy: 100 }], cleanliness: 100, upgrades: [], decor: [], tutorial: -1, stats: { ...stats0 }, achievements: [], missionDay: nyDay(), missionBase: { ...stats0 }, missionsClaimed: [], recessBest: 0, recessDay: nyDay(), recessCoinsToday: 0, cosmetics: [], equipped: null, lastSeen: Date.now(), seq: 50, site: 'hawthorne', clockMin: 9 * 60, gameDay: 1, reputation: 80, scuffles: [], ...o });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') { (ok ? pass++ : fail++); results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const vh = page.viewportSize().height;
  const read = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const world = () => page.evaluate(() => window.__daycareWorld?.debugInfo());
  async function load(s, path = '/daycare') {
    await page.goto(BASE + '/help');
    await page.evaluate(([k, v]) => { localStorage.clear(); if (v) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true, analytics: true })); }, [KEY, s]);
    await page.waitForTimeout(300);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__daycareWorld || !location.pathname.includes('daycare'), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const inView = (b) => !!b && b.y >= 0 && b.y + b.height <= vh - 64; // above the bottom nav

  // 1) Fresh player: a first customer arrives and Check in is visible immediately
  await load(null);
  const strip = page.locator('[data-testid^="quick-checkin-"]').first();
  await strip.waitFor({ timeout: 8000 });
  const sb = await strip.boundingBox();
  check('fresh game: a pup is waiting and Check in is on screen without scrolling', inView(sb), JSON.stringify(sb));
  check('Check in button is at least 44px tall', sb && sb.height >= 44, `${sb?.height}px`);
  // 2) Rapid double tap: one check-in, one fee
  const before = await read();
  await strip.tap();
  await page.waitForTimeout(60);
  await page.locator('[data-testid^="quick-checkin-"], [data-testid^="checkin-"]').first().tap({ timeout: 500 }).catch(() => {});
  await page.waitForTimeout(400);
  let s = await read();
  check('double tap on Check in pays the fee once', s.coins - before.coins === 20 && s.stats.admitted === 1, `coins ${before.coins}→${s.coins}, admitted ${s.stats.admitted}`);
  check('tutorial advanced to step 2 after check-in', s.tutorial === 1, `tutorial=${s.tutorial}`);
  const id = s.dogs[0].id;
  // 3) Tap the pup in the 3D overhead view -> care panel
  let w = await world();
  const d3 = w.dogs.find((d) => d.id === id);
  const pt = await page.evaluate(([x, z]) => window.__daycareWorld.project(x, 0.5, z), [d3.x, d3.z]);
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForTimeout(400);
  const panel = page.locator('section[aria-label^="Care for"]');
  const pb = await panel.boundingBox().catch(() => null);
  check('tapping the pup in 3D opens its care panel', !!pb, pb ? '' : `tap at ${Math.round(pt.x)},${Math.round(pt.y)}`);
  const sheet = await page.getByTestId('sheet').boundingBox();
  const prim = await page.getByTestId('primary-action').boundingBox();
  check('care sheet is on screen above the nav, with its main action visible', sheet && sheet.y >= 0 && sheet.y + sheet.height <= vh - 63 && inView(prim), JSON.stringify({ sheet, prim, panelH: pb?.height }));
  const panelText = pb ? await panel.innerText() : '';
  check('panel shows name, size, temperament, location and check-in status', /Small|Large/.test(panelText) && /Gentle|Active/.test(panelText) && /Lobby · checked in/.test(panelText), panelText.split('\n').slice(0, 3).join(' | '));
  // 4) Primary action: move to the matching room
  await page.getByTestId('primary-action').tap();
  await page.waitForTimeout(500);
  s = await read();
  const placed = s.dogs.find((d) => d.id === id);
  check('primary action places the pup in the room matching BOTH size and temperament', placed.place.kind === 'room' && placed.place.group === `${placed.size}-${placed.temper}`, JSON.stringify(placed.place));
  await page.waitForTimeout(1500);
  w = await world();
  check('3D world moved the same pup to that room (shared state)', w.dogs.find((d) => d.id === id)?.area === `room:${placed.place.group}`, w.dogs.find((d) => d.id === id)?.area);
  // 5) Care: play + bath via the list chip
  await page.locator(`button[data-dog="${id}"]`).first().tap();
  await page.waitForTimeout(300);
  const c0 = (await read()).coins;
  await page.getByRole('button', { name: /Play \+15/ }).tap();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Bath \+/ }).tap();
  await page.waitForTimeout(600);
  s = await read();
  check('play and bath both earn coins and count', s.coins > c0 && s.stats.plays === 1 && s.stats.baths === 1, `coins ${c0}→${s.coins}`);
  w = await world();
  check('bath sends the pup to the tub in the bath area (3D)', (() => { const a = w.dogs.find((d) => d.id === id); return a && a.bathing && a.dest && a.dest.x > 7.5 && a.dest.x < 9.5 && a.dest.z > 8.5; })(), JSON.stringify(w.dogs.find((d) => d.id === id)));
  // 6) Checkout
  const c1 = s.coins;
  await page.getByRole('button', { name: /^Check out$/ }).tap();
  await page.waitForTimeout(500);
  s = await read();
  check('checkout pays and removes the pup from the game state', s.coins > c1 && !s.dogs.some((d) => d.id === id), `coins ${c1}→${s.coins}`);
  w = await world();
  check('3D shows the pup heading home (leaving), not vanishing', w.dogs.some((d) => d.id === id && d.leaving) || w.people > 0, JSON.stringify(w.dogs));
  // 7) One visible improvement
  await page.getByRole('tab', { name: 'decor' }).tap();
  await page.getByRole('button', { name: /60 🪙/ }).tap();
  await page.waitForTimeout(400);
  s = await read();
  check('buying a Leafy Plant places it and completes the tutorial', s.decor.includes('plant') && s.tutorial === -1, `decor=${s.decor} tutorial=${s.tutorial}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'qa/out/e2e-1-after-first-cycle.png' });

  // 8) Schedule boundaries in the UI: 11:59 -> 12:00
  await load(save({ clockMin: 11 * 60 + 59.5, dogs: [dog('w1', 'Ziggy')] }));
  await page.waitForTimeout(800);
  s = await read();
  check('clock crosses 12:00 on its own', s.clockMin >= 12 * 60, `clock=${s.clockMin}`);
  const walkIn = page.getByRole('button', { name: /Walk-in/ });
  check('walk-in drop-offs are disabled during 12–2', await walkIn.isDisabled());
  check('the reason is shown next to it', await page.getByText(/Drop-offs pause 12:00–14:00/).first().isVisible());
  await page.getByTestId('quick-checkin-w1').tap();
  await page.waitForTimeout(400);
  s = await read();
  check('a pup already inside can still be checked in during the break', s.dogs[0].checkedIn === true);
  // 13:59 -> 14:00
  await load(save({ clockMin: 13 * 60 + 59.5 }));
  await page.waitForTimeout(800);
  s = await read();
  check('clock crosses 14:00 and drop-offs reopen', s.clockMin >= 14 * 60 && !(await walkIn.isDisabled()), `clock=${s.clockMin}`);

  // 9) Leaving the app pauses the clock without blocking care
  await load(save({ dogs: [dog('p1', 'Pip')] }));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  const banner = page.getByText(/Clock paused — pups are safe/);
  const bb = await banner.boundingBox();
  check('returning to the app shows a visible paused banner at the top', inView(bb), JSON.stringify(bb));
  const clockA = (await read()).clockMin;
  await page.waitForTimeout(1200);
  check('clock is stopped while paused', (await read()).clockMin === clockA);
  await page.getByTestId('quick-checkin-p1').tap();
  await page.waitForTimeout(300);
  check('check-in still works while paused', (await read()).dogs[0].checkedIn === true);
  await page.getByRole('button', { name: 'Resume' }).first().tap();
  await page.waitForTimeout(1200);
  check('Resume restarts the clock', (await read()).clockMin > clockA);

  // 10) Walk mode: walk to the front desk and check a pup in with the contextual button
  await load(save({ dogs: [dog('k1', 'Maple')] }));
  await page.getByRole('radio', { name: /Walk/ }).tap();
  await page.waitForTimeout(500);
  const stick = await page.getByRole('application', { name: /Movement stick/ }).boundingBox();
  const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 9 }] }); await page.waitForTimeout(16); }
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  w = await world();
  check('first-person: the stick walks the player forward', w.mode === 'walk' && w.me.z < 11.3, JSON.stringify(w.me));
  const promptBtn = page.getByRole('button', { name: /Check in Maple/ });
  const promptVisible = await promptBtn.isVisible().catch(() => false);
  check('first-person: facing the desk offers "Check in Maple"', promptVisible, `focus=${w.focus}`);
  if (promptVisible) { await promptBtn.tap(); await page.waitForTimeout(400); }
  check('first-person: contextual button checks the pup in (same save)', (await read()).dogs[0].checkedIn === true);
  await page.screenshot({ path: 'qa/out/e2e-2-walk.png' });
  // keyboard
  await page.locator('canvas').focus();
  const zBefore = (await world()).me.z;
  await page.keyboard.down('s'); await page.waitForTimeout(400); await page.keyboard.up('s');
  check('desktop keys (S) move the first-person camera', (await world()).me.z > zBefore + 0.3);
  // overhead <-> walk consistency
  const idsWalk = (await world()).dogs.map((d) => d.id).sort().join();
  await page.getByRole('radio', { name: /Overhead/ }).tap();
  await page.waitForTimeout(400);
  const ow = await world();
  check('switching cameras keeps the same pups and save', ow.mode === 'overhead' && ow.dogs.map((d) => d.id).sort().join() === idsWalk && (await read()).dogs[0].checkedIn === true);

  // 11) Scuffle: separate during closure, with a full lobby and exhausted staff
  const full = [0, 1, 2, 3].map((i) => dog('L' + i, 'Lobby' + i, { checkedIn: true }));
  const a = dog('A1', 'Rocky', { checkedIn: true, place: { kind: 'room', group: 'small-gentle' } });
  const b = dog('B1', 'Duke', { checkedIn: true, size: 'large', temper: 'active', breed: 0, place: { kind: 'room', group: 'small-gentle' } });
  await load(save({ clockMin: 12 * 60 + 30, dogs: [...full, a, b], staff: [{ id: 's0', name: 'Phil', energy: 0 }], scuffles: [{ site: 'hawthorne', group: 'small-gentle' }] }));
  w = await world();
  const sep = page.getByRole('button', { name: /Separate dogs/ }).first();
  check('scuffle shows a Separate control', await sep.isVisible());
  const coinsBefore = (await read()).coins;
  await sep.tap();
  await page.waitForTimeout(400);
  s = await read();
  check('separating works while closed, lobby full and staff at 0% energy', s.scuffles.length === 0 && s.dogs.find((d) => d.id === 'B1').place.kind === 'recovery', JSON.stringify(s.dogs.find((d) => d.id === 'B1').place));
  check('separating pays no coins', s.coins === coinsBefore);
  check('lobby still holds exactly 4 (recovery is separate)', s.dogs.filter((d) => d.place.kind === 'lobby').length === 4);

  // 12) Mobile layout: no sideways scrolling, tap targets >= 44px
  await load(save({ dogs: [dog('m1', 'Willow')] }));
  const layout = await page.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="radio"]')) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (!r.width || !r.height || st.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue;
      if (r.height < 43.5 || r.width < 43.5) small.push(`${el.tagName}.${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, small };
  });
  check('no horizontal overflow on a 390px-wide phone', layout.overflow <= 0, `overflow=${layout.overflow}`);
  check('all tap targets are at least 44×44px', layout.small.length === 0, layout.small.slice(0, 8).join('; '));

  const perf = await world();
  check('3D frame cost is reasonable (software GL in CI)', perf.frameMs < 40, `${perf.frameMs.toFixed(1)}ms/frame, ${perf.calls} draw calls, ${perf.triangles} tris`);
  check('no page errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(results.join('\n')); console.error(e); process.exit(2); });
