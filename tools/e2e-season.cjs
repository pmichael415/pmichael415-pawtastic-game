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

const CH2 = '2026-11-18T15:00:00Z'; // Wed 18 Nov, 10 am New York: chapter 2 of 4
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
const mapCard = async page => { await page.goto(GAME, { waitUntil: 'networkidle' }); await closeSheets(page); await page.waitForTimeout(900); return page.innerText('.weekly-card').catch(() => ''); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const contexts = [];
  const newPage = async at => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.clock.setSystemTime(new Date(at)); // the phone's clock; time runs on from there
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    return page;
  };
  const moveClocks = async at => { await post('/mock/clock', { now: at }); for (const c of contexts) await c.clock.setSystemTime(new Date(at)); };

  // 0. The owner's approved lineup for the week of 9 Nov is the season's.
  await post('/mock/clock', { now: CH2 });
  await post('/mock/week-prizes', { week: '2026-11-09', labels: ['A free night of boarding', 'A free day of daycare and a free exit bath', 'A free exit bath'], approved: true });

  // 1. Chapter 2: the map card shows the season, its chapter, its end and the countdown.
  const a = await newPage(CH2);
  await enroll(a, 'Max', 'Hawthorne');
  let card = await mapCard(a);
  check(/Season 1: Top Dog · Chapter 2 of 4 · season ends Sat 5 Dec/i.test(card), 'map: season header with the chapter and the end day', flat(card).slice(0, 200));
  check(/Season ends in 17d 1[34]h/i.test(card), 'map: countdown to the season end (Sat 5 Dec 11:59 pm New York)', (card.match(/Season ends in [^\n]*/i) || [''])[0]);
  check(/1st a free night of boarding, 2nd a free day of daycare and a free exit bath, 3rd a free exit bath/.test(card) && /When the season ends/.test(card), 'map: the season prizes, given when it ends');
  check(/best run in each chapter is added up/i.test(card) && !/this week|resets|miss|streak/i.test(card), 'map: chapter wording, no "this week", no streak or guilt wording');
  check(await a.$('.weekly-card.season-card'), 'map: the card keeps the weekly-card class');
  await cardShot(a, '01-season-map-card-chapter2');

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

  // 5. Chapter 4 ends on Saturday: the countdown runs to Sat 5 Dec, not Monday.
  await moveClocks(CH4);
  card = await mapCard(a);
  check(/Chapter 4 of 4/i.test(card) && /Season ends in 2d 1[34]h/i.test(card), 'chapter 4: the countdown ends on Saturday', (card.match(/Season ends in [^\n]*/i) || [''])[0]);

  // 6. The season ends: runs are refused; the first request closes it once; winners are told; staff see the prizes.
  await moveClocks(AFTER);
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
    await shot(a, label === 'the week after the season' ? '07-after-season-week' : '08-before-season-week', false);
  }

  check(errors.length === 0, 'no page errors', errors.join(' / '));
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
