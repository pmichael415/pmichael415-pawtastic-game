// End-to-end QA for the new Daycare Tycoon (preview, /daycare-next): the whole guided start built by tapping the 3D
// view, ghosts, doors and connections, upgrade/move/sell, finances and a few played days, the below-zero banner, land,
// the level-up overlay with and without reduced motion, the list view, the sign card, and the frame rate with
// 12 rooms and 200 things. Needs the dev server (DEV-only hooks: __tycoonSpeed, __tycoonSet, __tycoonArrive,
// __tycoonStress). Run: node qa/e2e-tycoon.cjs [base-url]
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-daycare-next-v1';
let pass = 0, fail = 0; const out = [];
const DEBUG = !!process.env.DEBUG;
const log = (...a) => { if (DEBUG) console.log('  ·', ...a); };
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

async function session(browser, deviceName) {
  const ctx = await browser.newContext({ ...devices[deviceName] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());
  const f = async () => (await st()).facilities.f1;

  async function fresh(settings = { view: 'overhead' }, save) {
    await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
    await page.evaluate(([k, s, v]) => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify(s)); if (v) localStorage.setItem(k, JSON.stringify(v)); }, [KEY, settings, save]);
    await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    if (settings.view !== 'list') await page.waitForFunction(() => !!window.__tycoonWorld, null, { timeout: 15000 });
  }
  /** Dismisses a level-up or day report if one is showing. */
  async function clearOverlays() {
    for (let i = 0; i < 4; i++) {
      const lv = page.getByRole('button', { name: 'Continue' });
      if (await lv.count()) { await lv.first().click(); await page.waitForTimeout(150); continue; }
      const day = page.getByRole('button', { name: /^Start day/ });
      if (await day.count()) { await day.first().click(); await page.waitForTimeout(150); continue; }
      break;
    }
  }
  /** Taps a square or a wall edge in the 3D view, making sure the point isn't covered by the HUD or a toast. */
  async function tapWorld(kind, ...args) {
    for (const block of ['center', 'end', 'start']) {
      await page.evaluate((b) => document.querySelector('section[aria-label="3D daycare view"] canvas').scrollIntoView({ block: b }), block);
      await page.waitForTimeout(180);
      const p = await page.evaluate(([kind, args]) => {
        const w = window.__tycoonWorld;
        const q = kind === 'tile' ? w.projectTile(...args) : w.projectEdge(...args);
        const el = document.elementFromPoint(q.x, q.y);
        return { ...q, onCanvas: !!el && el.tagName === 'CANVAS' };
      }, [kind, args]);
      if (p.onCanvas && p.visible) { await page.mouse.click(p.x, p.y); await page.waitForTimeout(160); return true; }
    }
    return false;
  }
  const tile = (c, r) => tapWorld('tile', c, r);
  const edge = (c, r, s) => tapWorld('edge', c, r, s);
  const toolBtn = (n) => page.getByRole('toolbar', { name: 'Build tools' }).getByRole('button', { name: n, exact: true });
  /** Picks a tool (never toggling an active one off). */
  const tool = async (n) => {
    await clearOverlays();
    if (await page.getByRole('dialog').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    if ((await toolBtn(n).getAttribute('aria-pressed')) !== 'true') await toolBtn(n).click();
    await page.waitForTimeout(150);
  };
  const btn = (name) => page.getByRole('button', { name });
  const panel = () => page.locator('section[aria-label="Build mode"]').innerText();
  async function room(c0, r0, c1, r1, type, group) {
    log('room', type);
    await tool('Rooms');
    await tile(c0, r0); await tile(c1, r1);
    await btn(/^Build room/).click();
    await page.waitForTimeout(150);
    await clearOverlays();
    await btn(type).first().click();
    if (group) await btn(group).first().click();
    await page.waitForTimeout(150);
    await clearOverlays();
  }
  async function door(c, r, s) { log('door', c, r, s); await tool('Doors'); await edge(c, r, s); await btn(/^Add door/).click(); await page.waitForTimeout(120); await clearOverlays(); }
  /** Picks an item from the catalog (opening it as needed) and places it on each square. */
  async function item(toolName, name, spots) {
    log('item', name);
    await clearOverlays();
    if (!(await page.getByRole('dialog').count())) {
      if ((await toolBtn(toolName).getAttribute('aria-pressed')) === 'true') await btn('Cancel').click();
      else await toolBtn(toolName).click();
      await page.waitForTimeout(250);
    }
    await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(300);
    for (const [c, r] of spots) { await tile(c, r); await page.getByRole('button', { name: 'Place', exact: true }).click(); await page.waitForTimeout(150); await clearOverlays(); }
  }
  return { ctx, page, errors, st, f, fresh, clearOverlays, tile, edge, tool, btn, panel, room, door, item };
}

/** The guided start, built by tapping the 3D view. */
async function guidedStart(s, label) {
  const { page, f, fresh, tool, btn, room, door, item, tile, clearOverlays } = s;
  await fresh();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await room(16, 22, 19, 24, 'Lobby');
  await door(18, 24, 'S');
  await tool('Paths'); await tile(18, 25); await tile(18, 26); await btn(/^Done · 2 squares/).click(); await clearOverlays();
  await item('Furniture', 'Front Desk Counter', [[16, 24]]);
  await item('Furniture', 'Waiting Bench', [[16, 22]]);
  await room(20, 22, 22, 24, 'Playroom', 'Small & Gentle');
  await door(20, 23, 'W');
  await item('Furniture', 'Dog Bed', [[21, 24], [22, 24]]);
  await item('Furniture', 'Water Bowl', [[22, 23]]);
  await room(13, 22, 15, 23, 'Calm-Down Room');
  await door(16, 23, 'W');
  let fac = await f();
  check(`${label}: guided build — lobby, playroom and calm room with doors, path, counter, bench, 2 beds, bowl`,
    fac.rooms.map((r) => r.type).join(',') === 'lobby,playroom,calm' && fac.items.filter((i) => i.kind === 'dog_bed').length === 2 && fac.items.some((i) => i.kind === 'front_counter') && fac.items.some((i) => i.kind === 'bench') && fac.items.some((i) => i.kind === 'water_bowl'),
    JSON.stringify(fac.rooms.map((r) => [r.type, r.doors.length])));
  // paint the lobby
  await tool('Paint');
  await tile(17, 23);
  await btn('Tile').click(); await page.getByRole('button', { name: 'Wall colour 3' }).click(); await btn('Apply paint').click();
  await page.waitForTimeout(200);
  fac = await f();
  check(`${label}: painting the lobby`, fac.rooms[0].floor === 'tile' && (await s.st()).guide.painted === true);
  await page.getByRole('button', { name: 'Done building' }).click();
  // open, first pup through the whole loop
  const sw = page.getByRole('switch', { name: 'Open for business' });
  check(`${label}: can open once the guided build is done`, !(await sw.isDisabled()));
  await sw.click();
  await page.evaluate(() => window.__tycoonSet((st) => ({ ...st, facilities: { f1: { ...st.facilities.f1, clockMin: 480 } } })));
  await page.evaluate(() => window.__tycoonArrive('small', 'gentle'));
  await page.waitForTimeout(300);
  const pup = (await f()).dogs[0];
  const desk = page.getByRole('region', { name: 'Front desk' });
  await desk.getByRole('button', { name: `Check in ${pup.name}` }).click();
  await clearOverlays();
  await page.getByRole('article', { name: pup.name }).getByRole('button', { name: /^To Small & Gentle/ }).click();
  await clearOverlays();
  await page.getByRole('article', { name: pup.name }).getByRole('button', { name: 'Playtime' }).click();
  const coins0 = (await s.st()).coins;
  await page.getByRole('article', { name: pup.name }).getByRole('button', { name: 'Check out' }).click();
  await page.waitForTimeout(300);
  await clearOverlays();
  const after = await s.st();
  check(`${label}: check in → playroom → playtime → checkout pays`, !after.facilities.f1.dogs.some((d) => d.id === pup.id) && after.coins > coins0 && after.facilities.f1.stats.checkouts === 1, `+${after.coins - coins0}`);
  const claim = page.getByRole('button', { name: /^Claim \+200/ });
  const c1 = (await s.st()).coins;
  if (await claim.count()) await claim.click();
  await page.waitForTimeout(200);
  check(`${label}: guide reward +200 once`, (await s.st()).coins === c1 + 200 && (await s.st()).guide.done === true);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // ---- Pixel 7: the guided start ----
  const px = await session(browser, 'Pixel 7');
  try { await guidedStart(px, 'Pixel 7'); } catch (e) { check('Pixel 7: guided start ran', false, String(e).split('\n')[0]); }
  check('Pixel 7: no page errors', px.errors.length === 0, px.errors.slice(0, 3).join(' | '));
  await px.ctx.close();

  // ---- iPhone 13: everything ----
  const s = await session(browser, 'iPhone 13');
  const { page, f, st, tool, tile, btn, panel, clearOverlays } = s;
  try { await guidedStart(s, 'iPhone 13'); } catch (e) { check('iPhone 13: guided start ran', false, String(e).split('\n')[0]); }

  try {
    // close for the build checks, so a new arrival can't stand on a square we tap
    await page.evaluate(() => window.__tycoonSet((st) => ({ ...st, facilities: { f1: { ...st.facilities.f1, open: false, dogs: [] } } })));
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await tool('Rooms');
    await tile(17, 21); await tile(18, 23);
    const p = await panel();
    check('a room over another room is red with the reason', /Overlaps the Lobby\./.test(p) && (await btn(/^Build room/).isDisabled()), p.replace(/\n/g, ' / ').slice(0, 120));
    log('overlap ok');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // the playroom is reached only through the lobby door; selling a path square disconnects both
    let fac = await f();
    const play = fac.rooms.find((r) => r.type === 'playroom');
    await page.getByRole('button', { name: 'Done building' }).click();
    await tile(21, 23);
    const playPanel = await page.locator('section[aria-label^="Edit Playroom"]').innerText().catch(() => '');
    check('a door between rooms connects the inner room', !!play && !/Not connected/.test(playPanel), playPanel.slice(0, 80));
    await page.getByRole('button', { name: 'Close' }).click().catch(() => {});
    log('sell path');
    await tile(18, 26);
    await btn('Sell').click(); await btn('Yes, sell').click();
    await page.waitForTimeout(200);
    await tile(17, 23);
    const lobbyPanel = await page.locator('section[aria-label^="Edit Lobby"]').innerText().catch(() => '');
    check('selling a path square shows "Not connected"', /Not connected/.test(lobbyPanel), lobbyPanel.slice(0, 80));
    await page.getByRole('button', { name: 'Close' }).click().catch(() => {});
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await tool('Paths'); await tile(18, 26); await btn(/^Done · 1 square/).click(); await clearOverlays();

    // upgrade, move, sell
    log('play yard');
    await s.item('Outdoor', 'Play Yard', [[11, 25]]);
    await page.getByRole('button', { name: 'Done building' }).click();
    await tile(11, 25);
    await btn(/^Upgrade · 360/).click(); await page.waitForTimeout(200);
    fac = await f();
    let yard = fac.items.find((i) => i.kind === 'play_yard');
    check('upgrading a play yard to level 2', yard && yard.level === 2);
    log('move');
    await btn('Move').click();
    await tile(11, 19); await btn('Place').click(); await page.waitForTimeout(200);
    yard = (await f()).items.find((i) => i.kind === 'play_yard');
    check('moving it', yard && yard.c === 11 && yard.r === 19, yard && `${yard.c},${yard.r}`);
    await page.getByRole('button', { name: 'Done building' }).click();
    await tile(11, 19);
    await btn('Sell').click();
    const confirmText = await page.getByText(/^Sell the Play Yard for \d+ coins\?$/).innerText();
    await btn('Yes, sell').click(); await page.waitForTimeout(200);
    check('selling it, after a confirmation showing the refund', !(await f()).items.some((i) => i.kind === 'play_yard') && /420 coins/.test(confirmText), confirmText);
  } catch (e) { check('build checks ran', false, String(e).split('\n')[0]); }

  // finances
  try {
    await clearOverlays();
    await page.getByRole('button', { name: /^Finances/ }).click();
    await page.getByRole('tab', { name: 'Prices' }).click();
    await page.evaluate(() => {
      const el = document.querySelector('input[aria-label="Daycare day price"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, '80');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    check('a price change shows the demand hint', await page.getByRole('group', { name: 'Daycare day' }).getByText('Above fair: fewer dogs will come').isVisible() && (await f()).prices.daycare === 80);
    await page.evaluate(() => {
      const el = document.querySelector('input[aria-label="Daycare day price"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '40');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('tab', { name: 'Upkeep' }).click();
    const t0 = Number(await page.getByTestId('upkeep-total').innerText());
    await page.getByRole('switch', { name: 'Front Desk Counter open' }).click();
    const t1 = Number(await page.getByTestId('upkeep-total').innerText());
    await page.getByRole('switch', { name: 'Front Desk Counter open' }).click();
    check('closing an item lowers the daily upkeep', t1 === t0 - 6, `${t0} → ${t1}`);
    await page.getByRole('tab', { name: 'Marketing' }).click();
    const c0 = (await st()).coins;
    await page.getByRole('button', { name: /^Start Flyers/ }).click();
    check('starting Flyers costs 150', (await st()).coins === c0 - 150 && (await f()).campaign.id === 'flyers');
    await page.keyboard.press('Escape');
    // play three days fast (open, so the day clock runs)
    await page.evaluate(() => window.__tycoonSet((st) => ({ ...st, facilities: { f1: { ...st.facilities.f1, open: true } } })));
    await page.evaluate(() => { window.__tycoonSpeed = 64; });
    const day0 = (await f()).day;
    const start = Date.now();
    while ((await f()).day < day0 + 3 && Date.now() - start < 90000) { await clearOverlays(); await page.waitForTimeout(500); }
    await page.evaluate(() => { window.__tycoonSpeed = 1; });
    await clearOverlays();
    await page.getByRole('button', { name: /^Finances/ }).click();
    await page.getByRole('tab', { name: 'Summary' }).click();
    const bars = await page.locator('svg[role="img"] path').count();
    check('3 game days later the profit chart has a bar per day', bars >= 3, `${bars} bars, day ${(await f()).day}`);
    await page.keyboard.press('Escape');
  } catch (e) { check('finance checks ran', false, String(e).split('\n')[0]); }

  // below zero, land, level-up
  try {
    await clearOverlays();
    await page.evaluate(() => window.__tycoonSet({ coins: -36 }));
    await page.waitForTimeout(200);
    check('the below-zero banner', await page.getByText('Coins below zero: building is paused until income brings you back above zero').isVisible());
    await page.evaluate(() => window.__tycoonSet({ coins: 5000, xp: 300 }));
    await clearOverlays();
    if (!(await page.getByRole('toolbar', { name: 'Build tools' }).count())) await page.getByRole('button', { name: 'Build', exact: true }).click();
    await tool('Land');
    await page.getByRole('button', { name: 'Buy West lot for 1,500 coins' }).click();
    await page.waitForTimeout(200);
    check('buying West land at level 3', (await f()).land.includes('west'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__tycoonSet({ pendingLevel: 5 }));
    await page.waitForTimeout(1400); // the unlock cards flip in
    const lvDialog = await page.getByRole('dialog', { name: 'Level 5!' }).isVisible();
    const confetti = await page.getByTestId('confetti').count();
    const agility = await page.getByRole('dialog', { name: 'Level 5!' }).getByText('Agility Course').isVisible().catch(() => false);
    check('level-up overlay with confetti and unlock cards', lvDialog && confetti === 1 && agility, `dialog ${lvDialog}, confetti ${confetti}, cards ${agility}`);
    await btn('Continue').click();
    await page.evaluate(() => { const k = 'pawtastic-settings-v1'; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.reducedMotion = true; localStorage.setItem(k, JSON.stringify(v)); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    await page.evaluate(() => window.__tycoonSet({ pendingLevel: 6 }));
    await page.waitForTimeout(200);
    check('level-up overlay with reduced motion: no confetti', await page.getByRole('dialog', { name: 'Level 6!' }).isVisible() && (await page.getByTestId('confetti').count()) === 0);
    await btn('Continue').click();
  } catch (e) { check('banner/land/level checks ran', false, String(e).split('\n')[0]); }

  // the sign card
  try {
    await clearOverlays();
    log('sign: dialogs', await page.getByRole('dialog').count(), 'toolbar', await page.getByRole('toolbar', { name: 'Build tools' }).count());
    if (!(await page.getByRole('toolbar', { name: 'Build tools' }).count())) await page.getByRole('button', { name: 'Build', exact: true }).click();
    await s.item('Outdoor', 'PAWtastic Academy Sign', [[12, 26]]);
    log('sign placed?', JSON.stringify((await f()).items.filter((i) => i.kind === 'sign')));
    await page.getByRole('button', { name: 'Done building' }).click();
    await tile(12, 26);
    log('after tap: dialogs', await page.getByRole('dialog').count());
    const link = page.getByRole('link', { name: 'Book a free evaluation in Hillsdale' });
    const href = await link.getAttribute('href');
    const [popup] = await Promise.all([page.context().waitForEvent('page').catch(() => null), link.click()]);
    if (popup) await popup.close();
    const evs = await page.evaluate(() => (window.__pawtasticEvents || []).filter((e) => e.name === 'booking_click'));
    check('the sign card books through the real link and records a click (not a booking)', /pawtasticacademy\.com\/booking-page\?/.test(href) && evs.some((e) => e.props.from === 'tycoon-sign' && e.props.location === 'hillsdale'), href);
    await page.keyboard.press('Escape');
  } catch (e) { check('sign card check ran', false, String(e).split('\n')[0]); }

  // frame rate: 12 rooms, 200 things
  try {
    await clearOverlays();
    await page.evaluate(() => window.__tycoonStress());
    await page.waitForTimeout(1500);
    const fac = await f();
    await page.evaluate(() => document.querySelector('section[aria-label="3D daycare view"] canvas').scrollIntoView({ block: 'center' }));
    const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const step = (t) => { n++; if (t - t0 < 3000) requestAnimationFrame(step); else res((n * 1000) / (t - t0)); }; requestAnimationFrame(step); }));
    const info = await page.evaluate(() => window.__tycoonWorld.debugInfo());
    check('frame rate with 12 rooms, 200 things and 30 dogs ≥ 30 fps', fac.rooms.length === 12 && fac.items.length === 200 && fac.dogs.length === 30 && info.dogs.length === 30 && fps >= 30, `${fac.rooms.length} rooms, ${fac.items.length} things, ${info.dogs.length} dogs, ${fps.toFixed(1)} fps, render ${info.frameMs.toFixed(1)} ms, ${info.calls} draw calls`);
  } catch (e) { check('frame-rate check ran', false, String(e).split('\n')[0]); }
  check('iPhone 13: no page errors', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
  await s.ctx.close();

  // ---- the list view plays the same loop ----
  const l = await session(browser, 'iPhone 13');
  try {
    await l.fresh({ view: 'list' });
    const place = async (n) => { await l.page.getByRole('button', { name: `Place ${n} in first free spot` }).click(); await l.page.waitForTimeout(100); await l.clearOverlays(); };
    const tabL = (n) => l.page.getByRole('tab', { name: n }).click();
    await place('Lobby'); await tabL('furniture'); await place('Front Desk Counter'); await place('Waiting Bench');
    await tabL('rooms'); await place('Playroom — Small & Gentle');
    await tabL('furniture'); await place('Dog Bed'); await place('Dog Bed'); await place('Water Bowl');
    await tabL('rooms'); await place('Calm-Down Room');
    check('list view: no 3D canvas, full builder', (await l.page.locator('canvas').count()) === 0);
    await l.page.getByRole('switch', { name: 'Open for business' }).click();
    await l.page.evaluate(() => window.__tycoonSet((st) => ({ ...st, facilities: { f1: { ...st.facilities.f1, clockMin: 480 } } })));
    await l.page.evaluate(() => window.__tycoonArrive('small', 'gentle'));
    await l.page.waitForTimeout(200);
    const pup = (await l.f()).dogs[0];
    await l.page.getByRole('button', { name: `Check in ${pup.name}` }).click(); await l.clearOverlays();
    await l.page.getByRole('article', { name: pup.name }).getByRole('button', { name: /^To Small & Gentle/ }).click(); await l.clearOverlays();
    await l.page.getByRole('article', { name: pup.name }).getByRole('button', { name: 'Playtime' }).click();
    const c0 = (await l.st()).coins;
    await l.page.getByRole('article', { name: pup.name }).getByRole('button', { name: 'Check out' }).click();
    await l.page.waitForTimeout(200);
    check('list view plays the same loop (build, open, check in, play, check out)', (await l.f()).stats.checkouts === 1 && (await l.st()).coins > c0);
  } catch (e) { check('list view check ran', false, String(e).split('\n')[0]); }
  check('list view: no page errors', l.errors.length === 0, l.errors.slice(0, 3).join(' | '));
  await l.ctx.close();

  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(2); });
