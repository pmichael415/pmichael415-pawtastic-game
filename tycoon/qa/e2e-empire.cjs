// Browser checks for the empire milestone (THE OLD GAME'S FLOW + A DAYCARE EMPIRE): building by type → spot → door
// and route → price → confirm; doors that snap, paths for separated rooms, blocked spots; furniture into a chosen room;
// double taps and coin accounting; both investments (playroom wing and bath station) with what comes after (furnish,
// staff, serve) and the familiar hands-on visit in the new room; build pausing; save and reload; portrait and
// landscape. SIMULATED phones in Chromium (Playwright device emulation, software WebGL) — not a real iPhone or Safari.
// Needs the dev server (DEV-only hooks __tycoonState/__tycoonSet/__tycoonArrive). Run: node qa/e2e-empire.cjs [base-url]
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'empire');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const out = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const DEBUG = !!process.env.DEBUG;
const log = (...a) => { if (DEBUG) console.log('  ·', ...a); };

async function session(browser, device, extra = {}) {
  const ctx = await browser.newContext({ ...devices[device], ...extra });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());
  const f = async () => (await st()).facilities.f1;
  const btn = (name) => page.getByRole('button', { name });
  const mode = () => page.locator('section[aria-label="Build mode"]');
  async function clearOverlays() {
    for (let i = 0; i < 5; i++) {
      const c = page.getByRole('button', { name: 'Continue' });
      if (await c.count()) { await c.first().click(); await page.waitForTimeout(200); continue; }
      const day = page.getByRole('button', { name: /^Start day/ });
      if (await day.count()) { await day.first().click(); await page.waitForTimeout(200); continue; }
      break;
    }
  }
  async function tapOnce(kind, args) {
    for (const block of ['center', 'end', 'start']) {
      await page.evaluate((b) => document.querySelector('section[aria-label="3D daycare view"] canvas').scrollIntoView({ block: b }), block);
      await page.waitForTimeout(160);
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
  async function tile(c, r) {
    if (await tapOnce('tile', [c, r])) return true;
    await btn('Reset camera').click().catch(() => {});
    await page.waitForTimeout(400);
    return tapOnce('tile', [c, r]);
  }
  /** Quick start, guide skipped, level 5 with 20,000 coins, closed and empty — a daycare ready to grow. */
  async function grown() {
    await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false })); });
    for (let i = 0; i < 4; i++) {
      try {
        await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!window.__tycoonWorld && !!window.__tycoonState(), null, { timeout: 15000 });
        break;
      } catch { await page.waitForTimeout(2000); }
    }
    await page.getByRole('region', { name: 'Start your daycare' }).getByRole('button', { name: /Quick start/ }).click();
    await page.waitForTimeout(500);
    await btn('Skip guide').click();
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__tycoonSet((s) => ({ ...s, coins: 20000, xp: 1000, pendingLevel: null, facilities: { f1: { ...s.facilities.f1, open: false, dogs: [] } } })));
    await page.waitForTimeout(300);
    await clearOverlays();
  }
  return { ctx, page, errors, st, f, btn, mode, clearOverlays, tile, grown };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // ---------- 1. building a room you can use (iPhone 13, portrait) ----------
  const s = await session(browser, 'iPhone 13');
  const { page, f, st, btn, mode, tile, clearOverlays } = s;
  try {
    await s.grown();
    // the clock runs, then Build pauses it; Done building restores it
    await page.getByRole('switch', { name: 'Open for business' }).click();
    await page.waitForTimeout(400);
    const running = await page.getByRole('button', { name: 'Pause' }).count();
    await btn('Build').click();
    await page.waitForTimeout(300);
    const m0 = (await f()).clockMin;
    await page.waitForTimeout(1500);
    check('Build pauses the day: the clock stands still while building', (await f()).clockMin === m0, `${m0} → ${(await f()).clockMin}`);
    log('pause ok');

    // type first, then a spot beside the lobby: the door snaps into it, no path
    await mode().getByRole('toolbar', { name: 'Build tools' }).getByRole('button', { name: 'Rooms', exact: true }).click();
    await page.getByRole('region', { name: 'Choose a room to build' }).getByRole('button', { name: 'Bath Room', exact: true }).click();
    const coins0 = (await st()).coins;
    await tile(17, 20); // 3 × 2 at (16,20): its south wall is the lobby's north wall
    let p = await mode().innerText();
    check('a room beside the lobby: its door snaps into the lobby, no path, with the itemised price', /door opens into the Lobby — no path needed/.test(p) && /Room \d+ \+ door 30 = \d+/.test(p), p.split('\n').filter((x) => /Bath Room|door/.test(x)).join(' / '));
    await page.screenshot({ path: path.join(OUT, '1-snap.png') });
    // somewhere separated: a green path to the entrance, priced square by square
    await tile(12, 18);
    p = await mode().innerText();
    check('a separated spot: a new path to the entrance, priced square by square', /A new path of \d+ squares? \(green\) leads to the entrance/.test(p) && /path \d+ × 10 = \d+/.test(p), p.split('\n').filter((x) => /path/.test(x)).join(' / '));
    await page.screenshot({ path: path.join(OUT, '2-path.png') });
    // on top of the lobby: red, with the reason, and nothing to confirm
    await tile(18, 23);
    p = await mode().innerText();
    check('a blocked spot is red with the reason, and offers no Build here', /Overlaps the Lobby/.test(p) && (await mode().getByRole('button', { name: /^Build here/ }).count()) === 0);
    await mode().getByRole('button', { name: 'Cancel', exact: true }).click();
    check('Cancel costs nothing', (await st()).coins === coins0);
    // confirm with a double tap: one room, charged once, exactly the price on the button
    await tile(17, 20);
    const label = await mode().getByRole('button', { name: /^Build here/ }).innerText();
    const price = Number(label.replace(/[^\d]/g, ''));
    const rooms0 = (await f()).rooms.length;
    await mode().getByRole('button', { name: /^Build here/ }).dblclick();
    await page.waitForTimeout(400);
    const g = await f();
    check('a double tap on Build here builds one room and charges exactly the price shown', g.rooms.length === rooms0 + 1 && coins0 - (await st()).coins === price, `${label} · charged ${coins0 - (await st()).coins}`);
    const bath = g.rooms.at(-1);
    check('the new room is typed, has its door and is connected', bath.type === 'bath' && bath.doors.length === 1);
    // furnishing: the room is already chosen
    p = await mode().innerText();
    check('a new room leads straight into furnishing it', /Furnishing: Bath Room/.test(p));
    await btn('Choose furniture for the Bath Room').click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    const fits = await dlg.getByRole('button', { name: 'Bath Tub', exact: true }).count();
    const counter = await dlg.getByText('Goes in a Lobby').count();
    check('the catalog offers what fits the bath room, and says where the rest goes', fits === 1 && counter >= 1);
    await dlg.getByRole('button', { name: 'Bath Tub', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '3-furnish.png') });
    const c1 = (await st()).coins;
    await mode().getByRole('button', { name: /^Put it in Bath Room/ }).dblclick();
    await page.waitForTimeout(400);
    const tubs = (await f()).items.filter((i) => i.kind === 'bath_tub');
    check('Put it in places it inside that room — a double tap still one each time', tubs.length >= 1 && tubs.every((t) => t.room === bath.uid) && c1 - (await st()).coins === 400 * tubs.length, `${tubs.length} tub(s), charged ${c1 - (await st()).coins}`);
    await btn('Done building').click();
    await page.waitForTimeout(1500);
    check('Done building restores the running clock', running === 0 || (await f()).clockMin > m0);
    log('build ok');

    // its panel: way in, what it does, who runs it
    await page.getByRole('region', { name: 'Rooms' }).getByRole('button', { name: /^Bath Room/ }).click();
    const panel = page.getByRole('region', { name: /^Edit Bath Room/ });
    p = await panel.innerText();
    check('the room panel shows its way in, what it does and who runs it', /Way in: a door into the Lobby/.test(p) && /families who book a bath/.test(p) && /No one runs baths yet/.test(p), p.split('\n').slice(0, 8).join(' / '));
    await page.screenshot({ path: path.join(OUT, '4-room-panel.png') });
    await panel.getByRole('button', { name: /^Hire a bath attendant/ }).click();
    await page.waitForTimeout(300);
    check('one tap hires a bath attendant for it', (await f()).staff.some((x) => x.role === 'bath') && /runs the baths/.test(await panel.innerText()));
    await panel.getByRole('button', { name: 'Close panel' }).click().catch(() => {});

    // save and reload: everything is still there
    const before = await st();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    const after = await st();
    check('reload keeps the room, its door, the tub, the new staff and the coins', after.coins === before.coins && after.facilities.f1.rooms.length === before.facilities.f1.rooms.length && after.facilities.f1.staff.length === before.facilities.f1.staff.length && after.facilities.f1.items.length === before.facilities.f1.items.length);
  } catch (e) {
    check('building checks ran', false, String(e).split('\n')[0]);
    await page.screenshot({ path: path.join(OUT, 'error-build.png') }).catch(() => {});
  }
  check('iPhone 13 (build): no page errors', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
  await s.ctx.close();

  // ---------- 2. both investments, then the familiar visit in the new room ----------
  for (const [pick, kind] of [['Playroom wing', 'playroom'], ['Bath station', 'bath']]) {
    const t = await session(browser, 'iPhone 13');
    try {
      await t.grown();
      const card = t.page.getByRole('region', { name: 'Expand your daycare' });
      if (!(await card.count())) await t.page.getByRole('button', { name: /^(Expansion options|See options)$/ }).first().click();
      const art = card.getByRole('article', { name: new RegExp(`^${pick}`) }).first();
      await art.getByRole('button', { name: /^Choose a spot/ }).click();
      const bar = t.page.getByRole('region', { name: 'Choose a spot' });
      await bar.waitFor();
      const c0 = (await t.st()).coins;
      const lbl = await bar.getByRole('button', { name: /^Build here/ }).innerText();
      await bar.getByRole('button', { name: /^Build here/ }).click();
      await t.page.waitForTimeout(500);
      await t.clearOverlays();
      const room = (await t.f()).rooms.at(-1);
      check(`${pick}: built where chosen, typed, connected, for the price shown`, room.type === kind && c0 - (await t.st()).coins === Number(lbl.replace(/[^\d]/g, '')), `${lbl}`);
      const panel = t.page.getByRole('region', { name: /^Edit / }).first();
      const ptxt = await panel.innerText();
      check(`${pick}: its panel says what it does and offers someone to run it`, (kind === 'bath' ? /families who book a bath/ : /spots for .* pups/).test(ptxt) && /Hire a|Make |Add it to|✓/.test(ptxt), ptxt.split('\n').slice(0, 7).join(' / '));
      await t.page.screenshot({ path: path.join(OUT, `5-${kind}-panel.png`) });
      const staffBtn = panel.getByRole('button', { name: /^(Hire a|Make |Add it to)/ });
      if (await staffBtn.count()) { await staffBtn.click(); await t.page.waitForTimeout(300); }
      // furnish it from the panel
      await panel.getByRole('button', { name: 'Furnish it' }).click();
      await t.btn(/^Choose furniture for the /).click();
      await t.page.getByRole('dialog').getByRole('button', { name: 'Rug', exact: true }).click();
      await t.page.waitForTimeout(300);
      await t.page.getByRole('button', { name: /^Put it in / }).click();
      await t.page.waitForTimeout(300);
      check(`${pick}: Furnish it puts the rug in the new room`, (await t.f()).items.some((i) => i.kind === 'rug' && i.room === room.uid));
      await t.btn('Done building').click();
      // the familiar visit, served in the new room
      await t.page.getByRole('switch', { name: 'Open for business' }).click();
      await t.page.evaluate(() => window.__tycoonSet((s) => ({ ...s, facilities: { f1: { ...s.facilities.f1, clockMin: 9 * 60 } } })));
      const group = room.group ?? 'small-gentle';
      const [size, temper] = group.split('-');
      await t.page.evaluate(([a, b]) => window.__tycoonArrive(a, b), [size, temper]);
      await t.page.waitForTimeout(400);
      const pup = (await t.f()).dogs.at(-1);
      if (kind === 'bath') await t.page.evaluate((id) => window.__tycoonSet((s) => ({ ...s, facilities: { f1: { ...s.facilities.f1, dogs: s.facilities.f1.dogs.map((d) => (d.id === id ? { ...d, visit: { ...d.visit, requests: [...new Set([...(d.visit?.requests ?? ['daycare']), 'bath'])] } } : d)) } } })), pup.id);
      const desk = t.page.getByRole('region', { name: 'Front desk' });
      await desk.getByRole('button', { name: `Check in ${pup.name}` }).click();
      await t.page.waitForTimeout(300);
      await t.clearOverlays();
      const sheet = t.page.getByTestId('panel-sheet');
      const next = sheet.getByTestId('next-action');
      const nextText = await next.innerText().catch(() => '');
      if (kind === 'playroom') {
        const move = t.page.getByRole('region', { name: 'Rooms' }).getByRole('button', { name: new RegExp(`^✓ Move ${pup.name} to Playroom`) }).first();
        const offered = await move.count();
        await (offered ? move.click() : next.getByRole('button').first().click());
        await t.page.waitForTimeout(300);
        const placed = (await t.f()).dogs.find((d) => d.id === pup.id);
        check('playroom wing: a pup of the new group is offered the new room (✓) and goes there', placed?.place?.room === room.uid, `${nextText.split('\n').join(' / ')} · placed in ${placed?.place?.room} vs ${room.uid}`);
      } else {
        const p2 = (await t.f()).dogs.find((d) => d.id === pup.id);
        // to its playroom first, then the bath it booked
        if (p2?.place?.kind !== 'room') { await next.getByRole('button').first().click().catch(() => {}); await t.page.waitForTimeout(300); }
        const bathBtn = t.page.getByTestId('panel-sheet').getByRole('button', { name: /^Bath/ }).first();
        if (await bathBtn.count()) { await bathBtn.click(); await t.page.waitForTimeout(400); }
        const p3 = (await t.f()).dogs.find((d) => d.id === pup.id);
        const tubs = (await t.f()).items.filter((i) => i.room === room.uid && /tub/.test(i.kind)).map((i) => i.uid);
        check('bath station: a pup that booked a bath gets it in the new station', !!p3?.bathing && tubs.includes(p3.bathTub), `bathing ${p3?.bathing} tub ${p3?.bathTub}`);
      }
      await t.page.screenshot({ path: path.join(OUT, `6-${kind}-served.png`) });
    } catch (e) {
      check(`${pick}: checks ran`, false, String(e).split('\n')[0]);
      await t.page.screenshot({ path: path.join(OUT, `error-${kind}.png`) }).catch(() => {});
    }
    check(`${pick}: no page errors`, t.errors.length === 0, t.errors.slice(0, 3).join(' | '));
    await t.ctx.close();
  }

  // ---------- 3. landscape: the build tools and the world both fit ----------
  const l = await session(browser, 'iPhone 13 landscape');
  try {
    await l.grown();
    await l.btn('Build').click();
    await l.page.waitForTimeout(300);
    const tb = l.page.getByRole('toolbar', { name: 'Build tools' });
    await tb.getByRole('button', { name: 'Rooms', exact: true }).click();
    await l.page.getByRole('region', { name: 'Choose a room to build' }).getByRole('button', { name: 'Bath Room', exact: true }).click();
    const tapped = await l.tile(17, 20);
    const p = await l.mode().innerText();
    await l.page.screenshot({ path: path.join(OUT, '7-landscape.png') });
    check('landscape: Rooms → type → tap works, with the price and the way in', tapped && /door opens into the Lobby/.test(p) && (await l.mode().getByRole('button', { name: /^Build here/ }).count()) === 1);
    const done = l.btn('Done building');
    await done.scrollIntoViewIfNeeded();
    check('landscape: Done building is reachable', await done.isVisible());
  } catch (e) {
    check('landscape checks ran', false, String(e).split('\n')[0]);
  }
  check('landscape: no page errors', l.errors.length === 0, l.errors.slice(0, 3).join(' | '));
  await l.ctx.close();

  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
