// Notification timing in New York local time (not a fixed UTC offset), so weeks and quiet hours stay right
// across daylight-saving changes.
export const NY_TZ = "America/New_York";

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function nyParts(ms: number) {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: Number(p["year"]), m: Number(p["month"]), d: Number(p["day"]), h: Number(p["hour"]), wd: WEEKDAYS.indexOf(p["weekday"]!) };
}

/** The Monday (YYYY-MM-DD) of the New York week containing this moment. */
export function nyWeekStart(ms: number): string {
  const { y, m, d, wd } = nyParts(ms);
  const back = (wd + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(y, m - 1, d - back)); // date arithmetic on the local calendar date
  return monday.toISOString().slice(0, 10);
}

/** True between 20:00 and 09:00 New York time: no notifications are sent then. */
export function inQuietHours(ms: number): boolean {
  const { h } = nyParts(ms);
  return h >= 20 || h < 9;
}
