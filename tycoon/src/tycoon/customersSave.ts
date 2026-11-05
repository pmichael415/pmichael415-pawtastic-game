// Loading customers and marketing from a save (customer-growth requirement): every field validated, anything
// malformed dropped — the same rule as the rest of parseTycoon (state.ts).
import { BREEDS } from "@/game/engine";
import type {
  Booking,
  CampaignId,
  CampaignRun,
  Footfall,
  OutreachKind,
  OutreachLog,
  Service,
  Source,
  TRegular,
} from "./types";

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const int = (x: unknown, d: number) => (typeof x === "number" && Number.isInteger(x) ? x : d);
const nat = (x: unknown) =>
  Math.max(0, Math.round(typeof x === "number" && Number.isFinite(x) ? x : 0));
const text = (x: unknown, max = 80) => (typeof x === "string" ? x.slice(0, max) : "");
const counts = (x: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(x))
    for (const [k, v] of Object.entries(x).slice(0, 12))
      if (typeof v === "number") out[k.slice(0, 60)] = nat(v);
  return out;
};

export const CAMPAIGN_IDS: CampaignId[] = [
  "flyers",
  "online",
  "openhouse",
  "welcome",
  "boarding_ads",
  "bath_promo",
  "referral",
];
const SERVICES: Service[] = ["daycare", "bath", "boarding"];
const OUTREACH: OutreachKind[] = ["thank", "invite", "followup", "suggest"];

export function parseSource(x: unknown): Source | undefined {
  if (!isObj(x)) return undefined;
  if (x["kind"] === "walk-in") return { kind: "walk-in" };
  if (x["kind"] === "campaign" && typeof x["run"] === "string")
    return { kind: "campaign", run: text(x["run"], 24), name: text(x["name"], 40) || "A campaign" };
  if (x["kind"] === "outreach" && OUTREACH.includes(x["what"] as OutreachKind))
    return {
      kind: "outreach",
      by: x["by"] === "staff" ? "staff" : "you",
      what: x["what"] as OutreachKind,
    };
  if (x["kind"] === "referral" && typeof x["from"] === "string")
    return {
      kind: "referral",
      from: text(x["from"], 24),
      ...(typeof x["run"] === "string" ? { run: text(x["run"], 24) } : {}),
    };
  return undefined;
}

/** The history fields of a guest-book family (on top of the original ones parsed in state.ts). */
export function parseFamilyExtras(x: Obj): Partial<TRegular> {
  const out: Partial<TRegular> = {};
  if (typeof x["firstDay"] === "number") out.firstDay = Math.max(0, int(x["firstDay"], 0));
  if (isObj(x["services"])) {
    const sv: Partial<Record<Service, number>> = {};
    for (const k of SERVICES)
      if (typeof x["services"][k] === "number") sv[k] = nat(x["services"][k]);
    out.services = sv;
  }
  const src = parseSource(x["source"]);
  if (src) out.source = src;
  if (isObj(x["issue"]) && typeof x["issue"]["text"] === "string")
    out.issue = {
      text: text(x["issue"]["text"], 160),
      day: Math.max(0, int(x["issue"]["day"], 0)),
      followedUp: x["issue"]["followedUp"] === true,
    };
  if (typeof x["contactDay"] === "number") out.contactDay = Math.max(0, int(x["contactDay"], 0));
  if (typeof x["thankedFor"] === "number") out.thankedFor = Math.max(0, int(x["thankedFor"], 0));
  return out;
}

function parseBooking(x: unknown): Booking | null {
  if (!isObj(x) || typeof x["uid"] !== "string" || typeof x["name"] !== "string") return null;
  const breed = int(x["breed"], -1);
  const size = x["size"] === "small" || x["size"] === "large" ? x["size"] : null;
  const temper = x["temper"] === "gentle" || x["temper"] === "active" ? x["temper"] : null;
  const source = parseSource(x["source"]);
  if (
    breed < 0 ||
    breed >= BREEDS.length ||
    !size ||
    !temper ||
    !source ||
    typeof x["day"] !== "number"
  )
    return null;
  const requests = Array.isArray(x["requests"])
    ? (x["requests"].filter((r) => SERVICES.includes(r as Service)) as Service[])
    : [];
  return {
    uid: text(x["uid"], 24),
    name: text(x["name"], 24) || "Pup",
    breed,
    size,
    temper,
    day: Math.max(1, int(x["day"], 1)),
    min: Math.max(0, Math.min(24 * 60, int(x["min"], 9 * 60))),
    boarding: x["boarding"] === true,
    ...(requests.length ? { requests } : {}),
    source,
    ...(typeof x["moved"] === "number" ? { moved: nat(x["moved"]) } : {}),
    ...(x["again"] === true ? { again: true } : {}),
  };
}
export const parseBookings = (x: unknown): Booking[] =>
  Array.isArray(x)
    ? x
        .map(parseBooking)
        .filter((b): b is Booking => !!b)
        .slice(0, 60)
    : [];

function parseRun(x: unknown): CampaignRun | null {
  if (!isObj(x) || typeof x["uid"] !== "string" || !CAMPAIGN_IDS.includes(x["id"] as CampaignId))
    return null;
  const declined = counts(x["declined"]);
  return {
    uid: text(x["uid"], 24),
    id: x["id"] as CampaignId,
    name: text(x["name"], 40) || "A campaign",
    startDay: Math.max(1, int(x["startDay"], 1)),
    untilDay: Math.max(1, int(x["untilDay"], 1)),
    cost: nat(x["cost"]),
    reached: nat(x["reached"]),
    responses: nat(x["responses"]),
    booked: nat(x["booked"]),
    declined,
    arrivals: nat(x["arrivals"]),
    visits: nat(x["visits"]),
    revenue: nat(x["revenue"]),
    costs: nat(x["costs"]),
    drawn: Array.isArray(x["drawn"])
      ? x["drawn"]
          .filter((d): d is number => typeof d === "number")
          .map((d) => Math.max(1, Math.round(d)))
          .slice(-30)
      : [],
    ...(Array.isArray(x["answered"])
      ? {
          answered: x["answered"]
            .filter((a): a is string => typeof a === "string")
            .map((a) => a.slice(0, 40))
            .slice(-60),
        }
      : {}),
  };
}
export const parseRuns = (x: unknown): CampaignRun[] =>
  Array.isArray(x)
    ? x
        .map(parseRun)
        .filter((r): r is CampaignRun => !!r)
        .slice(-12)
    : [];

export function parseOutreach(x: unknown): OutreachLog | undefined {
  if (!isObj(x)) return undefined;
  const st = isObj(x["stats"]) ? x["stats"] : {};
  return {
    day: Math.max(0, int(x["day"], 0)),
    used: nat(x["used"]),
    stats: {
      calls: nat(st["calls"]),
      booked: nat(st["booked"]),
      arrivals: nat(st["arrivals"]),
      visits: nat(st["visits"]),
      revenue: nat(st["revenue"]),
      costs: nat(st["costs"]),
    },
    ...(isObj(x["staff"])
      ? {
          staff: {
            day: Math.max(0, int(x["staff"]["day"], 0)),
            calls: nat(x["staff"]["calls"]),
            booked: nat(x["staff"]["booked"]),
          },
        }
      : {}),
  };
}

export const FOOTFALL_DAYS = 14;
export function parseFootfall(x: unknown): Footfall[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((m): m is Obj => isObj(m) && typeof m["day"] === "number")
    .map((m) => ({
      day: Math.max(1, int(m["day"], 1)),
      newWalkIns: nat(m["newWalkIns"]),
      returning: nat(m["returning"]),
      booked: nat(m["booked"]),
      turned: counts(m["turned"]),
      campaign: typeof m["campaign"] === "string" ? m["campaign"].slice(0, 24) : null,
    }))
    .slice(-FOOTFALL_DAYS);
}
