// Connecting rooms on narrow touch screens (milestone "make PAWtastic feel like a daycare tycoon" §3): choose the room
// → tap a spot → see its connection and total → change your mind, try a blocked spot (the reason is shown next to the
// placement and the room you picked stays picked), pick another entrance, Cancel (free), reopen, reload mid-placement
// (nothing charged, time stays held), then confirm → the new room's panel says connected / furnished / staffed /
// operating. SIMULATED phones in Chromium (iPhone SE 375 × 667 and iPhone 13, software WebGL) — not a real iPhone.
// The daycare is set up with the DEV hook (__tycoonSet: coins and level for building) — a builder check, not the
// first-session proof (that's qa/first-session.cjs, which injects nothing). Needs the dev server.
// Run: NODE_PATH=/opt/node-tools/node_modules node qa/e2e-connect.cjs [base-url]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'e2e-connect');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + String(detail).slice(0, 220) : ''}`); };

async function run(browser, device) {
  const tag = device.replace(/\s+/g, '-');
  const ctx = await browser.newContext({ ...devices[device] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());
  const f = async () => (await st()).facilities.f1;
  const btn = (name) => page.getByRole('button', { name });
  const mode = () => page.locator('section[aria-label="Build mode"]');
  const bar = () => page.locator('section[aria-label="Build mode"] section[aria-label="Choose a spot"]');
  async function load() {
    for (let i = 0; i < 4; i++) {
      try {
        await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!window.__tycoonWorld && !!window.__tycoonState(), null, { timeout: 15000 });
        return;
      } catch { await page.waitForTimeout(2000); }
    }
  }
  async function clearOverlays() {
    for (let i = 0; i < 5; i++) {
      const c = page.getByRole('button', { name: 'Continue' });
      if (await c.count()) { await c.first().click(); await page.waitForTimeout(200); continue; }
      const day = page.getByRole('button', { name: /^Start day/ });
      if (await day.count()) { await day.first().click(); await page.waitForTimeout(200); continue; }
      break;
    }
  }
  async function tile(c, r) {
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const block of ['center', 'end', 'start']) {
        await page.evaluate((b) => document.querySelector('section[aria-label="3D daycare view"] canvas').scrollIntoView({ block: b }), block);
        await page.waitForTimeout(160);
        const p = await page.evaluate(([c, r]) => {
          const q = window.__tycoonWorld.projectTile(c, r);
          const el = document.elementFromPoint(q.x, q.y);
          return { ...q, onCanvas: !!el && el.tagName === 'CANVAS' };
        }, [c, r]);
        if (p.onCanvas && p.visible) { await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(250); return true; }
      }
      await btn('Reset camera').click().catch(() => {});
      await page.waitForTimeout(400);
    }
    return false;
  }
  const barText = async () => (await bar().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const pickPlayroom = async (group) => {
    await mode().getByRole('toolbar', { name: 'Build tools' }).getByRole('button', { name: 'Rooms', exact: true }).tap();
    const choose = page.getByRole('region', { name: 'Choose a room to build' });
    await choose.getByRole('button', { name: 'Playroom', exact: true }).tap();
    await choose.getByRole('button', { name: group, exact: true }).tap();
    await page.waitForTimeout(200);
  };

  try {
    await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false })); });
    await load();
    await page.getByRole('region', { name: 'Start your daycare' }).getByRole('button', { name: /Quick start/ }).tap();
    await page.waitForTimeout(500);
    await btn('Skip guide').tap();
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__tycoonSet((s) => ({ ...s, coins: 5000, xp: 1000, pendingLevel: null, facilities: { f1: { ...s.facilities.f1, dogs: [] } } })));
    await page.waitForTimeout(300);
    await clearOverlays();
    const coins0 = (await st()).coins;
    const rooms0 = (await f()).rooms.length;

    // choose the room first
    await btn('Build').tap();
    await page.waitForTimeout(300);
    await pickPlayroom('Small & Active');
    check(`${device}: the room picked is named in the placement bar`, /Placing: Playroom · Small & Active/.test(await barText()), await barText());
    // a blocked spot: the reason next to the placement, no Build here, and the room choice stays
    await tile(18, 23);
    let t = await barText();
    check(`${device}: a blocked spot says why, next to the placement, and offers no Build here`, /Overlaps/.test(t) && !(await bar().getByRole('button', { name: /^Build here/ }).count()), t);
    check(`${device}: after the error the room you picked is still picked`, /Placing: Playroom · Small & Active/.test(t), t);
    await page.screenshot({ path: path.join(OUT, `${tag}-1-blocked.png`) });
    // a spot beside the lobby: connection and the full total before confirming
    await tile(17, 20);
    t = await barText();
    const nearPrice = Number((t.match(/Build here · ([\d,]+)/) ?? [0, '0'])[1].replace(/,/g, ''));
    check(`${device}: a spot beside a room shows its connection and the full total`, /✓/.test(t) && nearPrice > 0, t);
    await page.screenshot({ path: path.join(OUT, `${tag}-2-snap.png`) });
    // change your mind: a separated spot gets a path to the entrance, priced
    await tile(12, 18);
    t = await barText();
    check(`${device}: changing your mind moves the plan (a separated spot gets a priced path)`, /path/i.test(t) && /Build here/.test(t), t);
    // another entrance, when there is one
    if (await bar().getByRole('button', { name: 'Next entrance' }).count()) {
      const before = await barText();
      await bar().getByRole('button', { name: 'Next entrance' }).tap();
      await page.waitForTimeout(200);
      const after = await barText();
      check(`${device}: Next entrance shows another way in with its own total`, /Entrance 2 of \d/.test(after) && before !== after, after);
      await page.screenshot({ path: path.join(OUT, `${tag}-3-entrance.png`) });
    } else check(`${device}: (this spot has one way in — no entrance choice offered)`, true);
    // Cancel: nothing charged, nothing built
    await bar().getByRole('button', { name: 'Cancel', exact: true }).tap().catch(async () => mode().getByRole('button', { name: 'Cancel', exact: true }).first().tap());
    await page.waitForTimeout(200);
    check(`${device}: Cancel charges nothing and builds nothing`, (await st()).coins === coins0 && (await f()).rooms.length === rooms0);
    // reopen: Done building, Build again, the same choice gives the same price at the same spot
    await btn('Done building').tap().catch(() => {});
    await page.waitForTimeout(300);
    await btn('Build').tap();
    await page.waitForTimeout(300);
    await pickPlayroom('Small & Active');
    await tile(17, 20);
    t = await barText();
    const again = Number((t.match(/Build here · ([\d,]+)/) ?? [0, '0'])[1].replace(/,/g, ''));
    check(`${device}: reopened, the same spot quotes the same total`, again === nearPrice && again > 0, `${nearPrice} → ${again}`);
    // reload with the placement shown but not confirmed: nothing charged, and time stays held
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState(), null, { timeout: 15000 });
    await page.waitForTimeout(600);
    const g0 = await f();
    await page.waitForTimeout(2000);
    const g1 = await f();
    check(`${device}: reload mid-placement charges nothing and builds nothing`, (await st()).coins === coins0 && g1.rooms.length === rooms0);
    check(`${device}: after that reload the day stays paused (no catch-up)`, g1.clockMin === g0.clockMin && g1.day === g0.day, `${g0.clockMin} → ${g1.clockMin}`);
    await clearOverlays();
    // confirm: the room is built, connected, and its panel tells connected / furnished / staffed / operating apart
    await btn('Build').tap();
    await page.waitForTimeout(300);
    await pickPlayroom('Small & Active');
    await tile(17, 20);
    t = await barText();
    const price = Number((t.match(/Build here · ([\d,]+)/) ?? [0, '0'])[1].replace(/,/g, ''));
    const c1 = (await st()).coins;
    await bar().getByRole('button', { name: /^Build here/ }).tap();
    await page.waitForTimeout(700);
    const g2 = await f();
    const room = g2.rooms.at(-1);
    check(`${device}: Build here builds one connected room for exactly the price shown`, g2.rooms.length === rooms0 + 1 && c1 - (await st()).coins === price && room.doors.length >= 1, `${price} charged ${c1 - (await st()).coins}`);
    const ready = (await page.locator('ol[aria-label="Room readiness"]').first().innerText().catch(() => '')).replace(/\n+/g, ' · ');
    check(`${device}: the new room's panel tells connected, furnished, staffed and operating apart`, /Connected/i.test(ready) && /urnish/i.test(ready) && /taff/i.test(ready) && /perat/i.test(ready), ready);
    await page.screenshot({ path: path.join(OUT, `${tag}-4-built.png`) });
    check(`${device}: no page errors`, errors.length === 0, errors.join(' | '));
  } catch (e) {
    check(`${device}: run finished`, false, String(e).split('\n')[0]);
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const d of ['iPhone SE', 'iPhone 13']) await run(browser, d);
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  process.exit(failed.length ? 1 : 0);
})();
