// Season 1: Top Dog end to end against tools/mock-pay-server.mjs (Chromium), with the server's and the phone's
// clocks moved: inside the season (chapter 2 and chapter 4), after it ends (Sunday 6 Dec: the one close, the
// winners told, the staff page), and outside it (the week before, and the week after: everything as before).
//   node tools/mock-pay-server.mjs dist 8863 &   then   node tools/e2e-season.cjs http://127.0.0.1:8863 [screenshot folder]

const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8863';
const shots = process.argv[3] || null;
const GAME = `${base}/play/index.html`;
const results = [];
const check = (ok, label, extra = '') => { results.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json());
const state = async () => (await fetch(`${base}/mock/state`)).json();
const flat = t => t.replace(/\n+/g, ' | ');
const shot = async (page, name, fullPage = true) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage }); };
const cardShot = async (page, name) => {
  if (!shots) return;
  await page.$eval('.weekly-card', el => el.scrollIntoView({ block: 'center' })).catch(() => {}); // clear of the sticky top bar
  await (await page.$('.weekly-card'))?.screenshot({ path: `${shots}/${name}.png` });
};

const H = 3600000, D = 24 * H;
const CH2 = '2026-11-18T15:00:00Z'; // Wed 18 Nov, 10 am New York: chapter 2 of 4
const MON_JUST_AFTER = '2026-11-16T05:00:30Z'; // Mon 16 Nov, 12:00:30 am New York: chapter 2 has just started
const SUN_JUST_BEFORE = '2026-11-16T04:30:00Z'; // Sun 15 Nov, 11:30 pm New York: still chapter 1
const SAT_LATE = '2026-12-06T04:58:00Z'; // Sat 5 Dec, 11:58 pm New York: the season's last two minutes
const JUST_ENDED = '2026-12-06T05:02:00Z'; // Sun 6 Dec, 12:02 am: ended, inside the 5 minutes' grace (awaiting the close)
const LINEUP = ['A free night of boarding', 'A free day of daycare and a free exit bath', 'A free exit bath'];
// The rules page: the owner-approved season paragraph (CONTRACT), and the ordinary weekly-prize paragraph.
const SEASON_RULES = "Season 1: Top Dog runs from Mon 9 Nov 2026, 12:00 am, to Sat 5 Dec 2026, 11:59 pm (New York), in four chapters. Your best score in each chapter is added up to make your season score; a chapter you don't play adds nothing. No purchase necessary, and buying anything never helps. No weekly prizes are given during the season. When it ends, the top 3 players at each location by season score win the season's prizes shown in the game, for one dog. Your location is the one of your first run in the season. Ties go to whoever reached their latest counted score first. The team bar compares the average of each location's top 10 season scores; it wins no PAWtastic prize.";
const WEEKLY_PRIZE_RULES = "To be ranked you sign in and pick your PAWtastic (Hawthorne or Hillsdale). When the week ends, the top 3 players at each location win that week's prizes, for one dog. Each week's prizes are shown in the game during that week (for example a free day of daycare or a free bath); a week without other prizes shown awards 1st place a free day of daycare and 2nd and 3rd place a free bath. Ties go to the player who reached the score first. Scores are checked by our server, which replays every move.";
const CH4 = '2026-12-03T15:00:00Z'; // Thu 3 Dec: chapter 4, which ends Saturday
const AFTER = '2026-12-06T05:06:00Z'; // Sun 6 Dec, 12:06 am: the season ended 6 minutes ago
const BEFORE = '2026-11-05T15:00:00Z'; // the week before the season
const NEXT_WEEK = '2026-12-09T15:00:00Z'; // the week after the season

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    const b = await page.$(['Collect', "Let's go", 'OK', 'Yay!', 'Play the game', 'Keep playing here'].map(n => `.sheet button:text-is("${n}")`).join(', '));
    if (!b) return;
    await b.click({ force: true });
  }
}
async function signIn(page, email) {
  await page.waitForSelector('#signin-email');
  await page.fill('#signin-email', email);
  await page.click('.sheet button:text-is("Email me a code")');
  await page.waitForSelector('#signin-code');
  await page.fill('#signin-code', '123456');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.click('.sheet button:text-is("Sign in")')]);
  await page.waitForTimeout(1500);
  await closeSheets(page);
}
async function enroll(page, name, home) {
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', name);
  await page.click(`.home-choice:has-text("${home}")`);
  await page.click('text=Start school');
  await page.waitForTimeout(700);
  await closeSheets(page);
}
async function playChallenge(page) {
  await page.goto(`${GAME}?debug=1`, { waitUntil: 'networkidle' });
  await closeSheets(page);
  await page.click('.weekly-card button:has-text("Play")');
  await page.waitForFunction(() => !!window.__pawtasticChallenge);
  for (let i = 0; i < 25; i++) {
    await page.evaluate(async () => { const c = window.__pawtasticChallenge; const m = c.validMove(); await c.swap(m.a, m.b); });
  }
  await page.waitForSelector('.sheet .big-score', { timeout: 15000 });
}
// The phone's clock off the server's by `ms` (hours or days, ahead or behind): shifts Date and Date.now() in the page.
function skewPhoneClock(ms) {
  const Real = Date;
  class PhoneDate extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + ms); }
    static now() { return Real.now() + ms; }
  }
  globalThis.Date = PhoneDate;
}
// Opens the challenge from the map card and says which week's board it is playing.
async function boardWeek(page) {
  await page.goto(`${GAME}?debug=1`, { waitUntil: 'networkidle' });
  await closeSheets(page);
  await page.click('.weekly-card button:has-text("Play")');
  await page.waitForFunction(() => !!window.__pawtasticChallenge, null, { timeout: 15000 });
  return page.evaluate(() => window.__pawtasticChallenge.week);
}
// The rules page's paragraphs as rendered (DOM text; whitespace normalised only).
async function rulesParagraphs(page) {
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await closeSheets(page);
  await page.click('button[aria-label="Sound and effects"]', { force: true });
  await page.waitForTimeout(300);
  await page.click('.sheet button:text-is("Game rules & privacy")');
  await page.waitForSelector('section.rules');
  await page.waitForTimeout(800);
  return page.$$eval('section.rules p', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
}
const phoneTime = page => page.evaluate(() => new Date().toISOString());
const staffToken = async () => (await (await fetch(`${base}/auth/v1/verify`, { method: 'POST', headers: { apikey: 'sb_publishable_mock_key', 'content-type': 'application/json' }, body: JSON.stringify({ type: 'email', email: 'info@pawtasticacademy.com', token: '123456' }) })).json()).access_token;
const staffPost = async body => (await fetch(`${base}/api/public/game/staff/prizes`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await staffToken()}` }, body: JSON.stringify(body) })).json();
const mapCard = async page => { await page.goto(GAME, { waitUntil: 'networkidle' }); await closeSheets(page); await page.waitForTimeout(900); return page.innerText('.weekly-card').catch(() => ''); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const contexts = [];
  const newPage = async (at, skew = 0) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.clock.setSystemTime(new Date(at)); // the phone's clock; time runs on from there
    contexts.push(context);
    const page = await context.newPage();
    if (skew) await page.addInitScript(skewPhoneClock, skew); // a phone whose clock is wrong
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    return page;
  };
  const moveClocks = async at => { await post('/mock/clock', { now: at }); for (const c of contexts) await c.clock.setSystemTime(new Date(at)); };

  // 0. The season's lineup (the week of 9 Nov) is still a draft: "Season prizes are being confirmed", never the
  //    standard weekly prizes (audit items 3/4/5).
  await post('/mock/clock', { now: CH2 });
  await post('/mock/week-prizes', { week: '2026-11-09', labels: LINEUP, approved: false });
  const a = await newPage(CH2);
  await enroll(a, 'Max', 'Hawthorne');
  let card = await mapCard(a);
  check(/Season prizes are being confirmed/.test(card) && !/daycare|bath|boarding/i.test(card), 'lineup not confirmed: the map says "Season prizes are being confirmed", no standard prizes', flat(card).slice(0, 220));
  await cardShot(a, '00-season-prizes-being-confirmed');
  await a.click('.weekly-card button:text-is("Leaderboard")');
  await a.waitForSelector('.leaderboard .season-card');
  await a.waitForTimeout(800);
  const pending = await a.innerText('.leaderboard .season-card');
  check(/Season prizes are being confirmed/.test(pending) && !/daycare|bath|boarding/i.test(pending), 'lineup not confirmed: the Season board says so too', flat(pending).slice(0, 200));

  // The owner approves the lineup for the week of 9 Nov: it is the season's.
  await post('/mock/week-prizes', { week: '2026-11-09', labels: LINEUP, approved: true });

  // 1. Chapter 2: the map card shows the season, its chapter, its end and the countdown.
  card = await mapCard(a);
  check(/Season 1: Top Dog · Chapter 2 of 4 · season ends Sat 5 Dec/i.test(card), 'map: season header with the chapter and the end day', flat(card).slice(0, 200));
  check(/Season ends in 17d 1[34]h/i.test(card), 'map: countdown to the season end (Sat 5 Dec 11:59 pm New York)', (card.match(/Season ends in [^\n]*/i) || [''])[0]);
  check(/1st a free night of boarding, 2nd a free day of daycare and a free exit bath, 3rd a free exit bath/.test(card) && /When the season ends/.test(card), 'map: the season prizes, given when it ends');
  check(/best run in each chapter is added up/i.test(card) && !/this week|resets|miss|streak/i.test(card), 'map: chapter wording, no "this week", no streak or guilt wording');
  check(await a.$('.weekly-card.season-card'), 'map: the card keeps the weekly-card class');
  await cardShot(a, '01-season-map-card-chapter2');

  // 1b. The rules page during the season: exactly the owner-approved paragraph, and no weekly-prize paragraph (item 9).
  let rules = await rulesParagraphs(a);
  check(rules.filter(t => t === SEASON_RULES).length === 1 && rules.filter(t => t.startsWith('Season 1: Top Dog')).length === 1, 'rules page in the season: exactly the approved season paragraph (rendered text)', rules.find(t => /^Season 1/.test(t))?.slice(0, 80));
  check(!rules.includes(WEEKLY_PRIZE_RULES) && !rules.some(t => /When the week ends|a week without other prizes shown/.test(t)), 'rules page in the season: no ordinary weekly-prize paragraph');
  await shot(a, '01b-rules-in-season');

  // 2. A run, then sign in: it is sent and counted for the chapter and the season.
  await playChallenge(a);
  const sheetA = await a.innerText('.sheet');
  check(/Season 1: Top Dog · Chapter 2/i.test(sheetA) && /first run this chapter sets the mark/i.test(sheetA), 'run result: the season and chapter, chapter wording', flat(sheetA).slice(0, 160));
  await a.click('.sheet button:text-is("Sign in")');
  await signIn(a, 'max@example.com');
  const s1 = await state();
  const maxRun = s1.weekly.find(w => w.week === '2026-11-16');
  check(maxRun && maxRun.location === 'hawthorne', 'the run is sent, replayed and stored for chapter 2', JSON.stringify(s1.weekly.map(w => [w.week, w.score])));

  // 3. A Hillsdale player: the result shows the chapter rank and the season standing.
  const b = await newPage(CH2);
  await enroll(b, 'Bella', 'Hillsdale');
  await b.click('button[aria-label="Sound and effects"]', { force: true });
  await b.waitForTimeout(300);
  await b.click('.sheet button:text-is("Save progress to the cloud")');
  await signIn(b, 'bella@example.com');
  await playChallenge(b);
  await b.waitForFunction(() => /Season: #\d+ at Hillsdale/.test(document.querySelector('.sheet')?.innerText ?? ''), null, { timeout: 15000 }).catch(() => {});
  const sheetB = await b.innerText('.sheet');
  check(/#1 at Hillsdale this chapter/.test(sheetB) && /Season: #1 at Hillsdale with [\d,]+ pts/.test(sheetB) && /In the top 3 at your location right now/.test(sheetB), 'run result: chapter rank, season standing, "in the top 3"', flat(sheetB).slice(-220));
  await shot(b, '02-season-run-result');

  // 4. The leaderboard opens on the Season board with the team bar.
  await b.click('.sheet button:text-is("Leaderboard")');
  await b.waitForSelector('.lb-row');
  await b.waitForTimeout(500);
  let board = await b.innerText('.leaderboard');
  const tabs = (await b.$$eval('.seg[aria-label="Leaderboard"] .seg-btn', els => els.map(e => e.textContent)));
  check(tabs.join('|') === 'Season|This chapter|All-time' && await b.$('.seg-btn.on:text-is("Season")'), 'leaderboard: Season tab first and open, then This chapter and All-time', tabs.join('|'));
  check(/Team bar · Hawthorne vs Hillsdale/i.test(board) && await b.$('.team-bar-track .team-bar-fill.team-hawthorne') && /top 10 season scores/.test(board), 'leaderboard: the team bar (average of top 10)');
  check(/Max/.test(board) && /Bella/.test(board) && /Season ends in/i.test(board), 'leaderboard: both players with season scores, and the countdown');
  await shot(b, '03-season-leaderboard');
  await b.click('.seg-btn:text-is("This chapter")');
  await b.waitForSelector('.lb-row');
  await b.waitForTimeout(500);
  board = await b.innerText('.leaderboard');
  check(/Chapter 2 of 4 · ends in/i.test(board) && !/Team bar|Team battle/i.test(board) && /Each chapter has its own board/.test(board), 'chapter board: its own scores, no team battle (the season has the bar)', flat(board).slice(0, 220));
  await shot(b, '04-chapter-leaderboard');

  // 4b. A wrong phone clock (hours or days, ahead or behind) never picks the chapter, the board or the countdown.
  for (const [label, skew, name] of [['6 days ahead', 6 * D, 'Ahead'], ['9 days behind', -9 * D, 'Behind'], ['3 hours behind', -3 * H, 'Late']]) {
    const p = await newPage(CH2, skew);
    await enroll(p, name, 'Hawthorne');
    const phone = await phoneTime(p);
    card = await mapCard(p);
    check(/Chapter 2 of 4/i.test(card) && /Season ends in 17d 1[34]h/i.test(card), `phone ${label}: the map shows the server's chapter and countdown`, `phone ${phone} · ${(card.match(/Chapter \d of 4|Season ends in [^\n]*/gi) || []).join(' · ')}`);
    const w = await boardWeek(p);
    check(w === '2026-11-16', `phone ${label}: the board played is the server's chapter 2`, w);
    if (name === 'Ahead') {
      // Signed in, the run is submitted for the server's chapter and counted there.
      await p.goto(GAME, { waitUntil: 'networkidle' });
      await closeSheets(p);
      await p.click('button[aria-label="Sound and effects"]', { force: true });
      await p.waitForTimeout(300);
      await p.click('.sheet button:text-is("Save progress to the cloud")');
      await signIn(p, 'ahead@example.com');
      await playChallenge(p);
      await p.waitForFunction(() => /this chapter/.test(document.querySelector('.sheet')?.innerText ?? ''), null, { timeout: 15000 }).catch(() => {});
      const st = await state();
      const id = Object.entries(st.players).find(([, v]) => v.dogName === 'Ahead')?.[0];
      check(id && st.weekly.some(r => r.userId === id && r.week === '2026-11-16') && !st.weekly.some(r => r.userId === id && r.week !== '2026-11-16'), 'phone 6 days ahead: the run is submitted and counted for chapter 2', JSON.stringify(st.weekly.filter(r => r.userId === id).map(r => r.week)));
      await staffPost({ action: 'hide', userId: id, hidden: true }); // keeps the season's winners below as they were
    }
  }
  // The Monday boundary: the server's chapter whichever side of midnight the phone is on.
  await moveClocks(MON_JUST_AFTER);
  let p = await newPage(MON_JUST_AFTER, -H);
  await enroll(p, 'Sunday', 'Hillsdale');
  card = await mapCard(p);
  check(/Chapter 2 of 4/i.test(card), 'Monday 12:00 am, phone an hour behind (Sunday): chapter 2 on the map', `phone ${await phoneTime(p)}`);
  check(await boardWeek(p) === '2026-11-16', 'Monday 12:00 am, phone an hour behind: the board is chapter 2\'s');
  await moveClocks(SUN_JUST_BEFORE);
  p = await newPage(SUN_JUST_BEFORE, H);
  await enroll(p, 'Monday', 'Hillsdale');
  card = await mapCard(p);
  check(/Chapter 1 of 4/i.test(card) && /Season ends in/i.test(card), 'Sunday 11:30 pm, phone an hour ahead (Monday): still chapter 1 on the map', `phone ${await phoneTime(p)}`);
  check(await boardWeek(p) === '2026-11-09', 'Sunday 11:30 pm, phone an hour ahead: the board is chapter 1\'s');
  await moveClocks(CH2);

  // 5. Chapter 4 ends on Saturday: the countdown runs to Sat 5 Dec, not Monday.
  await moveClocks(CH4);
  card = await mapCard(a);
  check(/Chapter 4 of 4/i.test(card) && /Season ends in 2d 1[34]h/i.test(card), 'chapter 4: the countdown ends on Saturday', (card.match(/Season ends in [^\n]*/i) || [''])[0]);
  // The season's last minutes on Saturday, with the phone a day behind or ten minutes ahead.
  await moveClocks(SAT_LATE);
  for (const [label, skew] of [['a day behind', -D], ['10 minutes ahead', 10 * 60000]]) {
    const q = await newPage(SAT_LATE, skew);
    await enroll(q, skew < 0 ? 'Friday' : 'Sooner', 'Hawthorne');
    card = await mapCard(q);
    check(/Chapter 4 of 4/i.test(card) && /Season ends in 0h 1m/i.test(card) && await q.$('.weekly-card button:has-text("Play"):visible'), `Sat 5 Dec 11:58 pm, phone ${label}: "Season ends in 0h 1m" and still playable`, `phone ${await phoneTime(q)} · ${(card.match(/Season ends in [^\n]*/i) || [''])[0]}`);
    if (skew < 0) await shot(q, '09-saturday-last-minutes-phone-behind', false);
  }

  // 6. The season ends. Inside the 5 minutes' grace it is awaiting its close: "winners are being confirmed".
  await moveClocks(JUST_ENDED);
  card = await mapCard(a);
  check(/The season has ended — winners are being confirmed/.test(card) && !/Season ends in/i.test(card) && !(await a.$('.weekly-card button:has-text("Play"):visible')), 'awaiting the close: "The season has ended — winners are being confirmed", no countdown, no play', flat(card).slice(0, 200));
  check((await state()).seasons[0].status === 'awaiting-close' && (await state()).prizes.length === 0, 'awaiting the close: nothing awarded yet');
  await cardShot(a, '05a-season-ended-winners-being-confirmed');
  // The lineup is a draft again at the end: the close is blocked. Players see the same words, never why.
  await post('/mock/week-prizes', { week: '2026-11-09', labels: LINEUP, approved: false });
  await moveClocks(AFTER);
  card = await mapCard(a);
  const blocked = (await state()).seasons[0];
  check(blocked.status === 'blocked' && blocked.reason === 'lineup-not-confirmed' && (await state()).prizes.length === 0, 'the close is blocked (lineup not confirmed): nothing awarded', `${blocked.status} ${blocked.reason}`);
  check(/The season has ended — winners are being confirmed/.test(card) && !/lineup|blocked|occupied|daycare|bath|boarding/i.test(card), 'blocked: players see "winners are being confirmed", no details and no standard prizes', flat(card).slice(0, 200));
  await post('/mock/week-prizes', { week: '2026-11-09', labels: LINEUP, approved: true });

  // 6b. Approved again: runs are refused; the first request closes it once; winners are told; staff see the prizes.
  const token = await a.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-session-v1')).access_token);
  const late = await fetch(`${base}/api/public/game/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ week: '2026-11-30', moves: maxRun.moves }) });
  check(late.status === 400 && (await late.json()).error === 'week-over', 'after the season end (+5 min) a run is refused: week-over');
  await a.goto(GAME, { waitUntil: 'networkidle' });
  // A new day's sheets come first (the clock moved); the prize news waits for a calm map, then shows.
  for (let i = 0; i < 40 && !(await a.$('.sheet .prize-card')); i++) {
    const other = await a.$(['Collect', "Let's go", 'OK', 'Play the game', 'Keep playing here'].map(n => `.sheet button:text-is("${n}")`).join(', '));
    if (other) await other.click({ force: true });
    await a.waitForTimeout(500);
  }
  const won = await a.innerText('.sheet:has(.prize-card)').catch(() => '');
  const prizes = (await state()).prizes;
  check(prizes.length === 2 && prizes.every(p => p.week === '2026-11-09' && p.rank === 1 && p.label === 'A free night of boarding'), 'season closed once: #1 at each location wins the season\'s 1st prize', JSON.stringify(prizes.map(p => [p.week, p.location, p.rank, p.label])));
  check(/placed in Season 1: Top Dog!/.test(won) && /Season 1: Top Dog · #1 at Hawthorne/i.test(won) && /free night of boarding/i.test(won), 'winner is told: placed in Season 1: Top Dog', flat(won).slice(0, 200));
  await shot(a, '05-season-winner');
  await closeSheets(a);
  card = await mapCard(a);
  await cardShot(a, '05b-season-map-card-ended');
  check(/the season is over/i.test(card) && /Thanks for playing/.test(card) && !/Season ends in/i.test(card) && !(await a.$('.weekly-card button:has-text("Play"):visible')), 'map after the end: the season is over, no countdown, no play button', flat(card).slice(0, 200));
  await fetch(`${base}/api/public/game/leaderboard?board=season`);
  check((await state()).prizes.length === 2, 'closing again changes nothing');
  // Sunday 6 Dec with a phone two days behind (Friday: "the season is still on") or a day ahead (a week after it).
  for (const [label, skew] of [['two days behind', -2 * D], ['a day ahead', D]]) {
    const q = await newPage(AFTER, skew);
    await enroll(q, skew < 0 ? 'Friday' : 'Monday', 'Hillsdale');
    card = await mapCard(q);
    check(/the season is over/i.test(card) && !/Season ends in/i.test(card) && !(await q.$('.weekly-card button:has-text("Play"):visible')), `Sun 6 Dec, phone ${label}: the season is over, no countdown, no play button`, `phone ${await phoneTime(q)} · ${flat(card).slice(0, 120)}`);
  }
  const desk = await newPage(AFTER);
  await desk.goto(`${base}/staff/index.html`, { waitUntil: 'networkidle' });
  await desk.fill('#email', 'info@pawtasticacademy.com');
  await desk.click('button:text-is("Email me a sign-in code")');
  await desk.fill('#code', '123456');
  await desk.click('button:text-is("Sign in")');
  await desk.waitForTimeout(1000);
  const staff = await desk.innerText('body');
  check(/Season 1: Top Dog prizes/.test(staff) && /#1 Hawthorne · Season 1: Top Dog · code/.test(staff) && /Season 1: Top Dog standings/.test(staff), 'staff page: season prizes and standings', flat(staff).slice(0, 200));
  await shot(desk, '06-staff-after-season');

  // 7. Outside the season everything is as before: the week after, and the week before.
  for (const [at, label] of [[NEXT_WEEK, 'the week after the season'], [BEFORE, 'the week before the season']]) {
    await moveClocks(at);
    card = await mapCard(a);
    check(/^Weekly Challenge · ends in/i.test(card) && !/Season|Chapter/.test(card), `${label}: the Weekly Challenge card as before`, flat(card).slice(0, 160));
    await cardShot(a, label === 'the week after the season' ? '07a-after-season-map-card' : '08a-before-season-map-card');
    await a.goto(GAME, { waitUntil: 'networkidle' });
    await closeSheets(a);
    await a.click('.weekly-card button:text-is("Leaderboard")');
    await a.waitForTimeout(1200);
    const t = await a.$$eval('.seg[aria-label="Leaderboard"] .seg-btn', els => els.map(e => e.textContent));
    check(t.join('|') === 'This week|All-time' && !/Team bar/.test(await a.innerText('.leaderboard')), `${label}: leaderboard tabs as before (no Season tab)`, t.join('|'));
    rules = await rulesParagraphs(a);
    check(rules.filter(t => t === WEEKLY_PRIZE_RULES).length === 1 && !rules.some(t => /Season 1|season score/.test(t)), `${label}: rules page as before (the weekly-prize paragraph unchanged, no season paragraph)`);
    await shot(a, label === 'the week after the season' ? '07-after-season-week' : '08-before-season-week', false);
  }

  check(errors.length === 0, 'no page errors', errors.join(' / '));
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
