// The first session, through the real screen (milestone "make PAWtastic feel like a daycare tycoon" §6).
// A SCRIPTED player — not a person, and not a real iPhone: Chromium with iPhone 13 emulation. It starts a genuinely
// fresh game (cleared storage, no coins or experience injected, nothing erased) and plays at NORMAL speed (1×) the whole
// way, tapping only what the game itself puts forward: the start card, the guide's buttons, the front desk, the pup
// panel's next-step button, the rooms strip's cues, the pickup sheet, the Objectives' "See options", the ways-to-grow
// card, the spot bar and the new room's panel. Its one judgement: buy the expansion whose labelled estimate pays back
// sooner, once the coins cover it without the spot bar's "tonight's costs" warning.
//
// Measured separately, never multiplied together:
//   realS     — actual elapsed seconds of this scripted run (it reads nothing and taps at machine speed);
//   runningS  — real seconds during which the game clock was moving (1×: 2 game minutes a second);
//   pausedS   — real seconds while the clock stood still, by reason (guide, building, a dialog, closed, other);
//   taps, failed taps, panel changes (a sheet/dialog/bar opening or closing), abandoned placements, idle stretches.
// A person's reading and decision time is NOT measured; the report estimates it apart and says so.
// Screenshots, a video and log.json go in qa/out/first-session/. Needs the dev server.
// Run: NODE_PATH=/opt/node-tools/node_modules node qa/first-session.cjs [base-url]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = process.env.FIRST_OUT || path.join(__dirname, 'out', 'first-session');
const LIMIT_MS = Number(process.env.FIRST_LIMIT_MIN || 25) * 60 * 1000;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'video'), { recursive: true });

const t0 = Date.now();
const log = [];
const m = { taps: 0, failedTaps: 0, panelChanges: 0, abandonedPlacements: 0, idleStretches: [], toasts: [], errors: [] };
const time = { runningS: 0, paused: { guide: 0, building: 0, dialog: 0, closed: 0, other: 0 } };
const milestones = {};
let shots = 0;
let last = null; // { at, day, clock, overlays }

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], recordVideo: { dir: path.join(OUT, 'video'), size: { width: 390, height: 844 } } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', (e) => m.errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());

  /** What's on screen right now: the clock, what holds it, and which panels are open. */
  async function sample() {
    return page.evaluate(() => {
      const s = window.__tycoonState();
      const f = s?.facilities?.f1;
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
      const overlays = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-testid="panel-sheet"], section[aria-label="Choose a spot"], section[aria-label="Expand your daycare"], [role="toolbar"][aria-label="Build tools"]')]
        .filter(vis).map((el) => el.getAttribute('aria-label') || el.dataset.testid || el.getAttribute('role')).sort();
      const toasts = [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean);
      return { day: f?.day, clock: f?.clockMin, open: !!f?.open, tour: !!s?.tour && !s.tour.done && !s.tour.skipped, coins: s?.coins, overlays, toasts };
    }).catch(() => null);
  }
  /** Adds the time since the last look to running or paused (with why), and counts panel changes. */
  async function account() {
    const s = await sample();
    const now = Date.now();
    if (!s) return null;
    if (last) {
      const dt = (now - last.at) / 1000;
      const moved = s.day !== last.day || s.clock > last.clock;
      if (moved) time.runningS += dt;
      else {
        const why = last.tour ? 'guide' : last.overlays.some((o) => /Choose a spot|Build tools|Expand/.test(o)) ? 'building' : last.overlays.some((o) => /dialog|Level|wrap-up|Pickup/i.test(o)) ? 'dialog' : !last.open ? 'closed' : 'other';
        time.paused[why] += dt;
      }
      if (s.overlays.join('|') !== last.overlays.join('|')) m.panelChanges++;
    }
    for (const t of s.toasts) if (!m.toasts.some((x) => x.text === t)) m.toasts.push({ realS: Math.round((now - t0) / 1000), text: t });
    last = { at: now, ...s };
    return s;
  }
  const hm = (c) => (c == null ? '' : `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(Math.floor(c % 60)).padStart(2, '0')}`);
  const stamp = () => ({ realS: Math.round((Date.now() - t0) / 1000), runningS: Math.round(time.runningS), pausedS: Math.round(Object.values(time.paused).reduce((a, b) => a + b, 0)), taps: m.taps, panelChanges: m.panelChanges, day: last?.day, time: hm(last?.clock), coins: last?.coins });
  const note = (what, extra = {}) => {
    const line = { ...stamp(), what, ...extra };
    log.push(line);
    console.log(`[${line.realS}s run ${line.runningS}s] day ${line.day} ${line.time} · ${line.coins} coins · ${what}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`);
  };
  const mark = (key, what, extra = {}) => { if (!milestones[key]) { milestones[key] = { ...stamp(), what, ...extra }; note(`MILESTONE ${key}: ${what}`, extra); } };
  const shot = async (name, what) => {
    const file = `${String(++shots).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
    note(`screenshot ${file} — ${what}`);
  };
  /** Taps a visible, enabled element; a tap that fails (covered, gone) is counted, never retried blindly. */
  async function tap(loc, label) {
    try {
      await loc.tap({ timeout: 3000 });
      m.taps++;
      note(`tap: ${label}`);
      await page.waitForTimeout(350);
      await account();
      return true;
    } catch (e) {
      m.failedTaps++;
      note(`FAILED tap: ${label} — ${String(e).split('\n')[0].slice(0, 120)}`);
      return false;
    }
  }
  /** The first visible, enabled match of a CSS selector, or null. */
  async function usable(sel) {
    const loc = page.locator(sel);
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if ((await el.isVisible().catch(() => false)) && (await el.isEnabled().catch(() => false))) return el;
    }
    return null;
  }
  const textOf = async (loc) => ((await loc.getAttribute('aria-label').catch(() => null)) || (await loc.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');

  // ================= 1. a genuinely fresh game =================
  await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true, analytics: false, sound: false, music: false })); });
  for (let i = 0; i < 4; i++) {
    try {
      await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__tycoonState?.(), null, { timeout: 15000 });
      break;
    } catch { await page.waitForTimeout(2000); }
  }
  await page.evaluate(() => { window.__tycoonSpeed = 1; });
  const fresh = await st();
  note('opened /daycare-next with cleared storage', { coins: fresh.coins, xp: fresh.xp, rooms: fresh.facilities.f1.rooms.length });
  await account();
  mark('1 fresh game', `a brand-new save: ${fresh.coins} coins, ${fresh.xp} XP, ${fresh.facilities.f1.rooms.length} rooms`);
  await shot('start-card', 'a brand-new save shows the start card');
  await tap(page.locator('section[aria-label="Start your daycare"] button:has-text("Quick start")'), 'Quick start');
  await page.waitForTimeout(800);
  await shot('guide-meet', 'Quick start: the guide introduces the first family');

  let reserve = null; // coins and books when the guide ends
  let newRoom = null; // the expansion: { uid, group, type, cost, at }
  let lastAbandonCoins = -1;
  let idleSince = Date.now();
  let financesSeen = false;
  let dayReportSeen = false;
  let servedInNew = 0;
  const inNew = new Set();
  const seenFirst = new Set();

  const books = (s) => {
    const sum = (r) => Object.values(r).reduce((a, b) => a + b, 0);
    const L = s.facilities.f1.ledger;
    return {
      revenue: L.reduce((a, d) => a + sum(d.income) - d.income.bonus, 0),
      bonuses: L.reduce((a, d) => a + d.income.bonus, 0),
      operating: L.reduce((a, d) => a + d.expenses.wages + d.expenses.upkeep + d.expenses.supplies + d.expenses.marketing + d.expenses.refunds, 0),
      invested: L.reduce((a, d) => a + d.expenses.building, 0),
      sales: L.reduce((a, d) => a + (d.sales ?? 0), 0),
    };
  };

  /** Covering dialogs: the level-up and stage celebrations, the end-of-day report. */
  async function dialogs() {
    const report = await usable('button:has-text("Start day")');
    if (report) {
      if (!dayReportSeen) { dayReportSeen = true; await shot('day-report', 'the end-of-day report: what families paid, what running the daycare cost, the result'); mark('10a day result', 'the end-of-day report'); }
      return tap(report, 'Start the next day (day report)');
    }
    const cont = await usable('[role="dialog"] button:has-text("Continue"), [role="alertdialog"] button:has-text("Continue")');
    if (cont) {
      const title = await textOf(page.locator('[role="dialog"] h2, [role="alertdialog"] h2').first());
      if (!seenFirst.has(title)) { seenFirst.add(title); await shot('celebration', title); }
      return tap(cont, `Continue (${title})`);
    }
    return false;
  }

  /** The pickup sheet: answer the family's concern with the first choice offered, then pay. */
  async function pickupSheet() {
    const sheet = page.locator('[aria-label^="Pickup — "]');
    if (!(await sheet.count()) || !(await sheet.first().isVisible().catch(() => false))) return false;
    if (!seenFirst.has('pickup')) { seenFirst.add('pickup'); await shot('pickup-sheet', 'a family with a concern at pickup: the bill and real choices'); }
    const answer = await usable('[aria-label^="Pickup — "] .grid button');
    if (answer) return tap(answer, `answer the concern: ${await textOf(answer)}`);
    const pay = await usable('[aria-label^="Pickup — "] button:has-text("say goodbye")');
    if (pay) return tap(pay, 'pay and say goodbye');
    return false;
  }

  /** The expansion: open the options, compare the two on the game's own estimates, place, connect, furnish, staff. */
  async function expand() {
    const s = await st();
    if (newRoom || s.tour && !s.tour.done && !s.tour.skipped) return false;
    const see = await usable('section[aria-label="Objectives"] button:has-text("See options")');
    if (!see) return false;
    const next = (await page.getByTestId('objective-next').innerText().catch(() => '')).trim();
    if (!/asked today/.test(next)) return false; // only when families are asking for something the daycare can't do
    if (lastAbandonCoins >= 0 && s.coins < lastAbandonCoins + 60) return false; // just looked: wait to earn more
    // the Next objective's progress bar says when the wing is affordable
    const bar = page.locator('section[aria-label="Objectives"] [role="progressbar"]').first();
    const label = (await bar.getAttribute('aria-label').catch(() => '')) || '';
    const pct = Number((label.match(/(\d+)%$/) ?? [0, 0])[1]);
    mark('4 limit met', `the daycare can't take a kind of pup families ask for: "${next.split('\n')[0]}"`);
    if (!seenFirst.has('demand')) { seenFirst.add('demand'); await shot('objective-demand', `Next: ${next.split('\n')[0]} (${label})`); }
    if (pct < 100) return false;
    await tap(see, 'See options');
    const card = page.locator('section[aria-label="Expand your daycare"]');
    await card.waitFor({ timeout: 4000 }).catch(() => {});
    const wing = card.locator('article[aria-label^="Playroom wing"]').first();
    const bath = card.locator('article[aria-label="Bath station"]').first();
    const read = async (a) => {
      const t = (await a.innerText().catch(() => '')).replace(/\s+/g, ' ');
      const cost = Number(((t.match(/Choose a spot · ([\d,]+)/) ?? [0, '0'])[1]).replace(/,/g, ''));
      // "≈ +88 a day", or with no demand yet "it would mostly add 17 upkeep a day" (a cost)
      const est = t.match(/≈ ([+-]?\d+) a day/);
      const onlyUpkeep = t.match(/mostly add (\d+) upkeep a day/);
      const perDay = est ? Number(est[1]) : onlyUpkeep ? -Number(onlyUpkeep[1]) : NaN;
      return { cost, perDay, payback: perDay > 0 ? cost / perDay : Infinity, estimate: (t.match(/Estimate: (.*?)(?= Choose a spot| Improve|$)/) ?? [0, ''])[1].slice(0, 400) };
    };
    const w = await read(wing);
    const b = await read(bath);
    await wing.scrollIntoViewIfNeeded().catch(() => {});
    await shot('two-choices-wing', `the playroom wing: ${w.cost} coins, estimate ≈ ${w.perDay}/day`);
    await bath.scrollIntoViewIfNeeded().catch(() => {});
    await shot('two-choices-bath', `the bath station: ${b.cost} coins, estimate ≈ ${b.perDay}/day`);
    const pick = w.payback <= b.payback ? { name: 'wing', art: wing, ...w, other: b } : { name: 'bath', art: bath, ...b, other: w };
    mark('5 two choices understood', `wing ${w.cost} (≈${w.perDay}/day) vs bath ${b.cost} (≈${b.perDay}/day) — picked the ${pick.name} (pays back in ~${pick.payback.toFixed(1)} days vs ${pick.other.payback === Infinity ? 'never at today\'s demand' : pick.other.payback.toFixed(1) + ' days'})`, { wing: w, bath: b });
    const choose = pick.art.locator('button:has-text("Choose a spot")');
    if (!(await choose.isEnabled().catch(() => false))) { await tap(page.locator('button:has-text("Save for now")').first(), 'Save for now'); lastAbandonCoins = s.coins; return true; }
    await tap(choose, `Choose a spot (${pick.name})`);
    const spotBar = page.locator('section[aria-label="Choose a spot"]');
    await spotBar.waitFor({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
    const barText = (await spotBar.innerText().catch(() => '')).replace(/\s+/g, ' ');
    await shot('spot-bar', `the spot: what it builds, its connection and the total — ${barText.slice(0, 160)}`);
    const build = await usable('section[aria-label="Choose a spot"] button:has-text("Build here")');
    if (!build || /This leaves/.test(barText)) {
      // the bar warns it would leave less than tonight's costs (or can't build): change your mind, at no cost
      m.abandonedPlacements++;
      lastAbandonCoins = s.coins;
      await tap(page.locator('section[aria-label="Choose a spot"] button:has-text("Cancel")').first(), 'Cancel (the bar warned about tonight\'s costs)');
      note('abandoned placement: Cancel — nothing charged', { coinsAfter: (await st()).coins });
      return true;
    }
    const before = await st();
    const since = reserve ? (() => { const b0 = reserve.books, b1 = books(before); return { revenue: b1.revenue - b0.revenue, operating: b1.operating - b0.operating, bonuses: b1.bonuses - b0.bonuses }; })() : null;
    const priceShown = Number(((await textOf(build)).match(/([\d,]+)/) ?? [0, '0'])[1].replace(/,/g, ''));
    await tap(build, `Build here (${priceShown})`);
    await page.waitForTimeout(800);
    const after = await st();
    const f = after.facilities.f1;
    const room = f.rooms.at(-1);
    newRoom = { uid: room.uid, group: room.group, type: room.type, cost: before.coins - after.coins };
    mark('6 earnings used', `${priceShown} coins: the guide left ${reserve?.coins}; since then families paid ${since?.revenue}, running costs ${since?.operating}, game rewards ${since?.bonuses}; ${before.coins} on hand`, { priceShown, charged: before.coins - after.coins, reserve: reserve?.coins, since });
    await shot('built', `${pick.name} built: ${newRoom.type} ${newRoom.group ?? ''}`);
    const connected = await page.evaluate((uid) => { const f = window.__tycoonState().facilities.f1; return f.rooms.find((r) => r.uid === uid)?.doors?.length > 0; }, room.uid);
    mark('7 placed and connected', `${room.type}${room.group ? ' (' + room.group + ')' : ''} at (${room.c},${room.r}), doors ${room.doors.length}, charged ${before.coins - after.coins} = shown ${priceShown}`, { connected });
    // the new room's panel: readiness (connected, furnished, staffed, operating) and its staffing plan
    const panel = page.locator('section[aria-label^="Edit "]').first();
    if (await panel.count()) {
      const ready = (await page.locator('ol[aria-label="Room readiness"]').first().innerText().catch(() => '')).replace(/\n+/g, ' · ');
      await shot('new-room-panel', `the new room's panel: ${ready.slice(0, 160)}`);
      const staff = await usable('section[aria-label^="Edit "] button:is(:has-text("Hire a"), :has-text("Make "), :has-text("Add it to"))');
      if (staff) {
        const lbl = await textOf(staff);
        const cost = Number(((lbl.match(/· ([\d,]+)/) ?? [0, '0'])[1]).replace(/,/g, ''));
        if (cost === 0 || (await st()).coins - cost > 120) { await tap(staff, lbl); mark('8 furnished and staffed', `came furnished; staffed: ${lbl}`, { readiness: ready }); }
        else mark('8 furnished and staffed', `came furnished (its beds); staffing waits: "${lbl}" costs more than the coins left after tonight — you look after it yourself meanwhile`, { readiness: ready });
      } else mark('8 furnished and staffed', `came furnished; ${ready}`, { readiness: ready });
    }
    for (let i = 0; i < 3 && (await dialogs()); i++); // a celebration can open over the panel
    const close = await usable('button[aria-label="Close panel"], button:has-text("Done building")');
    if (close) await tap(close, await textOf(close));
    return true;
  }

  /** Later: staff the new room once the sign-on is affordable (from its chip in the rooms strip). */
  async function staffLater() {
    if (!newRoom || milestones['8b staffed']) return false;
    const s = await st();
    if (s.coins < 450) return false;
    const chip = page.locator('section[aria-label="Rooms"] button').filter({ hasText: /Playroom|Bath/ }).last();
    if (!(await chip.count())) return false;
    await tap(chip, 'open the new room from the rooms strip');
    const staff = await usable('section[aria-label^="Edit "] button:is(:has-text("Hire a"), :has-text("Make "), :has-text("Add it to"))');
    if (staff) { const lbl = await textOf(staff); await tap(staff, lbl); mark('8b staffed', `staffed later: ${lbl}`); }
    else mark('8b staffed', 'nobody to hire here (covered or not needed)');
    const close = await usable('button[aria-label="Close panel"]');
    if (close) await tap(close, 'Close panel');
    return true;
  }

  // ================= the session loop =================
  for (;;) {
    if (Date.now() - t0 > LIMIT_MS) { note('time limit reached'); break; }
    const s = await account();
    if (!s) { await page.waitForTimeout(500); continue; }
    const state = await st();
    const f = state.facilities.f1;
    let did = false;

    // milestones the screen shows by itself
    if (!milestones['2 checked in and placed safely'] && f.dogs.some((d) => d.checkedIn && d.place.kind === 'room')) {
      const d = f.dogs.find((x) => x.checkedIn && x.place.kind === 'room');
      const room = f.rooms.find((r) => r.uid === d.place.room);
      mark('2 checked in and placed safely', `${d.name} (${d.size} & ${d.temper}) in a ${room.group} playroom`);
      await shot('placed', `${d.name} in the matching playroom`);
    }
    if (!milestones['3 itemised payment'] && (await page.locator('section[aria-label="Receipt"]').count())) {
      const r = (await page.locator('section[aria-label="Receipt"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
      await shot('receipt', `the first receipt: ${r.slice(0, 160)}`);
      mark('3 itemised payment', r.slice(0, 200));
    }
    if (!reserve && state.tour && (state.tour.done || state.tour.skipped)) {
      reserve = { coins: state.coins, books: books(state) };
      note('the guide is done: the reserve', { coins: state.coins, books: reserve.books });
    }
    if (newRoom) {
      const there = f.dogs.find((d) => d.place.kind === 'room' && d.place.room === newRoom.uid);
      if (there && !milestones['9 serves demand']) { mark('9 serves demand', `${there.name} (${there.size} & ${there.temper}) in the new room`); await shot('new-room-serving', `${there.name} in the new room`); }
      for (const d of f.dogs) if (d.place.kind === 'room' && d.place.room === newRoom.uid) inNew.add(d.name);
      const paid = f.outcomes.filter((o) => inNew.has(o.dog) && o.how === 'checkout' && o.total > 0);
      if (paid.length > servedInNew) {
        servedInNew = paid.length;
        note(`paid from the new room: ${paid.at(-1).dog} · ${paid.at(-1).total} coins`, { lines: paid.at(-1).lines.map((l) => `${l.label} ${l.amount}`) });
        if (servedInNew === 1) mark('9b paid from the new room', `${paid.at(-1).dog}'s family paid ${paid.at(-1).total}`);
      }
    }

    did = (await dialogs()) || (await pickupSheet());
    // the guide's own buttons
    if (!did && state.tour && !state.tour.done && !state.tour.skipped) {
      if (state.tour.beat === 'upgrade') {
        const bin = await usable('section[aria-label="Guide"] button[aria-label^="Toy Bin"]');
        if (bin) { await shot('guide-upgrade', 'the first upgrade, with its exact benefit'); did = await tap(bin, 'Toy Bin · 80 coins'); }
      } else if (state.tour.beat === 'decision') {
        const build = page.locator('section[aria-label="Guide"] button[aria-label^="Build a "]');
        const rest = await usable('section[aria-label="Guide"] button:has-text("rest")');
        if (!seenFirst.has('decision')) { seenFirst.add('decision'); await shot('guide-decision', 'Rocket has no room: build one (if affordable) or let him rest free'); mark('4a guide limit', `the guide's decision: ${(await build.first().innerText().catch(() => '')).replace(/\s+/g, ' ')}`); }
        if ((await build.count()) && (await build.first().isEnabled())) did = await tap(build.first(), 'Build the playroom (guide)');
        else if (rest) did = await tap(rest, await textOf(rest));
      }
    }
    // an open pup panel's one next step first (it's what's in front of you), then pickups and drop-offs at the front
    // desk, then the rooms strip's cues
    if (!did) {
      for (const sel of ['[data-testid="next-action"] button', 'section[aria-label="Front desk"] button:has-text("Check out")', 'section[aria-label="Front desk"] button:has-text("Check in")', 'section[aria-label="Rooms"] button:has-text("Move ")', 'section[aria-label="Rooms"] button:has-text("wants to play")', 'section[aria-label="Rooms"] button:has-text("bath is booked")']) {
        const el = await usable(sel);
        if (el) { did = await tap(el, await textOf(el)); break; }
      }
    }
    // a panel left open with nothing to do: give the world back
    if (!did) {
      const close = await usable('[data-testid="panel-sheet"] button[aria-label="Close panel"]');
      if (close) did = await tap(close, 'Close panel (nothing to do for this pup)');
    }
    if (!did) did = await expand();
    if (!did) did = await staffLater();
    // the financial result and the next goal, once the new room has served a family
    if (!did && newRoom && milestones['9b paid from the new room'] && !financesSeen) {
      financesSeen = true;
      const fin = await usable('button[aria-label^="Finances ·"]');
      if (fin) {
        await tap(fin, 'Finances');
        await page.waitForTimeout(600);
        await shot('finances', 'Finances: what families paid, running costs, operating profit, building, rewards, actual coin change');
        mark('10 financial result and next goal', (await page.locator('[role="dialog"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300));
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
        await page.locator('section[aria-label="Objectives"]').scrollIntoViewIfNeeded().catch(() => {});
        await shot('next-goal', `the next goal: ${(await page.locator('section[aria-label="Objectives"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)}`);
        did = true;
      }
    }

    if (did) idleSince = Date.now();
    else if (Date.now() - idleSince > 15000) {
      const offered = (await page.locator('button:visible').allInnerTexts().catch(() => [])).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 10);
      const clockMoving = time.runningS > 0 && last && last.open && !last.tour;
      m.idleStretches.push({ realS: Math.round((Date.now() - t0) / 1000), seconds: 15, clockMoving, offered });
      if (!clockMoving) note('IDLE 15s with the clock stopped — possibly stuck', { offered });
      idleSince = Date.now();
    }
    // done: the new room served a family, the finances and the next goal were seen, and a day ended
    if (financesSeen && dayReportSeen && milestones['9b paid from the new room']) { note('the first session is complete'); break; }
    await page.waitForTimeout(did ? 150 : 600);
  }

  await account();
  const end = await st();
  const f = end.facilities.f1;
  const summary = {
    note: 'Scripted play in Chromium with iPhone 13 emulation at 1× — not a person, not a real iPhone. Reading and decision time is not included.',
    realMinutes: +((Date.now() - t0) / 60000).toFixed(1),
    runningMinutes: +(time.runningS / 60).toFixed(1),
    pausedMinutes: Object.fromEntries(Object.entries(time.paused).map(([k, v]) => [k, +(v / 60).toFixed(1)])),
    taps: m.taps, failedTaps: m.failedTaps, panelChanges: m.panelChanges, abandonedPlacements: m.abandonedPlacements,
    idleStretches: m.idleStretches.length, idleWithClockStopped: m.idleStretches.filter((x) => !x.clockMoving).length,
    pageErrors: m.errors,
    milestones,
    reserveAfterGuide: reserve?.coins ?? null,
    paidFromNewRoom: servedInNew,
    newRoom,
    final: { day: f.day, clock: hm(f.clockMin), coins: end.coins, xp: end.xp, rooms: f.rooms.map((r) => `${r.type}${r.group ? ':' + r.group : ''}`), staff: f.staff.map((x) => x.role ?? 'founder'), outcomes: f.outcomes.length, books: books(end), ledger: f.ledger },
    toasts: m.toasts,
  };
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ summary, log }, null, 1));
  await ctx.close();
  await browser.close();
  console.log('\n' + JSON.stringify({ ...summary, toasts: summary.toasts.length, final: { ...summary.final, ledger: undefined } }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
