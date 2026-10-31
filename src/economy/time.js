// Calendar helpers. Every "day" in the game is an America/New_York calendar day.

const TIME_ZONE = 'America/New_York';
const keyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;

export function dayKey(ms) {
  return keyFormat.format(new Date(ms));
}

export function monthKey(ms) {
  return dayKey(ms).slice(0, 7);
}

function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(aKey, bKey) {
  return Math.round((keyToUtc(bKey) - keyToUtc(aKey)) / DAY_MS);
}

export function addDays(key, n) {
  return utcToKey(keyToUtc(key) + n * DAY_MS);
}

export function formatLongDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
