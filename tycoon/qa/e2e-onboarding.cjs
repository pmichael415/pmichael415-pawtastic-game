// Browser checks for the new Daycare's first 15 minutes (Stage A, docs/superpowers/specs/2026-11-02-tycoon-replayability-design.md):
// Quick start to the first payout with every beat timed, the upgrade choice and Daisy's bonus naming it, both branches
// of the Rocket decision, the goals, Build from scratch to the first checkout, Chromium with WebGL disabled (notice, map,
// no "drag" wording, the tour still completes) and a reload mid-tour. Timings are AUTOMATION timings (a script tapping
// as fast as the page allows), not human play times. Needs the dev server (DEV-only hooks: __tycoonState,
// __tycoonWorld). Run: node qa/e2e-onboarding.cjs [base-url]
const { chromium, devices } = require('playwright');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-daycare-next-v1';
const OUT = path.join(__dirname, 'out');
let pass = 0, fail = 0; const out = []; const timings = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const IPHONE = { label: 'iPhone 13', opts: devices['iPhone 13'] };
const DESKTOP = { label: 'Desktop 1280×800', opts: { viewport: { width: 1280, height: 800 } } };

async function session(browser, dev, { map = false } = {}) {
  const ctx = await browser.newContext({ ...dev.opts });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());
  const tour = async () => (await st()).tour;
  const dogs = async () => (await st()).facilities.f1.dogs;
  const coach = () => page.getByRole('region', { name: 'Guide' });
  const sheet = () => page.getByTestId('panel-sheet');

  async function fresh() {
    await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead' })); });
    await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    if (map) await page.getByRole('region', { name: 'Daycare map' }).waitFor({ timeout: 15000 });
    else await page.waitForFunction(() => !!window.__tycoonWorld, null, { timeout: 15000 });
  }
  const waitBeat = (beat, timeout = 8000) =>
    page.waitForFunction((b) => window.__tycoonState()?.tour?.beat === b, beat, { timeout }).then(() => true, () => false);

  /** Taps a pup: on the map by its marker, in 3D at its projected position (retrying while it walks). */
  async function tapDog(name) {
    if (map) {
      await page.getByRole('region', { name: 'Daycare map' }).getByRole('button', { name: new RegExp(`^${name}, `) }).click();
      return sheet().waitFor({ timeout: 3000 }).then(() => true, () => false);
    }
    for (let i = 0; i < 10; i++) {
      for (const block of ['center', 'start', 'end']) {
        await page.evaluate((b) => document.querySelector('section[aria-label="3D daycare view"] canvas').scrollIntoView({ block: b }), block);
        await page.waitForTimeout(120);
        const p = await page.evaluate((name) => {
          const d = window.__tycoonState().facilities.f1.dogs.find((x) => x.name === name);
          const w = window.__tycoonWorld;
          const a = d && w.debugInfo().dogs.find((x) => x.id === d.id);
          if (!a) return null;
          const q = w.project(a.x, 0.3, a.z);
          const el = document.elementFromPoint(q.x, q.y);
          return { ...q, onCanvas: !!el && el.tagName === 'CANVAS' };
        }, name);
        if (!p || !p.visible || !p.onCanvas) continue;
        await page.mouse.click(p.x, p.y);
        if (await sheet().getByText(name, { exact: false }).first().waitFor({ timeout: 700 }).then(() => true, () => false)) return true;
      }
      await page.waitForTimeout(250);
    }
    return false;
  }
  const inSheet = (name) => sheet().getByRole('button', { name }).first();

  /** One pup through the care cycle: check in, the matching playroom, playtime, check out. */
  async function careFor(name, group) {
    const steps = {};
    steps.tap = await tapDog(name);
    if (!steps.tap) return steps;
    await inSheet(new RegExp(`^Check in`)).click();
    await page.waitForTimeout(150);
    if (!(await sheet().count())) await tapDog(name);
    await inSheet(new RegExp(`^To ${group.replace(/&/g, '&')}`)).click();
    await page.waitForTimeout(150);
    if (!(await sheet().count())) await tapDog(name);
    await inSheet(/^Playtime/).click();
    await page.waitForTimeout(150);
    if (!(await sheet().count())) await tapDog(name);
    await inSheet(/^Check out/).click();
    await page.waitForTimeout(150);
    steps.gone = !(await dogs()).some((d) => d.name === name);
    return steps;
  }
  const shot = (n) => page.screenshot({ path: path.join(OUT, `onboarding-${n}.png`) }).catch(() => {});
  const shopShown = async () => (await page.getByRole('button', { name: 'Daycare Shop' }).count()) + (await page.getByRole('button', { name: 'Get coins' }).count()) > 0;
  return { ctx, page, errors, st, tour, dogs, coach, sheet, fresh, waitBeat, tapDog, inSheet, careFor, shot, shopShown };
}

/** Quick start through the goals, timing each beat. decision: 'rest' | 'build'. */
async function quickRun(browser, dev, { decision, map = false, reload = false, tag }) {
  const s = await session(browser, dev, { map });
  const L = `${dev.label}${map ? ' · map (no WebGL)' : ' · 3D'}`;
  try {
    await s.fresh();
    const card = s.page.getByRole('region', { name: 'Start your daycare' });
    check(`${L}: a new save shows Quick start and Build from scratch`, (await card.getByRole('button', { name: /Quick start/ }).count()) === 1 && (await card.getByRole('button', { name: /Build from scratch/ }).count()) === 1);
    if (map) {
      check(`${L}: explains why 3D isn't showing`, (await s.page.getByText(/3D isn't available in this browser/).count()) > 0);
      check(`${L}: the 2D map is shown`, (await s.page.getByRole('region', { name: 'Daycare map' }).count()) === 1);
    }
    await s.shot(`${tag}-1-start`);
    const t0 = Date.now();
    const at = {};
    await card.getByRole('button', { name: /Quick start/ }).click();
    await s.waitBeat('checkin');
    at.meet = Date.now() - t0;
    const coachText = await s.coach().innerText();
    check(`${L}: the coach greets Biscuit`, /Meet Biscuit!/.test(coachText), coachText.split('\n')[0]);
    check(`${L}: the coach's instruction matches the controls`, map ? /on the map/.test(coachText) : /in the daycare/.test(coachText));
    check(`${L}: no shop or coin prompts during the tour`, !(await s.shopShown()));
    const first = (await s.dogs()).find((d) => d.name === 'Biscuit');
    const fac = (await s.st()).facilities.f1;
    const pr = fac.rooms.find((r) => r.type === 'playroom');
    check(`${L}: the first pup fits the playroom`, !!first && !!pr && pr.group === `${first.size}-${first.temper}`, `${first?.size}-${first?.temper} vs ${pr?.group}`);
    await s.shot(`${tag}-2-meet`);

    const coins0 = (await s.st()).coins;
    const tapped = await s.tapDog('Biscuit');
    check(`${L}: tapping Biscuit opens the panel over the world`, tapped);
    if (!tapped) throw new Error('could not tap Biscuit');
    await s.inSheet(/^Check in/).click();
    await s.waitBeat('place'); at.checkin = Date.now() - t0;

    let before = [];
    if (reload) {
      before = await s.page.evaluate(() => (window.__pawtasticEvents ?? []).filter((e) => e.name === 'tycoon_guide').map((e) => e.props.beat));
      await s.page.reload({ waitUntil: 'networkidle' });
      await s.page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
      if (!map) await s.page.waitForFunction(() => !!window.__tycoonWorld, null, { timeout: 15000 });
      check(`${L}: a reload mid-tour keeps the same beat`, (await s.tour())?.beat === 'place');
      check(`${L}: …and the same coach line`, /Find Biscuit a playroom/.test(await s.coach().innerText()));
      check(`${L}: …and no start card`, (await s.page.getByRole('region', { name: 'Start your daycare' }).count()) === 0);
      await s.tapDog('Biscuit');
    }
    await s.inSheet(/^To Small & Gentle/).click();
    await s.waitBeat('play'); at.place = Date.now() - t0;
    if (!(await s.sheet().count())) await s.tapDog('Biscuit');
    await s.inSheet(/^Playtime/).click();
    await s.waitBeat('checkout'); at.play = Date.now() - t0;
    if (!(await s.sheet().count())) await s.tapDog('Biscuit');
    await s.inSheet(/^Check out/).click();
    await s.waitBeat('upgrade'); at.firstPayout = Date.now() - t0;
    const coins1 = (await s.st()).coins;
    check(`${L}: the first checkout pays`, coins1 > coins0, `${coins0} → ${coins1}`);

    // the upgrade: both choices, price and benefit, then placed
    const bin = s.coach().getByRole('button', { name: /Toy Bin · 80 coins/ });
    const yard = s.coach().getByRole('button', { name: /Play Yard · 200 coins/ });
    check(`${L}: the upgrade offers the Toy Bin and the Play Yard with prices`, (await bin.count()) === 1 && (await yard.count()) === 1);
    check(`${L}: each upgrade explains its benefit before buying`, /happiness at every playtime/.test(await bin.innerText()) && /happiness at every playtime/.test(await yard.innerText()));
    await s.shot(`${tag}-3-upgrade`);
    await bin.click();
    await s.waitBeat('benefit'); at.upgrade = Date.now() - t0;
    check(`${L}: the Toy Bin is placed`, (await s.st()).facilities.f1.items.some((i) => i.kind === 'toy_bin'));
    check(`${L}: Daisy's message names the upgrade`, /Toy Bin/.test(await s.coach().innerText()));

    // Daisy: the benefit shows at playtime
    await s.page.waitForFunction(() => window.__tycoonState().facilities.f1.dogs.some((d) => d.name === 'Daisy'));
    await s.tapDog('Daisy');
    await s.inSheet(/^Check in/).click();
    await s.page.waitForTimeout(120);
    if (!(await s.sheet().count())) await s.tapDog('Daisy');
    await s.inSheet(/^To Small & Gentle/).click();
    await s.page.waitForTimeout(120);
    if (!(await s.sheet().count())) await s.tapDog('Daisy');
    await s.inSheet(/^Playtime/).click();
    const bonus = await s.page.getByText(/from your Toy Bin/).first().waitFor({ timeout: 3000 }).then(() => true, () => false);
    check(`${L}: Daisy's playtime shows the bonus from the Toy Bin`, bonus);
    if (!(await s.sheet().count())) await s.tapDog('Daisy');
    await s.inSheet(/^Check out/).click();
    await s.waitBeat('decision'); at.benefit = Date.now() - t0;

    // the decision
    const buildBtn = s.coach().getByRole('button', { name: /Build a Large & Active playroom · \d+ coins/ });
    const restBtn = s.coach().getByRole('button', { name: /Let Rocket rest/ });
    check(`${L}: the decision offers both choices`, (await buildBtn.count()) === 1 && (await restBtn.count()) === 1);
    await s.shot(`${tag}-4-decision`);
    const coins2 = (await s.st()).coins;
    if (decision === 'rest') {
      await restBtn.click();
      await s.page.waitForFunction(() => window.__tycoonState().tour?.done === true).catch(() => {});
      check(`${L}: letting Rocket rest sends him home and costs nothing`, !(await s.dogs()).some((d) => d.name === 'Rocket') && (await s.st()).coins >= coins2);
    } else {
      await buildBtn.click();
      await s.page.waitForTimeout(200);
      const hasRoom = (await s.st()).facilities.f1.rooms.some((r) => r.type === 'playroom' && r.group === 'large-active');
      check(`${L}: building places a Large & Active playroom`, hasRoom);
      check(`${L}: the coach then says to take Rocket to his room`, /Rocket's room is ready/.test(await s.coach().innerText()));
      await s.tapDog('Rocket');
      if (await s.inSheet(/^Check in/).count()) { await s.inSheet(/^Check in/).click(); await s.page.waitForTimeout(150); }
      if (!(await s.sheet().count())) await s.tapDog('Rocket');
      await s.inSheet(/^To Large & Active/).click();
      await s.page.waitForFunction(() => window.__tycoonState().tour?.done === true).catch(() => {});
    }
    at.goals = Date.now() - t0;
    check(`${L}: the tour finishes (${decision} branch)`, (await s.tour())?.done === true);
    check(`${L}: the next objective and longer-term goal show`, (await s.page.getByRole('region', { name: 'Objectives' }).count()) === 1);
    check(`${L}: the shop is back after the tour`, await s.shopShown());
    const covered = await s.page.evaluate(() => {
      const g = document.querySelector('section[aria-label="Guide"]');
      const v = document.querySelector('section[aria-label="3D daycare view"], section[aria-label="Daycare map"]');
      return !!g && !!v && v.contains(g);
    });
    check(`${L}: the coach is never drawn over the daycare`, !covered);
    if (map) {
      const text = await s.page.locator('main').innerText();
      check(`${L}: no "drag" wording anywhere on the map screen`, !/\bdrag/i.test(text));
    }
    await s.shot(`${tag}-5-goals`);
    // (events in memory start again after a reload, so the ones from before it are added)
    const events = [...before, ...(await s.page.evaluate(() => (window.__pawtasticEvents ?? []).filter((e) => e.name === 'tycoon_guide').map((e) => e.props.beat)))];
    const want = ['start', 'checkin', 'place', 'play', 'checkout', 'upgrade', 'benefit', 'decision', 'goals'];
    check(`${L}: every beat is measured once`, want.every((b) => events.filter((x) => x === b).length === 1), events.join(','));
    check(`${L}: no page errors`, s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
    timings.push({ run: `${L}${reload ? ' (with a reload)' : ''}`, ...at });
  } catch (e) {
    check(`${L}: quick-start run completed`, false, e.message.split('\n').filter((x) => /Timeout|locator|waiting for|intercepts/.test(x)).slice(0, 4).join(' / '));
    await s.shot(`${tag}-error`);
  }
  await s.ctx.close();
}

/** Build from scratch with the map/list controls (Place in first free spot), then the first care cycle. */
async function scratchRun(browser, dev, { map }) {
  const s = await session(browser, dev, { map });
  const L = `${dev.label}${map ? ' · map (no WebGL)' : ' · 3D'} · scratch`;
  try {
    await s.fresh();
    const t0 = Date.now();
    await s.page.getByRole('button', { name: /Build from scratch/ }).click();
    await s.page.waitForFunction(() => window.__tycoonState().tour?.mode === 'scratch');
    const coachText = await s.coach().innerText();
    check(`${L}: the coach starts with building`, /Build your daycare/.test(coachText));
    check(`${L}: building steps match the controls`, map ? !/\bdrag/i.test(await s.page.locator('main').innerText()) : true);
    const place = async (n) => {
      await s.page.getByRole('button', { name: `Place ${n} in first free spot` }).click();
      await s.page.waitForTimeout(120);
      for (const b of ['Continue']) { const x = s.page.getByRole('button', { name: b }); if (await x.count()) await x.first().click(); }
    };
    const tab = async (n) => s.page.getByRole('region', { name: 'Build' }).getByRole('tab', { name: n }).click();
    await tab('rooms');
    await place('Lobby');
    await place('Playroom — Small & Gentle');
    await place('Calm-Down Room');
    await tab('furniture');
    await place('Front Desk Counter');
    await place('Dog Bed');
    await place('Water Bowl');
    const open = s.page.getByRole('switch', { name: 'Open for business' });
    await open.click();
    const arrived = await s.page.waitForFunction(() => window.__tycoonState().facilities.f1.dogs.some((d) => d.name === 'Biscuit'), null, { timeout: 5000 }).then(() => true, () => false);
    check(`${L}: opening the daycare brings Biscuit`, arrived);
    const at = { built: Date.now() - t0 };
    const r = await s.careFor('Biscuit', 'Small & Gentle');
    check(`${L}: Biscuit goes through the care cycle and home`, !!r.gone, JSON.stringify(r));
    const ok = await s.waitBeat('upgrade');
    at.firstPayout = Date.now() - t0;
    check(`${L}: the first checkout leads to the upgrade choice`, ok);
    check(`${L}: no page errors`, s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
    timings.push({ run: L, ...at });
  } catch (e) {
    check(`${L}: scratch run completed`, false, e.message.split('\n')[0]);
    await s.shot(`scratch-error`);
  }
  await s.ctx.close();
}

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const gl = await chromium.launch();
  await quickRun(gl, IPHONE, { decision: 'build', tag: 'iphone-3d' });
  await quickRun(gl, DESKTOP, { decision: 'rest', reload: true, tag: 'desktop-3d' });
  await gl.close();
  const nogl = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  await quickRun(nogl, IPHONE, { decision: 'rest', map: true, reload: true, tag: 'iphone-map' });
  await quickRun(nogl, DESKTOP, { decision: 'build', map: true, tag: 'desktop-map' });
  await scratchRun(nogl, IPHONE, { map: true });
  await nogl.close();
  console.log(out.join('\n'));
  console.log('\nAutomation timings (ms from tapping Quick start / Build from scratch; a script, not a person):');
  for (const t of timings) console.log(' ', JSON.stringify(t));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
