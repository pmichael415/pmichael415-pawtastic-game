// Minimal, privacy-light game measurement. Sends whitelisted events with a random device id (no name,
// email, contact or location data) so we can count real behaviour: first sessions, tutorial completion,
// check-ins, return rates by cohort/build, camera preference, errors, shop previews and booking-link clicks.
// A booking-link click is only a click — it is never reported as a booking or a customer.
import { getSettings } from "./settings";
import { captureReferral, referredBy } from "./referral";

export const BUILD_ID = "2026-10-31.games-hub-1";
export const EVENT_NAMES = [
  "session_start",
  "tutorial_step",
  "tutorial_complete",
  "checkin_success",
  "first_care_cycle",
  "camera_mode",
  "client_error",
  "shop_preview",
  "checkout_start",
  "restore_result",
  "booking_click",
  "recess_run",
  "share",
  "hub_open",
  "referral_open",
  "team_pick",
  "team_points",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
type Props = Record<string, string | number | boolean | null>;
type Queued = { name: EventName; props: Props; at: number };

const ID_KEY = "pawtastic-anon-id";
const FIRST_KEY = "pawtastic-first-seen";
const LAST_KEY = "pawtastic-last-seen-day";
const queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sessionId = "";
const sent: Queued[] = []; // kept in memory for QA (window.__pawtasticEvents)

const nyDay = (ms = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

export function device() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(ID_KEY, id);
  }
  let first = localStorage.getItem(FIRST_KEY);
  if (!first) {
    first = nyDay();
    localStorage.setItem(FIRST_KEY, first);
  }
  return { id, cohort: first };
}

function clean(props: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props).slice(0, 12)) {
    if (!/^[a-z_]{1,32}$/.test(k)) continue;
    out[k] = typeof v === "string" ? v.slice(0, 120) : v;
  }
  return out;
}

export function track(name: EventName, props: Props = {}) {
  if (typeof window === "undefined") return;
  try {
    if (!getSettings().analytics) return;
    if (import.meta.env["VITE_REVIEW_BUILD"]) return; // private review builds send nothing
    if (!EVENT_NAMES.includes(name)) return;
    const ev = { name, props: clean(props), at: Date.now() };
    queue.push(ev);
    sent.push(ev);
    (window as unknown as { __pawtasticEvents?: Queued[] }).__pawtasticEvents = sent;
    if (!timer) timer = setTimeout(flush, 8000);
  } catch {
    /* never break the game for analytics */
  }
}

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length || typeof window === "undefined") return;
  const batch = queue.splice(0, 50);
  try {
    const d = device();
    const body = JSON.stringify({
      device: d.id,
      cohort: d.cohort,
      session: sessionId,
      build: BUILD_ID,
      events: batch,
    });
    const url = "/api/public/events";
    if (navigator.sendBeacon)
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    else
      void fetch(url, {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
  } catch {
    /* dropped */
  }
}

/** Call once per page load: records the session and whether this device is new or returning. */
export function startSession(where: string) {
  if (typeof window === "undefined" || sessionId) return;
  sessionId = uuid();
  try {
    const d = device();
    const today = nyDay();
    const last = localStorage.getItem(LAST_KEY);
    const daysSinceFirst = Math.round((Date.parse(today) - Date.parse(d.cohort)) / 86400000);
    localStorage.setItem(LAST_KEY, today);
    // Arrived through a friend's invite link? Remember it (first link only) and tag this session.
    const newRef = captureReferral(location.search);
    if (newRef) track("referral_open", { ref: newRef, first_visit: !last });
    const ref = referredBy();
    track("session_start", {
      where,
      ...(ref ? { ref } : {}),
      first_visit: !last,
      returning_same_day: last === today,
      days_since_first: daysSinceFirst,
      mobile: matchMedia("(pointer: coarse)").matches,
    });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
    });
    const mobile = matchMedia("(pointer: coarse)").matches;
    window.addEventListener("error", (e) =>
      track("client_error", { message: String(e.message).slice(0, 120), where: location.pathname, mobile }),
    );
    window.addEventListener("unhandledrejection", (e) =>
      track("client_error", {
        message: String((e as PromiseRejectionEvent).reason).slice(0, 120),
        where: location.pathname,
        mobile,
      }),
    );
  } catch {
    /* ignore */
  }
}
