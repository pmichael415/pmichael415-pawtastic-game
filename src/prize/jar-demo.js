// The demo Treat Jar: one free open per America/New_York day.
// It knows nothing about Treats or purchases — money can't touch the prize draw.

import { dayKey, addDays, formatLongDate } from '../economy/time.js';

export const JAR_PRIZES = [
  { id: 'bath', name: 'Free Bath', retailUsd: 33, use: 'any visit' },
  { id: 'daycare', name: 'Free Daycare Day', retailUsd: 45, use: 'a Monday–Thursday or Sunday' },
  { id: 'dorm', name: 'Free Dorm Night', retailUsd: 75, use: 'a Sunday–Thursday night, excluding holidays' },
];

export const DEMO_ODDS = 0.1;

export function winNotice(prize, expiresOn) {
  return [
    `You won a ${prize.name}!`,
    `Use it by ${formatLongDate(expiresOn)}.`,
    `Good for ${prize.use}.`,
    'No payment is required to claim or use your prize.',
    'Your dog needs current vaccines and a signed agreement. First-time dogs get a free evaluation.',
    'See the official rules for details.',
  ];
}

export function createJar({ storage, now, rng, odds = DEMO_ODDS }) {
  let state;
  try { state = storage.load(); } catch { state = null; }
  if (!state || !Array.isArray(state.history)) state = { history: [] };

  const today = () => dayKey(now());
  const lastDay = () => state.history.at(-1)?.day ?? null;

  return {
    // Days only move forward: a clock set back can't unlock another open.
    canOpen() {
      const last = lastDay();
      return last === null || today() > last;
    },
    open() {
      const day = today();
      if (!this.canOpen()) return { ok: false, error: 'already-opened' };
      const won = rng.next() < odds;
      const prize = won ? rng.pick(JAR_PRIZES) : null;
      state.history.push({ day, won, prizeId: prize?.id ?? null });
      storage.save(state);
      if (!won) return { ok: true, won: false };
      const expiresOn = addDays(day, 60);
      return { ok: true, won: true, prize, expiresOn, notice: winNotice(prize, expiresOn) };
    },
    history() {
      return state.history.map(h => ({ ...h }));
    },
  };
}
