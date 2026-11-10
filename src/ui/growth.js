// Growth helpers (owner, 10 Nov 2026; spec "More players for PAWtastic Games"): readable prize dates in New York time,
// the expiry reminder, the free-evaluation booking links, and how close a player is to a prize. Pure: no DOM, no I/O.

const NY = 'America/New_York';
const DAY = 86400000;
const fmt = options => new Intl.DateTimeFormat('en-US', { timeZone: NY, ...options });
const SHORT = fmt({ month: 'short', day: 'numeric' });
const LONG = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const WEEK = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const valid = d => !Number.isNaN(d.getTime());

/** "2026-10-26" (a Monday, the week's key) → "Week of Oct 26". */
export function weekLabel(week) {
  const d = new Date(`${week}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(String(week)) && valid(d) ? `Week of ${WEEK.format(d)}` : 'Weekly Challenge';
}

/** A moment as a New York day: "Dec 9". */
export const nyDate = iso => { const d = new Date(iso); return valid(d) ? SHORT.format(d) : ''; };
/**
 * The last New York day a prize can be used: weekly prizes expire at 00:00 New York time (so the day before) and season
 * prizes at 23:59:59.999; one millisecond back covers both. "Dec 8".
 */
export const nyUseBy = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? SHORT.format(new Date(t - 1)) : ''; };
/** A moment as a New York day with its weekday: "Wed, Dec 9". */
export const nyLongDate = iso => { const d = new Date(iso); return valid(d) ? LONG.format(d) : ''; };

/** A won (not yet redeemed) prize in its last 7 days. */
export function expiringSoon(prize, nowMs = Date.now()) {
  const end = Date.parse(prize?.expiresAt ?? '');
  return prize?.status === 'won' && Number.isFinite(end) && end > nowMs && end - nowMs <= 7 * DAY;
}

/** Each location's free-evaluation booking page (the same pages the hub's Visit page uses). */
export const EVAL_LINKS = {
  hawthorne: 'https://pawtasticacademy.com/booking-page-ht',
  hillsdale: 'https://pawtasticacademy.com/booking-page',
};

/** The booking link for a location, tagged so a booking can be traced to the game (`from`: where it was tapped). */
export function evalLink(location, from) {
  const loc = location in EVAL_LINKS ? location : 'hawthorne';
  const q = new URLSearchParams({ utm_source: 'graduation_day', utm_medium: 'game', utm_campaign: 'free_evaluation', utm_content: `${from}-${loc}` });
  return `${EVAL_LINKS[loc]}?${q}`;
}

/** Of the player's prizes, the won one that expires first, if it's in its last 7 days (the map's reminder). */
export function expiringPrize(prizes, nowMs = Date.now()) {
  if (!Array.isArray(prizes)) return null;
  return prizes.filter(p => expiringSoon(p, nowMs)).sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))[0] ?? null;
}

const BOARD_SIZE = 50; // the server shows the top 50 of a board
const places = n => `${n} place${n === 1 ? '' : 's'}`;

/**
 * How close a player is to a prize at their location: `entries` is the location's board (best first, top 50), `me` the
 * signed-in player's row ({rank, score}) or null, `score` a guest's best on this phone. Ties go to whoever got there
 * first, so a guest ranks after equal scores. Below the 50th entry a guest's rank is unknown and never guessed.
 * Returns null when there is nothing to say (a guest who hasn't played).
 */
export function prizeGap({ entries = [], me = null, score = 0, location = '' }) {
  if (me && me.rank > 0) {
    if (me.rank <= 3) return { kind: 'in-prizes', text: `You're in the prizes! #${me.rank} at ${location}`, rank: me.rank };
    const third = entries[2]?.score;
    const gap = Number.isFinite(third) ? third - me.score : Infinity;
    return { kind: 'places', text: `${places(me.rank - 3)} from a prize at ${location}${gap > 0 && gap <= 500 ? ` · ${gap.toLocaleString('en-US')} points from 3rd` : ''}`, rank: me.rank };
  }
  if (!(score > 0)) return null;
  const rank = 1 + entries.filter(e => e.score >= score).length;
  if (entries.length >= BOARD_SIZE && rank > BOARD_SIZE) return { kind: 'unknown', text: 'Join the leaderboard to see your rank', rank: null };
  if (rank <= 3) return { kind: 'top3-open', text: `You'd be in the top 3 at ${location}!`, rank };
  return { kind: 'places', text: `You'd be #${rank} at ${location} · ${places(rank - 3)} from a prize`, rank };
}

/** A note kept across the sign-in reload, so the game picks up where the player was (read once, 30 minutes). */
export const RESUME_KEY = 'pawtastic-gd-resume-v1';
const RESUME_SCREENS = new Set(['leaderboard', 'shop', 'join']); // join: the code was emailed, the card reopens at the code step
export function keepResume(what, store = globalThis.localStorage, now = Date.now()) {
  try { store?.setItem(RESUME_KEY, JSON.stringify({ ...what, at: now })); } catch { /* private mode: the player just lands on the map */ }
}
export function takeResume(now = Date.now(), store = globalThis.localStorage) {
  let v = null;
  try { v = JSON.parse(store?.getItem(RESUME_KEY) ?? 'null'); } catch { v = null; }
  try { store?.removeItem(RESUME_KEY); } catch { /* ignore */ }
  if (!v || typeof v !== 'object' || !RESUME_SCREENS.has(v.screen) || !(now - v.at >= 0 && now - v.at <= 30 * 60000)) return null;
  return v;
}
