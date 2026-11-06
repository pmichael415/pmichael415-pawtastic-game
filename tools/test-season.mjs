// Season 1: Top Dog (owner decision, 5 Nov 2026): one season of four chapters, 9 Nov – Sat 5 Dec 11:59 pm New York.
// The season is a constant in the engine so the server (which bundles this file) and the game agree on it.
//   node --test tools/test-season.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS, seasonFor, chapterOf, seasonEndsAt, playEndsAt, weekKey, weekEndsAt, nextWeek, rulesFor } from '../src/engine/challenge.js';

const ny = ms => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(ms));

test('Season 1 is the constant the owner approved', () => {
  assert.equal(SEASONS.length, 1);
  assert.deepEqual(SEASONS[0], { id: 's1', name: 'Season 1: Top Dog', weeks: ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'], endsAt: '2026-12-06T04:59:59.999Z' });
  assert.equal(Object.isFrozen(SEASONS) && Object.isFrozen(SEASONS[0]) && Object.isFrozen(SEASONS[0].weeks), true, 'nobody can change the season at run time');
});

test('seasonFor and chapterOf: the four chapters are ordinary weeks', () => {
  for (const [i, w] of SEASONS[0].weeks.entries()) {
    assert.equal(seasonFor(w), SEASONS[0]);
    assert.equal(chapterOf(w), i + 1);
  }
  for (const w of ['2026-11-02', '2026-12-07', '2026-10-26', 'nonsense', null]) {
    assert.equal(seasonFor(w), null, `${w} is outside the season`);
    assert.equal(chapterOf(w), null);
  }
  assert.equal(weekKey(Date.parse('2026-11-09T05:00:00Z')), '2026-11-09', 'chapter 1 starts Mon 9 Nov at midnight in New York');
  assert.equal(weekKey(Date.parse('2026-11-09T04:59:59Z')), '2026-11-02', 'a second earlier is the week before the season');
});

test('the season ends Sat 5 Dec at 11:59:59 pm New York: chapter 4 ends Saturday, not Sunday', () => {
  const end = seasonEndsAt(SEASONS[0]);
  assert.equal(end, Date.parse('2026-12-06T04:59:59.999Z'));
  assert.equal(seasonEndsAt('s1'), end, 'by id too');
  assert.ok(Number.isNaN(seasonEndsAt('s9')));
  assert.match(ny(end), /^Sat, Dec 5, 11:59:59\sPM$/);
  assert.match(ny(end + 1), /^Sun, Dec 6, 12:00:00\sAM$/);
  assert.equal(weekKey(end), '2026-11-30');
  assert.equal(playEndsAt('2026-11-30'), end, 'the last chapter stops at the season end');
  assert.ok(playEndsAt('2026-11-30') < weekEndsAt('2026-11-30'));
  for (const w of ['2026-11-09', '2026-11-16', '2026-11-23']) assert.equal(playEndsAt(w), weekEndsAt(w), 'the other chapters end on Monday like weeks');
  for (const w of ['2026-11-02', '2026-12-07']) assert.equal(playEndsAt(w), weekEndsAt(w), 'weeks outside the season are unchanged');
  assert.equal(nextWeek('2026-11-30'), '2026-12-07');
});

test('the rules engine itself is unchanged by the season (the server pins season weeks to version 1)', () => {
  assert.equal(rulesFor('2026-11-16', '2026-11-09').version, 2);
  assert.equal(rulesFor('2026-11-16', null).version, 1);
});

// ---------- what the game shows (src/ui/season.js) ----------
const ui = await import('../src/ui/season.js');
const { resultCaption } = await import('../src/ui/share-card.js');
const IN_CH2 = Date.parse('2026-11-18T15:00:00Z');
const SERVER_SEASON = { id: 's1', name: 'Season 1: Top Dog', chapter: 2, chapters: 4, endsAt: '2026-12-06T04:59:59.999Z', ended: false, prizes: [{ rank: 1, label: 'A free night of boarding' }, { rank: 2, label: 'A free day of daycare and a free exit bath' }, { rank: 3, label: 'A free exit bath' }], prizesConfirmed: true, status: 'running' };

test('the season shown: the server\'s answer for this week, else the engine\'s constant; nothing outside the season', () => {
  assert.deepEqual(ui.seasonOf('2026-11-16', { week: '2026-11-16', season: SERVER_SEASON }, IN_CH2), { ...SERVER_SEASON, fromServer: true });
  assert.equal(ui.seasonOf('2026-11-02', { week: '2026-11-02', season: null }, IN_CH2), null, 'the server says no season');
  assert.equal(ui.seasonOf('2026-11-16', { week: '2026-11-16', season: { id: 's1', chapter: 'x' } }, IN_CH2), null, 'a malformed answer is not shown');
  assert.deepEqual(ui.seasonOf('2026-11-23', { week: '2026-11-16', season: SERVER_SEASON }, IN_CH2), { id: 's1', name: 'Season 1: Top Dog', chapter: 3, chapters: 4, endsAt: '2026-12-06T04:59:59.999Z', ended: false, prizes: null, prizesConfirmed: false, status: null, fromServer: false }, 'until the server answers for this week');
  assert.equal(ui.seasonOf('2026-12-07', null, IN_CH2), null);
  assert.equal(ui.seasonOf('2026-11-30', null, Date.parse('2026-12-06T06:00:00Z')).ended, true);
});

test('the season header, the countdown from the server\'s end time, and the prize line', () => {
  assert.equal(ui.seasonHeadline(SERVER_SEASON), 'Season 1: Top Dog · Chapter 2 of 4 · season ends Sat 5 Dec');
  assert.equal(ui.seasonHeadline({ ...SERVER_SEASON, chapter: 4, ended: true }), 'Season 1: Top Dog · the season is over');
  assert.equal(ui.seasonCountdown(SERVER_SEASON, Date.parse('2026-12-04T04:59:59.999Z')), 'Season ends in 2d 0h');
  assert.equal(ui.seasonCountdown(SERVER_SEASON, Date.parse('2026-12-06T02:29:59.999Z')), 'Season ends in 2h 30m');
  assert.equal(ui.seasonCountdown({ ...SERVER_SEASON, endsAt: '2026-12-01T00:00:00.000Z' }, Date.parse('2026-11-30T23:00:00Z')), 'Season ends in 1h 0m', 'the server\'s end time is what counts down');
  assert.equal(ui.seasonCountdown({ ...SERVER_SEASON, ended: true }, IN_CH2), 'The season is over');
  assert.equal(ui.seasonPrizeLine(SERVER_SEASON.prizes), 'When the season ends, the top 3 at each location win: 1st a free night of boarding, 2nd a free day of daycare and a free exit bath, 3rd a free exit bath.');
  assert.equal(ui.seasonPrizeLine(null), 'When the season ends, the top 3 at each location win real PAWtastic prizes.');
});

test('the team bar: Hawthorne vs Hillsdale by the average of each team\'s top 10', () => {
  const bar = ui.teamBar({ hawthorne: { average: 7500, players: 12, counted: 10 }, hillsdale: { average: 9000, players: 2, counted: 2 } });
  assert.equal(bar.leader, 'hillsdale');
  assert.deepEqual(bar.sides.map(s => [s.id, s.name, s.average, s.players, s.share]), [['hawthorne', 'Hawthorne', 7500, 12, 45], ['hillsdale', 'Hillsdale', 9000, 2, 55]]);
  const even = ui.teamBar({ hawthorne: { average: 0, players: 0, counted: 0 }, hillsdale: { average: 0, players: 0, counted: 0 } });
  assert.equal(even.leader, null);
  assert.deepEqual(even.sides.map(s => s.share), [50, 50]);
  assert.equal(ui.teamBar({ hawthorne: { average: 10, players: 1 }, hillsdale: { average: 10, players: 3 } }).leader, null, 'a tie has no leader');
  assert.equal(ui.teamBar(undefined).leader, null, 'no answer, no leader');
  assert.equal(ui.TEAM_BAR_NOTE, 'The average of each team\'s top 10 season scores, so a busier location doesn\'t win by size.');
});

test('engaged, not compelled: no streak, guilt or pressure wording anywhere in the season text', () => {
  const texts = [
    ...Object.values(ui.SEASON_TEXT), ui.seasonHeadline(SERVER_SEASON), ui.seasonCountdown(SERVER_SEASON, IN_CH2), ui.seasonPrizeLine(SERVER_SEASON.prizes),
    ui.TEAM_BAR_NOTE, resultCaption({ dogName: 'Max', challenge: 'high-score', score: 12345, season: SERVER_SEASON }),
  ];
  for (const t of texts) assert.doesNotMatch(t, /miss|streak|don.t lose|last chance|hurry|only \d+ left|lose your|buy|purchase|treats/i, t);
  assert.match(ui.SEASON_TEXT.how, /best run in each chapter is added up/);
});

test('the Beat My Pup caption names the season and chapter in a season, and the week outside it', () => {
  assert.equal(resultCaption({ dogName: 'Max', challenge: 'high-score', score: 12345, season: SERVER_SEASON }), 'Max scored 12,345 in Season 1: Top Dog (Chapter 2) at PAWtastic Academy. Can your pup beat it?');
  assert.equal(resultCaption({ dogName: 'Max', challenge: 'high-score', score: 12345 }), "Max scored 12,345 in this week's High score run at PAWtastic Academy. Can your pup beat it?");
});

// ---------- audit items 3/4/5 (client): season prizes unconfirmed, and the season's end states ----------
const compete = await import('../src/ui/compete.js');
const LINEUP = SERVER_SEASON.prizes;
const STANDARD = [{ rank: 1, label: 'A free day of daycare' }, { rank: 2, label: 'A free bath' }, { rank: 3, label: 'A free bath' }];
const answer = (season, prizes = season?.prizesConfirmed ? LINEUP : []) => ({ ok: true, week: '2026-11-16', serverNow: '2026-11-18T15:00:00Z', endsAt: '2026-11-23T05:00:00.000Z', moves: 25, next: null, rules: { version: 1, challenges: ['high-score'], from: null }, prizes, season });
const load = async a => { compete.forgetServerWeek(); await compete.loadWeekPrizes({ services: { pay: { challengeWeek: async () => a } } }); return compete.weekSeason('2026-11-16'); };

test('season prizes unconfirmed (prizesConfirmed false, prizes null, [] lineup): "Season prizes are being confirmed", never the standard prizes', async () => {
  for (const season of [{ ...SERVER_SEASON, prizes: null, prizesConfirmed: false }, { ...SERVER_SEASON, prizesConfirmed: false }, { ...SERVER_SEASON, prizes: null, prizesConfirmed: undefined }]) {
    for (const prizes of [[], STANDARD]) { // the new server sends []; an answer with the standard prizes must not show them either
      const s = await load(answer(season, prizes));
      assert.ok(s, 'the season is still shown');
      assert.equal(s.prizesConfirmed, false);
      assert.equal(s.prizes, null);
      assert.equal(ui.seasonPrizeText(s), 'Season prizes are being confirmed.');
      assert.equal(compete.competitionLine('2026-11-16'), 'Season prizes are being confirmed.');
      assert.equal(compete.seasonHeadlinePrize(s), 'Win real PAWtastic prizes');
      for (const t of [ui.seasonPrizeText(s), compete.competitionLine('2026-11-16'), compete.seasonHeadlinePrize(s)]) assert.doesNotMatch(t, /daycare|bath|boarding/i, t);
    }
  }
});

test('season prizes confirmed: the approved lineup, named', async () => {
  const s = await load(answer({ ...SERVER_SEASON }));
  assert.equal(s.prizesConfirmed, true);
  assert.equal(compete.competitionLine('2026-11-16'), 'When the season ends, the top 3 at each location win: 1st a free night of boarding, 2nd a free day of daycare and a free exit bath, 3rd a free exit bath.');
  assert.equal(compete.seasonHeadlinePrize(s), 'Win a free night of boarding');
  const half = await load(answer({ ...SERVER_SEASON, prizes: LINEUP.slice(0, 2), prizesConfirmed: true }, LINEUP.slice(0, 2)));
  assert.equal(half.prizesConfirmed, false, 'an incomplete lineup is not confirmed, whatever the flag says');
});

test('the season has ended: awaiting-close or blocked say winners are being confirmed (no block details); closed shows the results', async () => {
  const over = { ...SERVER_SEASON, chapter: 4, ended: true };
  for (const status of ['awaiting-close', 'blocked']) {
    const s = await load(answer({ ...over, status, reason: 'lineup-not-confirmed', details: { secret: 1 } }));
    assert.equal(ui.seasonPhase(s), 'confirming');
    assert.equal(compete.competitionLine('2026-11-16'), 'The season has ended — winners are being confirmed.');
    assert.equal('reason' in s || 'details' in s, false, 'block details never reach the player\'s screen');
  }
  const closed = await load(answer({ ...over, status: 'closed' }));
  assert.equal(ui.seasonPhase(closed), 'closed');
  assert.equal(compete.competitionLine('2026-11-16'), ui.SEASON_TEXT.over);
  // A "running" answer from before the end, with the server clock now past it: winners are being confirmed.
  const stale = await load(answer({ ...SERVER_SEASON, status: 'running' }));
  assert.equal(ui.seasonPhase(stale, Date.parse('2026-12-06T05:01:00Z')), 'confirming');
  assert.equal(ui.seasonPhase(stale, IN_CH2), 'running');
  // The engine's constant (no answer yet) after the end: as before.
  assert.equal(ui.seasonPhase(ui.seasonOf('2026-11-30', null, Date.parse('2026-12-06T06:00:00Z')), Date.parse('2026-12-06T06:00:00Z')), 'closed');
  assert.match(ui.SEASON_TEXT.confirming, /^The season has ended — winners are being confirmed\.$/);
});

// ---------- audit item 11: the team bar on unrounded averages ----------
test('team bar: the leader is decided on the unrounded averages, equal averages are "Tied", the numbers shown are rounded', () => {
  const close = ui.teamBar({ hawthorne: { average: 7500.4, players: 3, counted: 3 }, hillsdale: { average: 7500.2, players: 5, counted: 5 } });
  assert.equal(close.leader, 'hawthorne', '7500.4 > 7500.2 although both show 7,500');
  assert.deepEqual(close.sides.map(s => s.average), [7500, 7500]);
  assert.equal(close.label, 'Hawthorne leads');
  const flip = ui.teamBar({ hawthorne: { average: 7499.6, players: 1 }, hillsdale: { average: 7500.4, players: 1 } });
  assert.deepEqual([flip.leader, flip.label, ...flip.sides.map(s => s.average)], ['hillsdale', 'Hillsdale leads', 7500, 7500]);
  const tie = ui.teamBar({ hawthorne: { average: 22000 / 3, players: 3 }, hillsdale: { average: 22000 / 3, players: 6 } });
  assert.deepEqual([tie.leader, tie.label, ...tie.sides.map(s => s.average), ...tie.sides.map(s => s.share)], [null, 'Tied', 7333, 7333, 50, 50]);
  assert.equal(ui.teamBar({ hawthorne: { average: 7500.5 }, hillsdale: { average: 7500.49 } }).leader, 'hawthorne');
  assert.equal(ui.teamBar({ hawthorne: { average: '7000.25' }, hillsdale: { average: 7000.25 } }).label, 'Tied', 'a number sent as text is the same number');
  assert.deepEqual(ui.teamBar({ hawthorne: { average: 1000.5 }, hillsdale: { average: 3001.5 } }).sides.map(s => s.share), [25, 75], 'the bar splits on the unrounded averages');
  assert.equal(ui.teamBar(undefined).label, 'Tied');
});
