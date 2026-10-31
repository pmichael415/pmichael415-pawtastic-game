// Server-side validation for anonymous gameplay events. Pure so it can be unit-tested.
import { EVENT_NAMES } from "./analytics";

export type EventRow = {
  device_id: string;
  cohort_day: string;
  session_id: string;
  build: string;
  name: string;
  props: Record<string, string | number | boolean | null>;
  client_at: string;
};

const UUIDISH = /^[0-9a-f-]{8,64}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Returns the rows to store, or null for a malformed batch. Unknown events and oversized props are dropped. */
export function parseEventBatch(body: unknown, now = Date.now()): EventRow[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const device = typeof b["device"] === "string" && UUIDISH.test(b["device"]) ? b["device"] : null;
  const cohort = typeof b["cohort"] === "string" && DAY.test(b["cohort"]) ? b["cohort"] : null;
  const session =
    typeof b["session"] === "string" && UUIDISH.test(b["session"]) ? b["session"] : null;
  const build = typeof b["build"] === "string" ? b["build"].slice(0, 40) : "unknown";
  if (!device || !cohort || !session || !Array.isArray(b["events"])) return null;
  const rows: EventRow[] = [];
  for (const e of b["events"].slice(0, 50)) {
    if (!e || typeof e !== "object") continue;
    const ev = e as Record<string, unknown>;
    const name = ev["name"];
    if (typeof name !== "string" || !(EVENT_NAMES as readonly string[]).includes(name)) continue;
    const at =
      typeof ev["at"] === "number" && Math.abs(now - ev["at"]) < 7 * 86400000 ? ev["at"] : now;
    const props: EventRow["props"] = {};
    const raw =
      ev["props"] && typeof ev["props"] === "object"
        ? (ev["props"] as Record<string, unknown>)
        : {};
    for (const [k, v] of Object.entries(raw).slice(0, 12)) {
      if (!/^[a-z_]{1,32}$/.test(k)) continue;
      if (typeof v === "string") props[k] = v.slice(0, 120);
      else if (typeof v === "number" && Number.isFinite(v)) props[k] = v;
      else if (typeof v === "boolean" || v === null) props[k] = v;
    }
    rows.push({
      device_id: device,
      cohort_day: cohort,
      session_id: session,
      build,
      name,
      props,
      client_at: new Date(at).toISOString(),
    });
  }
  return rows;
}
