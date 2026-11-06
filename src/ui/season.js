// Season 1: Top Dog as the game shows it (owner decision, 5 Nov 2026): four chapters (each week of the season is
// a chapter with its own board), a season score that is the best run of each chapter added up, a Hawthorne vs
// Hillsdale team bar, and prizes once, when the season ends. Engaged, not compelled: coming back each chapter
// counts and skipping one only adds nothing, so nothing here talks about streaks, missing out or hurrying, and
// nothing here can be bought. The season comes from the server's answer; until it answers, from the engine's
// SEASONS constant (the server bundles the same file, so they agree).

import { seasonFor, chapterOf, seasonEndsAt } from '../engine/challenge.js';
import { LOCATIONS } from '../engine/levels.js';
import { serverNow } from '../net/server-clock.js';

export const SEASON_TEXT = {
  how: 'Your best run in each chapter is added up to make your season score. Same board for everyone each chapter; no boosters, and tries are free.',
  chapterBoard: 'Each chapter has its own board. Your best this chapter is added to your season score.',
  inPrizes: 'In the top 3 at your location right now! Prizes are given when the season ends.',
  over: 'Thanks for playing! Winners hear from us in the game and by email.', // shown under a header that says the season is over
  winners: 'Winners hear from us in the game and by email.',
  chapterOver: "This chapter just ended, so this run can't count. The next chapter is ready!",
  seasonOver: "The season is over, so this run can't count. Thanks for playing!",
  noScores: 'No season scores yet. Be the first!',
};
export const TEAM_BAR_NOTE = "The average of each team's top 10 season scores, so a busier location doesn't win by size.";

const goodLineup = v => Array.isArray(v) && v.length === 3 && v.every((p, i) => p && p.rank === i + 1 && typeof p.label === 'string' && p.label.length >= 3 && p.label.length <= 80);
const goodSeason = s => !!s && typeof s.id === 'string' && typeof s.name === 'string' && s.name.length <= 60
  && Number.isInteger(s.chapter) && Number.isInteger(s.chapters) && s.chapter >= 1 && s.chapter <= s.chapters && !Number.isNaN(Date.parse(s.endsAt));

/**
 * The season to show for a week: the server's answer when it is about this week (`server` = { week, season }), else
 * the engine's constant; null outside a season.
 */
export function seasonOf(week, server = null, now = serverNow()) {
  if (server && server.week === week) {
    const s = server.season;
    return goodSeason(s) ? { id: s.id, name: s.name, chapter: s.chapter, chapters: s.chapters, endsAt: s.endsAt, ended: !!s.ended, prizes: goodLineup(s.prizes) ? s.prizes : null } : null;
  }
  const s = seasonFor(week);
  return s ? { id: s.id, name: s.name, chapter: chapterOf(week), chapters: s.weeks.length, endsAt: s.endsAt, ended: now > seasonEndsAt(s), prizes: null } : null;
}

const nyDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', day: 'numeric', month: 'short' });
/** "Sat 5 Dec": the New York day an end time falls on. */
export function endDay(iso) {
  const p = Object.fromEntries(nyDay.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "3d 4h", or "5h 12m" in the last day. */
export function fmtLeft(ms) {
  const hours = Math.max(0, Math.floor(ms / 3600000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.max(0, Math.floor(ms / 60000) % 60)}m`;
}

/** "Season 1: Top Dog · Chapter 2 of 4 · season ends Sat 5 Dec" */
export const seasonHeadline = s => (s.ended ? `${s.name} · the season is over` : `${s.name} · Chapter ${s.chapter} of ${s.chapters} · season ends ${endDay(s.endsAt)}`);

/** "Season ends in 18d 4h", counted down to the end time the server gave, by the server's clock. */
export function seasonCountdown(s, now = serverNow()) {
  const end = Date.parse(s.endsAt);
  return s.ended || !(end > now) ? 'The season is over' : `Season ends in ${fmtLeft(end - now)}`;
}

const lower = t => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
/** The season's prizes, given once when it ends (general wording until the server confirms the lineup). */
export function seasonPrizeLine(prizes) {
  if (!goodLineup(prizes)) return 'When the season ends, the top 3 at each location win real PAWtastic prizes.';
  const [a, b, c] = prizes.map(p => lower(p.label));
  return `When the season ends, the top 3 at each location win: 1st ${a}, 2nd ${b}, 3rd ${c}.`;
}

/** Hawthorne vs Hillsdale: each side's average (of its top 10), its bar share in %, and the leader (null when even). */
export function teamBar(teams) {
  const sides = Object.entries(LOCATIONS).map(([id, name]) => {
    const t = teams?.[id] ?? {};
    return { id, name, average: Math.max(0, Math.round(Number(t.average) || 0)), players: Math.max(0, Number(t.players) || 0), counted: Math.max(0, Number(t.counted) || 0) };
  });
  const sum = sides.reduce((s, x) => s + x.average, 0);
  const first = sum ? Math.round((sides[0].average / sum) * 100) : 50;
  sides[0].share = first; sides[1].share = 100 - first;
  const leader = sides[0].average === sides[1].average ? null : (sides[0].average > sides[1].average ? sides[0] : sides[1]).id;
  return { sides, leader };
}
