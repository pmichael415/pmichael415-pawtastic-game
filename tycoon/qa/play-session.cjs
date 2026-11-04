// Claude's play session (combined-loop plan, task 6). AI PLAY in Chromium with iPhone 13 emulation — not a person and
// not a real iPhone. A fresh daycare is played through the real screen the way a player would: the guided start, caring
// for pups by tapping them in the 3D view, answering pups that ask for you, and running the business by following the
// game's own Next objective (hire when it says Open Team, expand when it says See options — choosing the option and
// the spot), several days and their reports, then the grown daycare. Game time runs 2–3× faster than normal between beats (said in
// the log). Screenshots at each beat, a video of the whole session and a log go in qa/out/play-session/. Claude then
// looks at every screenshot and writes the play notes by hand (docs/superpowers/2026-11-06-tycoon-combined-loop-report.md).
// Needs the dev server. Run: node qa/play-session.cjs [base-url]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = process.env.PLAY_OUT || path.join(__dirname, 'out', 'play-session');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'video'), { recursive: true });
const IPHONE = { ...devices['iPhone 13'], deviceScaleFactor: 2 };
const LIMIT_MS = 22 * 60 * 1000;
const t0 = Date.now();
const log = [];
const counts = { checkIns: 0, turnedAway: 0, plays: 0, baths: 0, mops: 0, checkouts: 0, complaintsAnswered: 0, momentsAnswered: 0, hires: 0, expansions: 0, tapsMissed: 0, dialogs: 0 };
const note = async (page, what, extra = {}) => {
  const s = await page.evaluate(() => { const st = window.__tycoonState(); const f = st.facilities.f1; return { day: f.day, clock: f.clockMin, coins: st.coins, xp: st.xp }; }).catch(() => ({}));
  const hm = s.clock != null ? `${String(Math.floor(s.clock / 60)).padStart(2, '0')}:${String(Math.floor(s.clock % 60)).padStart(2, '0')}` : '';
  const line = { realS: Math.round((Date.now() - t0) / 1000), day: s.day, time: hm, coins: s.coins, what, ...extra };
  log.push(line);
  console.log(`[${line.realS}s] day ${s.day} ${hm} · ${s.coins} coins · ${what}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...IPHONE, recordVideo: { dir: path.join(OUT, 'video'), size: { width: 390, height: 844 } } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());
  const fac = async () => (await st()).facilities.f1;
  const sheet = () => page.getByTestId('panel-sheet');
  const coach = () => page.getByRole('region', { name: 'Guide' });
  let n = 0;
  const shot = async (name, what) => {
    n++;
    const file = `${String(n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
    await note(page, `screenshot ${file}${what ? ' — ' + what : ''}`);
  };
  const speed = (x) => page.evaluate((x) => { window.__tycoonSpeed = x; }, x);
  const canvasIntoView = (block = 'center') => page.evaluate((b) => document.querySelector('section[aria-label="3D daycare view"] canvas')?.scrollIntoView({ block: b }), block);

  /** Taps a pup in the 3D view where it's drawn (retrying while it walks); true when its panel opened. */
  async function tapDog(id, name, tries = 6) {
    for (let i = 0; i < tries; i++) {
      for (const block of ['center', 'start', 'end']) {
        await canvasIntoView(block);
        await page.waitForTimeout(100);
        const p = await page.evaluate((id) => {
          const w = window.__tycoonWorld;
          const a = w.debugInfo().dogs.find((x) => x.id === id);
          if (!a) return null;
          const q = w.project(a.x, 0.3, a.z);
          const el = document.elementFromPoint(q.x, q.y);
          return { ...q, onCanvas: !!el && el.tagName === 'CANVAS' };
        }, id);
        if (!p) return false;
        if (!p.visible || !p.onCanvas) continue;
        await page.mouse.click(p.x, p.y);
        if (await sheet().getByRole('article', { name }).first().waitFor({ timeout: 700 }).then(() => true, () => false)) return true;
      }
      await page.waitForTimeout(200);
    }
    counts.tapsMissed++;
    return false;
  }
  const inSheet = (name) => sheet().getByRole('button', { name }).first();
  /**
   * Opens a pup's panel the way a player would: the chip over the daycare when it names this pup (a button — reliable),
   * else a tap on the pup in 3D. A pup just missed is left for a few seconds (no player taps the same spot forever).
   */
  const missedUntil = new Map();
  async function selectDog(id, name) {
    const chip = page.getByRole('button', { name: new RegExp(`is waiting to (pick up|drop off) ${name}$`) });
    if (await chip.count()) {
      await chip.first().click();
      if (await sheet().getByRole('article', { name }).first().waitFor({ timeout: 1000 }).then(() => true, () => false)) return true;
    }
    if ((missedUntil.get(id) ?? 0) > Date.now()) return false;
    const ok = await tapDog(id, name, 2);
    if (!ok) missedUntil.set(id, Date.now() + 10000);
    return ok;
  }
  /** Closes the panel with its Close panel button (never a room's business "Close"). */
  const closeSheet = async () => {
    const x = sheet().getByRole('button', { name: 'Close panel' });
    if (await x.count()) await x.first().click().catch(() => {});
  };

  /** Celebrations and reports that cover the screen: look at the first of each, then carry on. */
  const seenDialogs = new Set();
  async function dismiss() {
    const report = page.getByRole('button', { name: /^Start day \d+/ });
    if (await report.count()) {
      if (!seenDialogs.has('report')) { seenDialogs.add('report'); await shot('day-report', 'the end-of-day report'); }
      counts.dialogs++;
      await report.first().click().catch(() => {});
      await note(page, 'closed the day report');
      return true;
    }
    for (const [re, key] of [[/^Level \d+/, 'level'], [/daycare!$|campus!$/, 'stage']]) {
      const d = page.getByRole('dialog', { name: re });
      if (await d.count()) {
        const title = (await d.first().getByRole('heading').first().innerText().catch(() => '')).trim();
        if (!seenDialogs.has(title)) { seenDialogs.add(title); await page.waitForTimeout(500); await shot(key === 'level' ? 'level-up' : 'stage-up', title); }
        counts.dialogs++;
        await d.first().getByRole('button', { name: 'Continue' }).click().catch(() => {});
        await note(page, `celebration: ${title}`);
        return true;
      }
    }
    return false;
  }

  const GROUP = (d) => `${d.size === 'small' ? 'Small' : 'Large'} & ${d.temper === 'gentle' ? 'Gentle' : 'Active'}`;
  const SPOTS = { dog_bed: 1, play_mat: 1, deluxe_bed: 1, cloud_bed: 1 };
  /** Is there a matching playroom with a free spot (or a free boarding bed)? From what the screen shows. */
  const roomFor = (f, d) => {
    if (d.boarding) return f.items.filter((i) => i.kind === 'boarding_bed' && !i.closed).length > f.dogs.filter((x) => x.boarding && x.checkedIn).length;
    const g = `${d.size}-${d.temper}`;
    return f.rooms.some((r) => r.type === 'playroom' && r.group === g && !r.closed && f.items.filter((i) => i.room === r.uid && SPOTS[i.kind] && !i.closed).length > f.dogs.filter((x) => x.place.kind === 'room' && x.place.room === r.uid).length);
  };

  let firstMoment = true, firstPickup = true, firstArrivalShot = true;
  /** One look at the daycare and the most useful thing to do, like a player would. */
  async function step() {
    if (await dismiss()) return;
    const f = await fac();
    // a family waiting at pickup
    const pick = f.dogs.find((d) => d.checkedIn && d.visit?.ownerHere != null && !d.visit?.finishing && !d.bathing);
    if (pick && (await selectDog(pick.id, pick.name))) {
      const out = inSheet(/^Check out/);
      if (await out.count()) {
        await out.click();
        const ps = page.getByRole('dialog', { name: new RegExp(`^Pickup — ${pick.name}`) });
        if (await ps.waitFor({ timeout: 800 }).then(() => true, () => false)) {
          if (firstPickup) await shot('pickup-concern', `${pick.visit.owner} has a concern at pickup`);
          for (let i = 0; i < 4; i++) {
            const answer = ps.getByRole('button').filter({ hasNotText: /say goodbye|Paid|Waiting/ }).first();
            if (!(await answer.count())) break;
            await answer.click().catch(() => {});
            counts.complaintsAnswered++;
            await page.waitForTimeout(150);
          }
          await ps.getByRole('button', { name: /say goodbye/ }).click().catch(() => {});
        }
        counts.checkouts++;
        await page.waitForTimeout(300);
        if (firstPickup && (await page.getByRole('region', { name: 'Receipt' }).count())) await shot('receipt', `${pick.name}'s receipt`);
        firstPickup = false;
        await note(page, `checked ${pick.name} out`);
      }
      await closeSheet();
      return;
    }
    // a pup asking for you (the chip over the daycare shows waiting families first, so they come first here too)
    const chip = page.getByRole('button', { name: /is asking for you|are asking for you/ });
    if (await chip.count()) {
      if (firstMoment) { await canvasIntoView('center'); await page.waitForTimeout(300); await shot('moment-chip', 'a pup asks for you: the chip over the daycare'); }
      await chip.first().click();
      const card = sheet().getByRole('region', { name: /is asking for you/ });
      if (await card.count()) {
        const ask = (await card.first().innerText()).split('\n')[0];
        if (firstMoment) await shot('moment-card', ask);
        await card.first().getByRole('button').first().click();
        counts.momentsAnswered++;
        await note(page, `answered a moment: ${ask}`);
        if (firstMoment) { await page.waitForTimeout(250); await shot('moment-answered', 'hearts, and the panel says the family will hear about it'); }
        firstMoment = false;
      }
      await closeSheet();
      return;
    }
    // a family dropping off
    const arrive = f.dogs.find((d) => !d.checkedIn && d.place.kind === 'lobby');
    if (arrive) {
      if (firstArrivalShot) { firstArrivalShot = false; await canvasIntoView('center'); await page.waitForTimeout(400); await shot('families-at-desk', 'families wait at the desk to drop off'); }
      if (!(await selectDog(arrive.id, arrive.name))) return;
      if (!roomFor(f, arrive)) {
        await inSheet("Can't take today").click().catch(() => {});
        counts.turnedAway++;
        await note(page, `no room for ${arrive.name} (${arrive.boarding ? 'boarding' : GROUP(arrive)}) — rescheduled`);
      } else {
        await inSheet(/^Check in/).click().catch(() => {});
        await page.waitForTimeout(150);
        if (!(await sheet().count())) await selectDog(arrive.id, arrive.name);
        const to = arrive.boarding ? inSheet(/^To a boarding bed/) : inSheet(new RegExp(`^To ${GROUP(arrive)}`));
        await to.click().catch(() => {});
        counts.checkIns++;
        await note(page, `checked in ${arrive.name} → ${arrive.boarding ? 'boarding bed' : GROUP(arrive)}`);
      }
      await closeSheet();
      return;
    }
    // a booked bath not done yet, nobody else on baths
    const hasBather = f.staff.some((x) => x.role === 'bath');
    const tub = f.items.some((i) => i.kind === 'bath_tub' || i.kind === 'deluxe_tub');
    const bathPup = !hasBather && tub && f.dogs.find((d) => d.checkedIn && (d.place.kind === 'room' || d.place.kind === 'bed') && !d.bathed && !d.bathing && d.visit?.requests?.includes('bath'));
    if (bathPup && !f.dogs.some((d) => d.bathing) && (await selectDog(bathPup.id, bathPup.name))) {
      await inSheet('Bath').click().catch(() => {});
      counts.baths++;
      await note(page, `gave ${bathPup.name} a bath`);
      await closeSheet();
      return;
    }
    // a room getting dirty: mop (from a pup's panel in that room)
    const rc = f.roomClean ?? {};
    const dirty = f.rooms.find((r) => r.type === 'playroom' && (rc[r.uid] ?? 100) < 55);
    const inDirty = dirty && f.dogs.find((d) => d.place.kind === 'room' && d.place.room === dirty.uid);
    if (inDirty && (await selectDog(inDirty.id, inDirty.name))) {
      const mop = inSheet('Mop floors');
      if (await mop.count()) { await mop.click().catch(() => {}); counts.mops++; await note(page, 'mopped the floors'); }
      await closeSheet();
      return;
    }
    // the unhappiest settled pup gets a playtime
    const sad = f.dogs.filter((d) => d.checkedIn && (d.place.kind === 'room' || d.place.kind === 'bed') && !d.bathing && d.happiness < 60).sort((a, b) => a.happiness - b.happiness)[0];
    if (sad && (await selectDog(sad.id, sad.name))) {
      await inSheet(/^Playtime/).click().catch(() => {});
      counts.plays++;
      await closeSheet();
    }
  }

  async function playFor(gameMinutes, label) {
    const start = await fac();
    const startAt = start.day * 1440 + start.clockMin;
    await note(page, `playing ~${gameMinutes} game minutes: ${label}`);
    for (;;) {
      if (Date.now() - t0 > LIMIT_MS) return note(page, 'time limit for the session reached');
      await step().catch((e) => note(page, `step error: ${String(e).split('\n')[0]}`));
      const g = await fac();
      if (g.day * 1440 + g.clockMin - startAt >= gameMinutes) return;
      await page.waitForTimeout(250);
    }
  }

  // ===================== 1. a fresh daycare =====================
  await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false })); });
  // the dev server may reload the page once while it prepares modules: retry the load
  for (let i = 0; i < 4; i++) {
    try {
      await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__tycoonWorld && !!window.__tycoonState(), null, { timeout: 15000 });
      break;
    } catch { await page.waitForTimeout(2000); }
  }
  await page.evaluate(() => window.__tycoonDiag?.set(true));
  await shot('start', 'a brand-new save');
  await page.getByRole('region', { name: 'Start your daycare' }).getByRole('button', { name: /Quick start/ }).click();
  await page.waitForTimeout(800);
  await shot('tour-meet', 'the coach introduces Biscuit');

  // ===================== 2. the guided start =====================
  const waitBeat = (beat, timeout = 10000) => page.waitForFunction((b) => window.__tycoonState()?.tour?.beat === b, beat, { timeout }).then(() => true, () => false);
  const byName = async (name) => (await fac()).dogs.find((d) => d.name === name);
  const careTour = async (name, group) => {
    const d = await byName(name);
    await tapDog(d.id, name);
    await inSheet(/^Check in/).click();
    await page.waitForTimeout(150);
    if (!(await sheet().count())) await tapDog(d.id, name);
    await inSheet(new RegExp(`^To ${group}`)).click();
    await page.waitForTimeout(150);
    if (!(await sheet().count())) await tapDog(d.id, name);
    await inSheet(/^Playtime/).click();
    await page.waitForTimeout(150);
    if (!(await sheet().count())) await tapDog(d.id, name);
    await inSheet(/^Check out/).click();
    await page.waitForTimeout(300);
  };
  await careTour('Biscuit', 'Small & Gentle');
  await waitBeat('upgrade');
  await shot('tour-upgrade', 'first payout, then the first upgrade choice');
  await coach().getByRole('button', { name: /Toy Bin · 80 coins/ }).click();
  await page.waitForFunction(() => window.__tycoonState().facilities.f1.dogs.some((d) => d.name === 'Daisy'), null, { timeout: 15000 });
  await careTour('Daisy', 'Small & Gentle');
  await waitBeat('decision');
  await shot('tour-decision', 'Rocket arrives with no room: build or let him rest');
  await coach().getByRole('button', { name: /Build a Large & Active playroom/ }).click();
  await page.waitForTimeout(400);
  const rocket = await byName('Rocket');
  if (rocket) {
    await tapDog(rocket.id, 'Rocket');
    if (await inSheet(/^Check in/).count()) { await inSheet(/^Check in/).click(); await page.waitForTimeout(150); }
    if (!(await sheet().count())) await tapDog(rocket.id, 'Rocket');
    await inSheet(/^To Large & Active/).click().catch(() => {});
  }
  await page.waitForFunction(() => window.__tycoonState().tour?.done === true, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  await dismiss();
  await dismiss();
  await note(page, 'the guided start is done');
  await shot('after-tour', 'the guide is done; the day clock starts');

  // ===================== 3. running the daycare, following the game's own Next objective =====================
  const shotOnce = new Set();
  const once = async (key, name, what) => { if (!shotOnce.has(key)) { shotOnce.add(key); await shot(name, what); } };
  const objective = async () => ({
    next: (await page.getByTestId('objective-next').innerText().catch(() => '')).trim(),
    long: (await page.getByTestId('objective-long').innerText().catch(() => '')).trim(),
    button: (await page.getByRole('region', { name: 'Objectives' }).getByRole('button').allInnerTexts().catch(() => [])).map((x) => x.trim()),
  });
  const hire = async () => {
    await page.getByRole('button', { name: /^Team, / }).click();
    const ts = page.getByRole('dialog', { name: /^Team ·/ });
    await ts.waitFor();
    await once('team', 'team-sheet', 'the team sheet with a recommended role');
    const btn = ts.getByRole('button', { name: /^Hire a / });
    const label = await btn.innerText();
    await btn.click();
    counts.hires++;
    await note(page, `hired (the objective said so): ${label}`);
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape').catch(() => {});
  };
  let spotTurn = 0;
  /** Opens the options and buys `pick` (a title prefix) — a new room at a chosen spot, or an improvement. */
  const expand = async (pick, why) => {
    const card = page.getByRole('region', { name: 'Expand your daycare' });
    if (!(await card.count())) await page.getByRole('button', { name: /^(Expansion options|See options)$/ }).first().click();
    await card.waitFor();
    const art = card.getByRole('article', { name: new RegExp(`^${pick}`) }).first();
    if (!(await art.count())) return false;
    await art.scrollIntoViewIfNeeded();
    await once(`card-${pick}`, `options-${pick.split(' ')[0].toLowerCase()}`, `the ways-to-grow card: ${why}`);
    const choose = art.getByRole('button', { name: /^Choose a spot/ });
    if (await choose.count()) {
      if (await choose.isDisabled()) return false;
      await choose.click();
      const bar = page.getByRole('region', { name: 'Choose a spot' });
      await bar.waitFor();
      await page.waitForTimeout(900);
      const want = [1, 0, 2][spotTurn++ % 3];
      const n = Number(((await bar.innerText()).match(/of (\d)/) ?? [0, 1])[1]);
      const steps = Math.min(want, n - 1);
      await once(`spot1-${pick}`, `spot-1-${pick.split(' ')[0].toLowerCase()}`, (await bar.innerText()).split('\n').slice(0, 3).join(' — '));
      for (let i = 0; i < steps; i++) { await bar.getByRole('button', { name: 'Next spot' }).click(); await page.waitForTimeout(900); }
      if (steps) await once(`spotN-${pick}`, `spot-${steps + 1}-${pick.split(' ')[0].toLowerCase()}`, (await bar.innerText()).split('\n').slice(0, 3).join(' — '));
      const build = bar.getByRole('button', { name: /^Build here/ });
      if (await build.isDisabled()) { await bar.getByRole('button', { name: 'Cancel' }).click(); return false; }
      await build.click();
      await page.waitForTimeout(700);
      await once(`built-${pick}`, `built-${pick.split(' ')[0].toLowerCase()}`, `${pick} built at spot ${steps + 1}`);
      await note(page, `built ${pick} at spot ${steps + 1} (${why})`);
    } else {
      const imp = art.getByRole('button', { name: /^Improve/ });
      if (!(await imp.count()) || (await imp.isDisabled())) return false;
      await imp.click();
      await note(page, `improved: ${pick} (${why})`);
    }
    counts.expansions++;
    for (let i = 0; i < 3; i++) await dismiss();
    await closeSheet();
    return true;
  };
  /** What a player reading the Objectives would do now. */
  async function manage() {
    if (await dismiss()) return;
    const o = await objective();
    const coins = (await st()).coins;
    if (/asked today/.test(o.next)) await once('demand', 'objective-demand', `Next: ${o.next.split('\n')[0]}`);
    if (o.button.includes('Open Team') && coins >= 650) return hire();
    if (o.button.includes('See options')) {
      if (/asked today/.test(o.next)) return expand('Playroom wing', 'families asked for a kind of pup with no room');
      const named = [[/bath station/i, 'Bath station'], [/boarding wing/i, 'Boarding wing'], [/play yard/i, 'Play yard'], [/staff room/i, 'Staff room'], [/second playroom/i, 'Playroom wing']].find(([re]) => re.test(o.next.split('\n')[0]));
      if (named) {
        if (coins >= 0 && (await expand(named[1], `the objective: ${o.next.split('\n')[0]}`))) return;
        await page.getByRole('button', { name: 'Save for now' }).click().catch(() => {});
        return;
      }
      for (const pick of ['Playroom wing', 'Bath station', 'Boarding wing', 'Play yard']) if (await expand(pick, `the objective: ${o.next.split('\n')[0]}`)) return;
      await page.getByRole('button', { name: 'Save for now' }).click().catch(() => {});
      return;
    }
    // the goal ladder: grow toward the next stage when there's money to spare
    if (/Grow into a/.test(o.long) && coins >= 1300) {
      const order = /Full-service/.test(o.long) ? ['Bath station', 'Boarding wing'] : /campus/.test(o.long) ? ['Play yard', 'Staff room', 'Playroom wing', 'Bath station', 'Boarding wing'] : ['Playroom wing', 'Play yard', 'Bath station'];
      for (const pick of order) if (await expand(pick, `the goal: ${o.long.split('\n')[0]}`)) return;
      await page.getByRole('button', { name: 'Save for now' }).click().catch(() => {});
    }
  }
  const lossesSeen = new Set();
  async function playDays(untilDay, label) {
    await note(page, `playing to day ${untilDay}: ${label}`);
    let k = 0;
    for (;;) {
      if (Date.now() - t0 > LIMIT_MS) return note(page, 'time limit for the session reached');
      const g = await fac();
      if (g.day >= untilDay) return;
      await step().catch((e) => note(page, `step error: ${String(e).split('\n')[0]}`));
      if (++k % 12 === 0) await manage().catch((e) => note(page, `manage error: ${String(e).split('\n')[0]}`));
      if (k % 40 === 0) await note(page, `status`, { level: (await st()).xp, rep: g.reputation, pups: g.dogs.length });
      // every reputation loss, with its reason, as it happens
      for (const r of (g.repLog ?? []).filter((x) => x.delta < 0 && !lossesSeen.has(`${x.day}:${x.min}:${x.reason}`))) {
        lossesSeen.add(`${r.day}:${r.min}:${r.reason}`);
        await note(page, `reputation ${r.delta}: ${r.reason}`);
      }
      await page.waitForTimeout(200);
    }
  }

  try {
    await speed(2);
    await playFor(80, 'the first morning (2× speed)');
    await canvasIntoView('center');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Zoom in' }).click().catch(() => {});
    await page.waitForTimeout(800);
    await shot('living-daycare', 'zoomed in: bubbles, families, wandering pups');
    await page.getByRole('button', { name: 'Reset camera' }).click().catch(() => {});
    await playDays(2, 'day 1, following the objectives');
    if (process.env.PLAY_SHORT) await playFor(180, 'day 2 morning (short run)');
    else {
      await playDays(4, 'days 2–3');
      await playDays(6, 'days 4–5, while there is time');
      await playFor(300, 'to midday, for the final look');
    }
  } catch (e) {
    await note(page, `session stopped early: ${String(e).split('\n')[0]}`);
  }

  // ===================== 4. the grown daycare =====================
  try {
    await speed(0.0001); // hold the moment for the final pictures
    for (let i = 0; i < 3; i++) await dismiss();
    await closeSheet();
    await page.getByRole('button', { name: 'Reset camera' }).click().catch(() => {});
    await canvasIntoView('center');
    await page.waitForTimeout(1200);
    await shot('grown-overview', 'the whole daycare at the end');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot('grown-closeup', 'a closer look');
    await page.getByRole('region', { name: 'Objectives' }).scrollIntoViewIfNeeded().catch(() => {});
    await shot('objectives', 'the next objective, the goal and the stage');
  } catch (e) {
    await note(page, `final shots failed: ${String(e).split('\n')[0]}`);
  }
  const diag = await page.evaluate(() => window.__tycoonDiag?.summary()).catch(() => null);
  const final = await st();
  const f = final.facilities.f1;
  await note(page, 'session over', { xp: final.xp, rooms: f.rooms.map((r) => r.type), staff: f.staff.map((x) => x.role ?? 'founder'), outcomes: f.outcomes.length, reputation: f.reputation });
  await ctx.close();
  await browser.close();
  const summary = { realMinutes: +((Date.now() - t0) / 60000).toFixed(1), counts, errors, diag, final: { day: f.day, coins: final.coins, xp: final.xp, reputation: f.reputation, rooms: f.rooms.map((r) => `${r.type}${r.group ? ':' + r.group : ''}`), items: f.items.filter((i) => i.room === null && i.kind !== 'path').map((i) => i.kind), staff: f.staff.map((x) => `${x.name}:${x.role ?? 'founder'}`), asked: f.asked, ledger: f.ledger.map((l) => ({ day: l.day, income: l.income, expenses: l.expenses })), moods: f.outcomes.reduce((a, o) => ({ ...a, [`${o.how}:${o.mood}`]: (a[`${o.how}:${o.mood}`] ?? 0) + 1 }), {}), complaints: f.outcomes.flatMap((o) => o.complaints.map((c) => c.kind)), repLog: (f.repLog ?? []).slice(-25) } };
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ summary, log }, null, 1));
  console.log('\n' + JSON.stringify(summary, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
