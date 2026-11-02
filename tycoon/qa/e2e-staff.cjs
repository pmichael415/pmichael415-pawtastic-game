// Staff, the living campus and the first expansion in a real browser (owner brief, 4 Nov): a family arrives → the
// receptionist checks them in → an attendant plays → the bath attendant does the booked bath → checkout charges
// correctly → wages affect profit → an expansion is bought and used → a reload keeps everything. iPhone 13 and a
// 1280 × 800 desktop (Chromium emulation, software graphics). Then a busy-scene performance sample.
// Needs the dev server (DEV-only hooks). Run: node qa/e2e-staff.cjs [base-url]
const { chromium, devices } = require('playwright');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-daycare-next-v1';
const OUT = path.join(__dirname, 'out');
let pass = 0, fail = 0; const out = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const SKIPPED = { mode: 'scratch', beat: 'meet', startedAt: 0, upgrade: null, done: false, skipped: true };

async function steady(page, fn) {
  for (let i = 0; i < 4; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!/context was destroyed|navigation/i.test(String(e)) || i === 3) throw e;
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
}

async function run(browser, label, opts) {
  const desktop = !!(opts.viewport && opts.viewport.width > 500);
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());
  const f = async () => (await st()).facilities.f1;
  const dog = async (id) => (await f()).dogs.find((d) => d.id === id);
  const speed = (n) => page.evaluate((n) => { window.__tycoonSpeed = n; }, n);
  const quiet = () => page.evaluate(() => window.__tycoonSet((s) => ({ ...s, pendingLevel: null })));
  const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const world = () => page.evaluate(() => window.__tycoonWorld?.debugInfo() ?? null);
  const shot = (name) => page.screenshot({ path: path.join(OUT, `staff-${label}-${name}.png`) });

  // A daycare with a bath room (the test kit's fixture), the guide skipped, opened from a direct link.
  await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
  await steady(page, () => page.evaluate(async ([KEY, SKIPPED]) => {
    localStorage.clear();
    localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false }));
    const kit = await import('/src/tycoon/testkit.ts');
    const s = kit.richState();
    const f1 = s.facilities.f1;
    localStorage.setItem(KEY, JSON.stringify({ ...s, coins: 6000, lastSeen: Date.now(), tour: SKIPPED, pendingLevel: null, facilities: { f1: { ...f1, open: true, clockMin: 540, dogs: [], prices: { ...f1.prices, daycare: 80 } } } }));
  }, [KEY, SKIPPED]));
  await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
  await speed(0.0001); // hold the clock while hiring

  try {
    // ---------- 1. hire a team from the Team sheet ----------
    const coins0 = (await st()).coins;
    const staff0 = (await f()).staff.length;
    const wages0 = (await f()).ledger.at(-1)?.expenses.wages ?? 0;
    await quiet();
    await page.getByRole('button', { name: /^Team, \d/ }).click();
    const sheet = page.getByRole('dialog', { name: /^Team ·/ });
    await sheet.waitFor();
    for (const role of ['Receptionist', 'Daycare attendant', 'Bath attendant']) {
      await sheet.getByRole('radio', { name: new RegExp('^' + role) }).click();
      await sheet.getByRole('button', { name: new RegExp('^Hire a ' + role.toLowerCase()) }).click();
    }
    const team = (await f()).staff;
    const fees = [0, 1, 2].reduce((a, i) => a + 250 * (staff0 + i), 0);
    check(`${label}: three people hired into their roles`, team.length === staff0 + 3 && ['reception', 'attendant', 'bath'].every((r) => team.some((x) => x.role === r)));
    const wagesPaid = ((await f()).ledger.at(-1)?.expenses.wages ?? 0) - wages0;
    check(`${label}: sign-on fees charged once (booked as wages; the getting-started guide's reward may land too)`, wagesPaid === fees, `${wagesPaid} vs ${fees}`);
    check(`${label}: the sheet shows the daily wages`, (await sheet.getByText(new RegExp(`Wages ${40 * team.length} game coins a day`)).count()) === 1);
    await shot('1-team');
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });

    // ---------- 2. a family arrives with daycare + a bath ----------
    const clock = (await f()).clockMin;
    await page.evaluate(([clock]) => window.__tycoonSet((s) => {
      const f1 = s.facilities.f1;
      const visit = { owner: 'Taylor', requests: ['daycare', 'bath'], prepaid: [], arrivedDay: f1.day, arrived: clock, pickupDay: f1.day, pickup: clock + 200, ownerHere: null, waitedLobby: 0, checkedInAt: null, history: [], scuffle: false, safeMove: false, finishing: null, remedies: {}, paid: 0, waitBefore: 0 };
      const luna = { id: 'e1', name: 'Luna', breed: 1, size: 'small', temper: 'gentle', visits: 1, place: { kind: 'lobby' }, checkedIn: false, happiness: 70, clean: 50, boarding: false, played: 0, bathed: false, bathing: null, bathTub: null, visit };
      return { ...s, pendingLevel: null, facilities: { f1: { ...f1, dogs: [luna] } } };
    }), [clock]);
    await speed(1);
    await until(() => window.__tycoonState().facilities.f1.staff.some((x) => x.job?.kind === 'checkin' && x.job.dog === 'e1'));
    check(`${label}: the receptionist takes the check-in (Luna not checked in yet — nothing is instant)`, (await dog('e1')).checkedIn === false);
    await until(() => { const d = window.__tycoonState().facilities.f1.dogs.find((x) => x.id === 'e1'); return d?.checkedIn && d.place.kind === 'room'; });
    const lunaIn = await dog('e1');
    const placedIn = (await f()).rooms.find((r) => r.uid === lunaIn.place.room);
    check(`${label}: the receptionist checked Luna in and settled her in a matching playroom`, placedIn?.type === 'playroom' && placedIn.group === 'small-gentle');
    check(`${label}: check-in took game time`, lunaIn.visit.checkedInAt - clock >= 4.5, `${lunaIn.visit.checkedInAt - clock} min`);

    // ---------- 3. the attendant plays with her ----------
    await until(() => window.__tycoonState().facilities.f1.staff.some((x) => x.job?.kind === 'play' && x.job.dog === 'e1' && x.job.phase === 'work'), null, 40000);
    if (desktop) {
      const w = await world();
      const att = (await f()).staff.find((x) => x.job?.kind === 'play' && x.job.dog === 'e1');
      await page.waitForTimeout(1200);
      const w2 = await world();
      const p = w2.people.find((x) => x.id === att.id);
      const d = w2.dogs.find((x) => x.id === 'e1');
      check(`${label}: in 3D the attendant stands by Luna while playing`, !!p && !!d && Math.hypot(p.x - d.x, p.z - d.z) < 2.5 && p.work === 'play', p && d ? `${Math.hypot(p.x - d.x, p.z - d.z).toFixed(2)} apart, work ${p.work}` : 'missing');
      check(`${label}: Luna is playing in 3D`, d?.mode === 'play', d?.mode);
      check(`${label}: staff have walking routes (more than one person in the world)`, (w?.people?.length ?? 0) >= 4);
      await shot('2-play');
    }
    await until(() => window.__tycoonState().facilities.f1.dogs.find((x) => x.id === 'e1')?.played >= 1, null, 40000);
    check(`${label}: the play counted (happiness up)`, (await dog('e1')).happiness > 70);

    // ---------- 4. the bath attendant does the booked bath ----------
    await speed(2);
    await until(() => (window.__tycoonState().facilities.f1.dogs.find((x) => x.id === 'e1')?.bathing ?? 0) > 0, null, 60000);
    const bathStart = (await f()).clockMin;
    const inBath = await dog('e1');
    check(`${label}: the bath runs in a real tub`, !!inBath.bathTub);
    if (desktop) {
      // let both walk there in 3D (the pup walks over from its playroom), then look
      await page.waitForFunction(() => { const d = window.__tycoonWorld.debugInfo().dogs.find((x) => x.id === 'e1'); return d && Math.hypot(d.to.x - d.x, d.to.z - d.z) < 0.2; }, null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const w = await world();
      const d = w.dogs.find((x) => x.id === 'e1');
      const bather = (await f()).staff.find((x) => x.job?.kind === 'bath' && x.job.dog === 'e1');
      const p = bather && w.people.find((x) => x.id === bather.id);
      check(`${label}: in 3D Luna stands in the tub and the bath attendant beside it`, d?.mode === 'bath' && !!p && Math.hypot(p.x - d.x, p.z - d.z) < 2.5, d && p ? `${d.mode}, ${Math.hypot(p.x - d.x, p.z - d.z).toFixed(2)} apart` : 'missing');
      await shot('3-bath');
    }
    await page.waitForTimeout(3000);
    check(`${label}: still bathing a while later (not instant)`, ((await dog('e1'))?.bathing ?? 0) > 0);
    await until(() => window.__tycoonState().facilities.f1.dogs.find((x) => x.id === 'e1')?.bathed === true, null, 60000);
    const bathEnd = (await f()).clockMin;
    check(`${label}: the bath took the full 40 game minutes`, bathEnd - bathStart >= 39, `${(bathEnd - bathStart).toFixed(1)} min`);

    // ---------- 5. the family comes back; the receptionist sends them home; the bill is right ----------
    const coinsBefore = (await st()).coins;
    const bonusBefore = (await f()).ledger.at(-1)?.income.bonus ?? 0;
    await page.evaluate(() => window.__tycoonSet((s) => {
      const f1 = s.facilities.f1;
      return { ...s, pendingLevel: null, facilities: { f1: { ...f1, cleanliness: 95, roomClean: Object.fromEntries(f1.rooms.map((r) => [r.uid, 95])), dogs: f1.dogs.map((d) => (d.id === 'e1' ? { ...d, happiness: Math.max(d.happiness, 85), visit: { ...d.visit, pickup: f1.clockMin + 2 } } : d)) } } };
    }));
    await until(() => !window.__tycoonState().facilities.f1.dogs.some((x) => x.id === 'e1'), null, 40000);
    const o = (await f()).outcomes.at(-1);
    const bathLines = o.lines.filter((l) => /^Bath/.test(l.label) && l.amount > 0);
    const dayLines = o.lines.filter((l) => /^Daycare/.test(l.label));
    check(`${label}: Luna went home with Taylor (a routine pickup by the receptionist)`, o.dog === 'Luna' && o.how === 'checkout');
    check(`${label}: the bill has the daycare and the bath, each once`, bathLines.length === 1 && dayLines.length === 1, o.lines.map((l) => `${l.label} ${l.amount}`).join(' · '));
    const bonus = ((await f()).ledger.at(-1)?.income.bonus ?? 0) - bonusBefore;
    check(`${label}: coins rose by exactly the bill`, (await st()).coins - coinsBefore === o.total + bonus, `${(await st()).coins - coinsBefore} vs ${o.total} + bonus ${bonus}`);
    await page.getByRole('region', { name: 'Receipt' }).waitFor({ timeout: 5000 }).catch(() => {});
    check(`${label}: a receipt shows the result`, (await page.getByRole('region', { name: 'Receipt' }).count()) === 1);
    if ((await page.getByRole('region', { name: 'Receipt' }).count()) === 1) await shot('4-receipt');

    // ---------- 6. wages come out of profit ----------
    const strip = page.getByRole('button', { name: /^Today: revenue/ });
    const wages = 40 * (await f()).staff.length;
    check(`${label}: the Today strip shows the day's wages (tonight's ${wages} + sign-on ${fees})`, (await strip.textContent()).includes(`−${(wages + fees).toLocaleString('en-US')}`), await strip.textContent());
    await speed(0.0001);
    await page.evaluate(() => window.__tycoonSet((s) => ({ ...s, pendingLevel: null, facilities: { f1: { ...s.facilities.f1, clockMin: 1078, dogs: [] } } })));
    const day0 = (await f()).day;
    await speed(4);
    await until((d) => window.__tycoonState().facilities.f1.day > d, day0, 20000);
    await speed(0.0001);
    const closed = (await f()).ledger.find((l) => l.day === day0);
    const report = (await f()).report;
    check(`${label}: closing charged the team's daily wages (plus today's sign-on fees, booked as wages)`, closed?.expenses.wages === wages + fees, `${closed?.expenses.wages} vs ${wages} + ${fees}`);
    check(`${label}: the day's profit is income minus wages, upkeep, supplies and the rest`, !!report && report.profit === report.income - report.expenses);
    await page.evaluate(() => window.__tycoonSet((s) => ({ ...s, pendingLevel: null, facilities: { f1: { ...s.facilities.f1, report: null } } })));
    await page.keyboard.press('Escape').catch(() => {});

    // ---------- 7. buy an expansion and use it ----------
    const roomsBefore = (await f()).rooms.length;
    await page.getByRole('button', { name: /^(Expansion options|See options)$/ }).first().click();
    const card = page.getByRole('region', { name: 'Expand your daycare' });
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();
    await shot('5-expansion');
    const wing = card.getByRole('article', { name: /^Playroom wing for / });
    const groupName = (await wing.getAttribute('aria-label')).replace(/^Playroom wing for | pups$/g, '');
    const buy = wing.getByRole('button', { name: /^Build · / });
    const quoted = Number((await buy.textContent()).replace(/[^0-9]/g, ''));
    const built = async () => { const g = await f(); return g.ledger.find((l) => l.day === g.day)?.expenses.building ?? 0; };
    const b0 = await built();
    await quiet();
    await buy.click();
    await until((n) => window.__tycoonState().facilities.f1.rooms.length > n, roomsBefore);
    const wingRoom = (await f()).rooms.at(-1);
    check(`${label}: the wing is built for exactly the quoted price`, (await built()) - b0 === quoted, `${(await built()) - b0} vs ${quoted}`);
    check(`${label}: the wing is a ${groupName} playroom`, wingRoom.type === 'playroom' && !!wingRoom.group);
    const [size, temper] = wingRoom.group.split('-');
    const clock2 = (await f()).clockMin;
    await page.evaluate(([size, temper, clock2]) => window.__tycoonSet((s) => {
      const f1 = s.facilities.f1;
      const visit = { owner: 'Morgan', requests: ['daycare'], prepaid: [], arrivedDay: f1.day, arrived: clock2, pickupDay: f1.day, pickup: clock2 + 300, ownerHere: null, waitedLobby: 0, checkedInAt: null, history: [], scuffle: false, safeMove: false, finishing: null, remedies: {}, paid: 0, waitBefore: 0 };
      const bruno = { id: 'e2', name: 'Bruno', breed: 0, size, temper, visits: 1, place: { kind: 'lobby' }, checkedIn: false, happiness: 75, clean: 60, boarding: false, played: 0, bathed: false, bathing: null, bathTub: null, visit };
      return { ...s, pendingLevel: null, facilities: { f1: { ...f1, open: true, dogs: [...f1.dogs, bruno] } } };
    }), [size, temper, clock2]);
    await speed(1);
    await until((uid) => window.__tycoonState().facilities.f1.dogs.find((x) => x.id === 'e2')?.place.room === uid, wingRoom.uid, 30000);
    check(`${label}: the receptionist settles the next ${groupName} family in the new wing`, (await dog('e2')).place.room === wingRoom.uid);
    if (desktop) {
      const w = await world();
      check(`${label}: the wing appears in the 3D world`, w.rooms >= roomsBefore + 1, `rooms drawn ${w.rooms}`);
      await shot('6-wing');
    }

    // ---------- 8. reload keeps everything ----------
    await speed(0.0001);
    const before = await st();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    const after = await st();
    const roles = (s) => s.facilities.f1.staff.map((x) => `${x.name}:${x.role ?? '-'}`).join(',');
    check(`${label}: after a reload the team, their roles and priorities are the same`, roles(after) === roles(before), roles(after));
    check(`${label}: after a reload the wing and Bruno are still there`, after.facilities.f1.rooms.some((r) => r.uid === wingRoom.uid) && after.facilities.f1.dogs.some((d) => d.id === 'e2'));
    check(`${label}: after a reload the coins and the visit record are the same`, Math.abs(after.coins - before.coins) <= 5 && after.facilities.f1.outcomes.length === before.facilities.f1.outcomes.length);

    // ---------- 9. layout ----------
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${label}: no sideways scrolling`, overflow <= 1, `${overflow}px`);
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) {
    check(`${label}: scenario finished`, false, String(e).split('\n')[0]);
    await shot('error').catch(() => {});
  }
  await ctx.close();
}

/** A busy scene: 30 pups, 6 people working. Frame time from the renderer, and the engine's cost per second of play. */
async function busy(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
  await steady(page, () => page.evaluate(async ([KEY, SKIPPED]) => {
    localStorage.clear();
    localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false }));
    const kit = await import('/src/tycoon/testkit.ts');
    const team = await import('/src/tycoon/team.ts');
    let s = { ...kit.richState(), coins: 50000, lastSeen: Date.now(), tour: SKIPPED, pendingLevel: null };
    for (const r of ['reception', 'attendant', 'attendant', 'bath', 'cleaner']) s = kit.ok(team.hire(s, r));
    const connect = await import('/src/tycoon/connect.ts');
    const exp = await import('/src/tycoon/expansion.ts');
    // a grown daycare: a playroom wing, an improvement and a second bath station — bought with the real expansions
    s = kit.ok(exp.buyExpansion(s, 'playroom'));
    s = kit.ok(exp.buyExpansion(s, 'playroom'));
    s = kit.ok(exp.buyExpansion(s, 'bath'));
    const f1 = s.facilities.f1;
    // a busy morning: every playroom full (half with a bath booked), more pups calming down, families at the desk
    const calm = f1.rooms.find((r) => r.type === 'calm');
    const slots = connect.caps(f1).playrooms.flatMap((p) => Array.from({ length: p.spots }, () => p));
    const dogs = Array.from({ length: 30 }, (_, i) => {
      const p = slots[i] ?? slots[0];
      const [size, temper] = p.group.split('-');
      const where = i < slots.length ? { kind: 'room', room: p.room.uid } : i < 24 ? { kind: 'calm', room: calm.uid } : { kind: 'lobby' };
      const visit = { owner: 'Fam' + i, requests: i < slots.length && i % 2 === 0 ? ['daycare', 'bath'] : ['daycare'], prepaid: [], arrivedDay: f1.day, arrived: 598, pickupDay: f1.day, pickup: 1000, ownerHere: null, waitedLobby: 0, checkedInAt: 540, history: [], scuffle: false, safeMove: false, finishing: null, remedies: {}, paid: 0, waitBefore: 0 };
      return { id: 'b' + i, name: 'Pup' + i, breed: i % 6, size, temper, visits: 1, place: where, checkedIn: i < 24, happiness: 40 + (i % 5) * 10, clean: 50, boarding: false, played: 0, bathed: false, bathing: null, bathTub: null, visit };
    });
    localStorage.setItem(KEY, JSON.stringify({ ...s, facilities: { f1: { ...f1, open: true, clockMin: 600, dogs } } }));
  }, [KEY, SKIPPED]));
  await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__tycoonWorld);
  await page.waitForTimeout(2500);
  const samples = [];
  for (let i = 0; i < 20; i++) {
    samples.push(await page.evaluate(() => window.__tycoonWorld.debugInfo().frameMs));
    await page.waitForTimeout(250);
  }
  const ms = samples.reduce((a, b) => a + b, 0) / samples.length;
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const step = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(step); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(step); }));
  const engine = await page.evaluate(async () => {
    const run = await import('/src/tycoon/run.ts');
    let s = window.__tycoonState();
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) s = run.tick(s, 0.25, () => 0.99); // 30 seconds of play
    return (performance.now() - t0) / 30;
  });
  const w = await page.evaluate(() => window.__tycoonWorld.debugInfo());
  const working = w.people.filter((p) => p.work || p.walking).length;
  out.push('INFO  busy scene staff: ' + w.people.map((p) => p.status).join(' | '));
  check('busy scene: 30 pups and 6 people on screen', w.dogs.length >= 29 && w.people.length === 6, `${w.dogs.length} pups, ${w.people.length} people`);
  check('busy scene: staff are working or walking', working >= 3, `${working} busy`);
  out.push(`INFO  busy scene (desktop, software graphics): ${fps.toFixed(1)} fps, render ${ms.toFixed(1)} ms/frame, ${w.calls} draw calls; engine ${engine.toFixed(2)} ms per second of play`);
  check('busy scene: the engine keeps up easily (under 20 ms per second of play)', engine < 20, `${engine.toFixed(2)} ms`);
  await page.screenshot({ path: path.join(OUT, 'staff-busy-desktop.png') });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await run(browser, 'iphone', { ...devices['iPhone 13'] });
  await run(browser, 'desktop', { viewport: { width: 1280, height: 800 } });
  await busy(browser).catch((e) => check('busy scene ran', false, String(e).split('\n')[0]));
  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
