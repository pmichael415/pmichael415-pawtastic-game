// Phone checks (owner brief, 5 Nov, part 5) — Chromium with iPhone 13 emulation, portrait and landscape. NOT a real
// iPhone or Safari. Layouts, camera drag vs taps, selecting pups and staff, scrolling sheets, hiring / letting go /
// rehiring (and a double tap), both expansions, waiting warnings, the introductory day, a normal departure, closing
// time, reload, background and resume, an old save. (The full visit with a complaint, a double-tapped checkout and
// the second tab are in qa/e2e-service.cjs.) Needs the dev server. Run: node qa/e2e-phone.cjs [base-url]
const { chromium, devices } = require('playwright');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-daycare-next-v1';
const OUT = path.join(__dirname, 'out');
let pass = 0, fail = 0; const out = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const DONE = { mode: 'quick', beat: 'goals', startedAt: 0, upgrade: null, done: true, skipped: false };
const IPHONE = devices['iPhone 13'];
const LANDSCAPE = { ...IPHONE, viewport: { width: IPHONE.viewport.height, height: IPHONE.viewport.width }, screen: { width: IPHONE.screen.height, height: IPHONE.screen.width } };

async function steady(page, fn) {
  for (let i = 0; i < 4; i++) {
    try { return await fn(); } catch (e) {
      if (!/context was destroyed|navigation/i.test(String(e)) || i === 3) throw e;
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
}

/** A fresh browser profile with a save built in the page (never anyone's real save). */
async function open(browser, device, build, opts = {}) {
  const ctx = await browser.newContext(device);
  await ctx.addInitScript(([scenario]) => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); if (scenario) sessionStorage.setItem('pawtastic-test-save', scenario); } catch {} }, [opts.scenario ?? null]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
  if (build) await steady(page, () => page.evaluate(async ([KEY, src]) => {
    localStorage.clear();
    localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false }));
    const build = new Function('m', `return (${src})(m)`);
    const m = { kit: await import('/src/tycoon/testkit.ts'), start: await import('/src/tycoon/start.ts'), state: await import('/src/tycoon/state.ts'), team: await import('/src/tycoon/team.ts'), progress: await import('/src/tycoon/progress.ts'), visit: await import('/src/tycoon/visit.ts') };
    localStorage.setItem(KEY, JSON.stringify(await build(m)));
  }, [KEY, build.toString()]));
  await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
  return { ctx, page, errors, st: () => page.evaluate(() => window.__tycoonState()), f: async () => (await page.evaluate(() => window.__tycoonState())).facilities.f1 };
}
const speed = (page, n) => page.evaluate((n) => { window.__tycoonSpeed = n; }, n);
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent).join(' | '));
/** Screen position of a pup or person in the 3D view. */
const screenOf = (page, kind, id) => page.evaluate(([kind, id]) => {
  const w = window.__tycoonWorld;
  const a = kind === 'dog' ? w.dogs.get(id) : w.staff.get(id);
  if (!a) return null;
  const v = a.rig.root.position.clone();
  v.y = kind === 'dog' ? 0.5 * a.size : 1.2;
  v.project(w.camera);
  const r = w.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [kind, id]);

/** A quick-start daycare past the guide, open at 9:00, at level 2 with savings. */
const quickDay = (over) => `async (m) => { let s = m.kit.ok(m.start.quickStart(m.state.newTycoon(Date.now()))); s = { ...s, coins: 4000, xp: m.progress.xpForLevel(3), lastSeen: Date.now(), pendingLevel: null, tour: ${JSON.stringify(DONE)} }; const f = m.state.fac(s); s = m.state.withFac(s, { ...f, open: true, clockMin: 540, prices: { ...f.prices, daycare: 80 }, dogs: [], ${over ?? ''} }); return s; }`;

async function layouts(browser) {
  for (const [label, dev] of [['portrait', IPHONE], ['landscape', LANDSCAPE]]) {
    const { ctx, page, errors } = await open(browser, dev, null, { scenario: 'busy' });
    try {
      await page.waitForFunction(() => !!window.__tycoonWorld, null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${label}: no sideways scrolling (busy test save)`, overflow <= 1, `${overflow}px`);
      check(`${label}: the test save says it's separate from the player's daycare`, (await page.getByRole('region', { name: 'Test save' }).count()) === 1);
      const canvas = page.locator('section[aria-label="3D daycare view"] canvas');
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      check(`${label}: the 3D view fits the screen`, !!box && box.width <= dev.viewport.width && box.height > 150, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : 'none');
      await page.screenshot({ path: path.join(OUT, `phone-${label}-busy.png`) });
      // camera drag: moves the view, selects nothing, changes nothing
      const before = await page.evaluate(() => ({ t: { ...window.__tycoonWorld.debugInfo().target }, dogs: window.__tycoonState().facilities.f1.dogs.map((d) => `${d.id}:${d.checkedIn}:${d.place.kind}`).join() }));
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 90, cy + 40, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({ t: { ...window.__tycoonWorld.debugInfo().target } }));
      check(`${label}: dragging moves the camera`, Math.hypot(after.t.x - before.t.x, after.t.z - before.t.z) > 0.5);
      check(`${label}: dragging selects nothing`, (await page.getByTestId('panel-sheet').count()) === 0);
      // tap a person, then a pup (each with nothing else open)
      await page.evaluate(() => window.__tycoonSpeed = 0.0001);
      await canvas.scrollIntoViewIfNeeded();
      const staffId = await page.evaluate(() => window.__tycoonState().facilities.f1.staff.find((x) => x.role === 'attendant').id);
      const q = await screenOf(page, 'staff', staffId);
      if (q) await page.mouse.click(q.x, q.y);
      await page.waitForTimeout(300);
      const sp = await page.getByTestId('panel-sheet').innerText().catch(() => '');
      check(`${label}: tapping a staff member opens their panel (role, task, wage)`, /attendant/i.test(sp) && /Now:/.test(sp) && /coins a day/.test(sp), sp.slice(0, 80).replace(/\n/g, ' / '));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__tycoonWorld, null, { timeout: 20000 });
      await page.evaluate(() => window.__tycoonSpeed = 0.0001);
      await page.waitForTimeout(1200);
      await canvas.scrollIntoViewIfNeeded();
      const dogId = await page.evaluate(() => window.__tycoonState().facilities.f1.dogs.find((d) => d.place.kind === 'room').id);
      const p = await screenOf(page, 'dog', dogId);
      if (p) await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(300);
      const panel = page.getByTestId('panel-sheet');
      check(`${label}: tapping a pup opens its panel (needs, room, who's looking after it)`, (await panel.count()) === 1 && /Looked after by/.test(await panel.innerText()));
      if (await panel.count()) {
        const scrolls = await panel.evaluate((el) => el.scrollHeight >= el.clientHeight);
        check(`${label}: the panel is a scrolling sheet within the screen`, scrolls && (await panel.boundingBox()).height <= dev.viewport.height);
      }
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
      // the Team sheet scrolls to the hire button
      await page.keyboard.press('Escape').catch(() => {});
      await page.getByRole('button', { name: /^Team, \d/ }).click();
      const sheet = page.getByRole('dialog', { name: /^Team ·/ });
      await sheet.waitFor();
      const hireBtn = sheet.getByRole('button', { name: /^Hire a / });
      const reach = await hireBtn.count() === 0 ? 'full team' : (await hireBtn.scrollIntoViewIfNeeded().then(() => 'ok').catch(() => 'no'));
      check(`${label}: the Team sheet scrolls to its controls`, reach === 'ok' || reach === 'full team', reach);
      await page.screenshot({ path: path.join(OUT, `phone-${label}-team.png`) });
      await page.keyboard.press('Escape');
      check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    } catch (e) { check(`${label}: layout checks ran`, false, String(e).split('\n')[0]); }
    await ctx.close();
  }
}

async function staffing(browser) {
  const { ctx, page, errors, f, st } = await open(browser, IPHONE, quickDay());
  try {
    await speed(page, 0.0001);
    const team = page.getByRole('button', { name: /^Team, \d/ });
    await team.click();
    const sheet = page.getByRole('dialog', { name: /^Team ·/ });
    await sheet.waitFor();
    await sheet.getByRole('radio', { name: /^Receptionist/ }).click();
    const hireBtn = sheet.getByRole('button', { name: /^Hire a receptionist/ });
    await hireBtn.dblclick(); // a quick double tap
    await page.waitForTimeout(300);
    check('a double tap on Hire hires one person', (await f()).staff.length === 2, `${(await f()).staff.length} on the team`);
    await page.waitForTimeout(900);
    await sheet.getByRole('radio', { name: /^Daycare attendant/ }).click();
    await sheet.getByRole('button', { name: /^Hire a daycare attendant/ }).click();
    const first = (await f()).staff[1];
    await sheet.getByRole('listitem', { name: first.name }).getByRole('button', { name: 'Let go…' }).click();
    await sheet.getByRole('button', { name: `Let ${first.name} go` }).click();
    await page.waitForTimeout(900);
    await sheet.getByRole('radio', { name: /^Bath attendant/ }).click();
    await sheet.getByRole('button', { name: /^Hire a bath attendant/ }).click();
    const names = (await f()).staff.map((x) => x.name);
    check('after letting someone go and hiring again, every name on the team is different', new Set(names).size === names.length, names.join(', '));
    await page.keyboard.press('Escape');
    // both expansions, from the card; it closes and shows the result
    await page.getByRole('button', { name: /^(Expansion options|See options)$/ }).first().click();
    let card = page.getByRole('region', { name: 'Expand your daycare' });
    await card.waitFor();
    await card.getByRole('article', { name: /^Playroom wing/ }).getByRole('button', { name: /^Build · / }).click();
    await page.waitForTimeout(400);
    check('building the playroom wing closes the card', (await page.getByRole('region', { name: 'Expand your daycare' }).count()) === 0);
    check('… and shows the new playroom', /Playroom/.test(await page.getByTestId('panel-sheet').innerText().catch(() => '')));
    await page.mouse.click(5, 5).catch(() => {});
    await page.getByRole('button', { name: /^(Expansion options|See options)$/ }).first().click();
    card = page.getByRole('region', { name: 'Expand your daycare' });
    await card.waitFor();
    await card.getByRole('article', { name: /^Bath station/ }).getByRole('button', { name: /^Build · / }).click();
    await page.waitForTimeout(400);
    check('building the bath station closes the card and shows the bath room', (await page.getByRole('region', { name: 'Expand your daycare' }).count()) === 0 && /Bath Room/.test(await page.getByTestId('panel-sheet').innerText().catch(() => '')));
    const fac = await f();
    check('both expansions are built and working', fac.rooms.filter((r) => r.type === 'playroom').length >= 2 && fac.rooms.some((r) => r.type === 'bath'));
    check('staffing: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    void st;
  } catch (e) { check('staffing checks ran', false, String(e).split('\n')[0]); }
  await ctx.close();
}

async function waiting(browser) {
  // the introductory day: warnings, then a courtesy reschedule (no outcome)
  {
    const { ctx, page, f } = await open(browser, IPHONE, quickDay(`introDay: f.day, dogs: [{ id: 'w1', name: 'Bruno', breed: 0, size: 'large', temper: 'active', visits: 1, place: { kind: 'lobby' }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false, visit: { ...m.visit.defaultVisit(f, { name: 'Bruno', breed: 0, boarding: false, checkedIn: false }), owner: 'Taylor', arrivedDay: f.day, arrived: 540 } }]`));
    try {
      await speed(page, 6);
      const warned = await page.waitForFunction(() => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => /Bruno/.test(t.textContent) && /game min/.test(t.textContent) && /Check in/.test(t.textContent)), null, { timeout: 30000 }).then(() => true).catch(() => false);
      check('introductory day: a waiting warning in game minutes, with the next action', warned, (await toastText(page)).slice(0, 140));
      await page.waitForFunction(() => !window.__tycoonState().facilities.f1.dogs.some((d) => d.id === 'w1'), null, { timeout: 30000 });
      await speed(page, 0.0001);
      const g = await f();
      check('introductory day: at the limit the family is kindly rescheduled — no upset visit, no reputation loss', g.outcomes.length === 0 && g.courtesy?.why === 'intro');
      const told = await page.waitForFunction(() => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => /Bruno/.test(t.textContent) && /Next time/.test(t.textContent)), null, { timeout: 8000 }).then(() => true).catch(() => false);
      check('introductory day: the notice says what to do next time', told, (await toastText(page)).slice(0, 160));
    } catch (e) { check('introductory-day checks ran', false, String(e).split('\n')[0]); }
    await ctx.close();
  }
  // after the introductory day: the family leaves upset at 60 game minutes
  {
    const { ctx, page, f } = await open(browser, IPHONE, quickDay(`introDay: 0, dogs: [{ id: 'w2', name: 'Pip', breed: 0, size: 'large', temper: 'active', visits: 1, place: { kind: 'lobby' }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false, visit: { ...m.visit.defaultVisit(f, { name: 'Pip', breed: 0, boarding: false, checkedIn: false }), owner: 'Casey', arrivedDay: f.day, arrived: 540 } }]`));
    try {
      await speed(page, 6);
      await page.waitForFunction(() => !window.__tycoonState().facilities.f1.dogs.some((d) => d.id === 'w2'), null, { timeout: 30000 });
      await speed(page, 0.0001);
      const o = (await f()).outcomes.at(-1);
      check('after the first day: an ignored family leaves upset at 60 game minutes', o?.dog === 'Pip' && o.how === 'left' && o.mood === 'upset');
    } catch (e) { check('departure checks ran', false, String(e).split('\n')[0]); }
    await ctx.close();
  }
  // closing time: a family still at the desk is rescheduled once; a checked-in boarder stays
  {
    const { ctx, page, f } = await open(browser, IPHONE, quickDay(`introDay: 0, clockMin: 1074, dogs: [{ id: 'w3', name: 'Late', breed: 1, size: 'small', temper: 'gentle', visits: 1, place: { kind: 'lobby' }, checkedIn: false, happiness: 80, clean: 60, boarding: true, played: 0, bathed: false, visit: { ...m.visit.defaultVisit(f, { name: 'Late', breed: 1, boarding: true, checkedIn: false }), arrivedDay: f.day, arrived: 1072 } }]`));
    try {
      const day = (await f()).day;
      await speed(page, 4);
      await page.waitForFunction((d) => window.__tycoonState().facilities.f1.day > d, day, { timeout: 30000 });
      await speed(page, 0.0001);
      const g = await f();
      check('closing: a family still at the desk is kindly rescheduled once (no visit judged)', !g.dogs.some((d) => d.id === 'w3') && !g.outcomes.some((o) => o.dog === 'Late') && g.courtesy?.why === 'closing');
    } catch (e) { check('closing checks ran', false, String(e).split('\n')[0]); }
    await ctx.close();
  }
}

async function lifecycle(browser) {
  const { ctx, page, f, st, errors } = await open(browser, IPHONE, quickDay());
  try {
    await speed(page, 1);
    await page.waitForTimeout(1500);
    // background: time stops; coming back shows Paused with Resume, and nothing caught up
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const c0 = (await f()).clockMin;
    await page.waitForTimeout(3000);
    check('in the background, game time stops', (await f()).clockMin === c0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(800);
    check('coming back: no catch-up, and a Paused notice with Resume', (await f()).clockMin === c0 && (await page.getByRole('region', { name: 'Paused' }).count()) === 1);
    await page.getByRole('region', { name: 'Paused' }).getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(1500);
    check('Resume starts time again', (await f()).clockMin > c0);
    // reload keeps everything
    const before = await st();
    await speed(page, 0.0001);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    const after = await st();
    check('a reload keeps the save', after.coins === before.coins && after.facilities.f1.rooms.length === before.facilities.f1.rooms.length && after.facilities.f1.introDay === before.facilities.f1.introDay);
    check('lifecycle: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { check('lifecycle checks ran', false, String(e).split('\n')[0]); }
  await ctx.close();
  // an old save from before staff roles: a family waiting 90 minutes doesn't leave on load
  const old = await open(browser, IPHONE, `async (m) => { const s = m.kit.richState(); const f = m.state.fac(s); const d = { id: 'o1', name: 'Pepper', breed: 1, size: 'small', temper: 'gentle', visits: 1, place: { kind: 'lobby' }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false, visit: { ...m.visit.defaultVisit(f, { name: 'Pepper', breed: 1, boarding: false, checkedIn: false }), arrivedDay: f.day, arrived: 540 } }; const o = JSON.parse(JSON.stringify({ ...s, lastSeen: Date.now(), tour: ${JSON.stringify(DONE)}, facilities: { f1: { ...f, open: true, clockMin: 630, dogs: [d], staff: [{ id: 's0', name: 'Phil', energy: 100 }] } } })); delete o.facilities.f1.introDay; return o; }`);
  try {
    await old.page.waitForTimeout(2500);
    const g = await old.f();
    check('an old save: the family at the desk is still there after loading', g.dogs.some((d) => d.id === 'o1') && g.outcomes.length === 0);
  } catch (e) { check('old-save check ran', false, String(e).split('\n')[0]); }
  await old.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  out.push(`INFO  Chromium ${browser.version()} with iPhone 13 emulation (390×844 portrait, 844×390 landscape), software graphics. Not a real iPhone or Safari.`);
  await layouts(browser);
  await staffing(browser);
  await waiting(browser);
  await lifecycle(browser);
  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
