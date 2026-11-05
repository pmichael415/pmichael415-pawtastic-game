// PAWtastic Daycare Tycoon — families and loyalty (customer-growth requirement §1, §3). The guest book's entries are the
// families: their status and story are worked out from their history (never stored), how a visit went decides how
// likely they are to come back, and free outreach leads to a booking — never to coins. Pure; run.ts calls in.
import { friendshipLevel, groupName, mulberry, seedFrom, type GroupId } from "@/game/engine";
import { caps } from "./connect";
import { fac, withFac } from "./state";
import { ownerFor } from "./visit";
import { FOOTFALL_DAYS } from "./customersSave";
import type {
  Booking,
  Facility,
  Footfall,
  OutreachKind,
  OutreachLog,
  Service,
  Source,
  TRegular,
  TResult,
  TycoonState,
} from "./types";

/** Active business days without a visit before a family counts as inactive. */
export const INACTIVE_AFTER = 4;
/** Active days between two contacts with the same family (no farming). */
export const CONTACT_COOLDOWN = 3;
/** Free calls the player can make each active day. */
export const FREE_CALLS_PER_DAY = 2;
/** Calls an assigned team member makes in each active day's midday break. */
export const STAFF_CALLS = 3;
/** The share of arrivals that are returning families, when the guest book is full of happy ones. */
export const RETURNING_SHARE = 0.35;

export type FamilyStatus = "new" | "returning" | "regular" | "inactive";
export type FamilyKey = { name: string; breed: number };
const same = (a: FamilyKey, b: FamilyKey) => a.name === b.name && a.breed === b.breed;
export const findFamily = (f: Facility, k: FamilyKey) =>
  f.guestBook.find((g) => same(g, k)) ?? null;
export const groupOfFamily = (g: Pick<TRegular, "size" | "temper">) =>
  `${g.size}-${g.temper}` as GroupId;

const staysAway = (f: Facility, g: TRegular) => (g.lostUntil ?? 0) > f.day;
const daysAway = (f: Facility, g: TRegular) => Math.max(0, f.day - g.lastDay);

export function familyStatus(f: Facility, g: TRegular): FamilyStatus {
  if (staysAway(f, g) || daysAway(f, g) >= INACTIVE_AFTER) return "inactive";
  if (g.visits >= 3 && g.friendship >= 25) return "regular";
  return g.visits >= 2 ? "returning" : "new";
}

const WENT = (sat: number | undefined) =>
  sat == null
    ? "home"
    : sat >= 80
      ? "home delighted"
      : sat >= 60
        ? "home happy"
        : sat >= 40
          ? "home a bit disappointed"
          : "home upset";
export function sourceWords(src: Source | undefined): string {
  if (!src || src.kind === "walk-in") return "walked in";
  if (src.kind === "campaign") return `heard about you from ${src.name}`;
  if (src.kind === "referral")
    return `${ownerFor({ name: src.from, breed: 0 }).split(" ")[0]} — ${src.from}'s family — recommended you`;
  return src.by === "staff" ? "your team got in touch" : "you got in touch";
}

const CALL: Record<OutreachKind, string> = {
  thank: "thank-you",
  invite: "invitation",
  followup: "follow-up",
  suggest: "suggestion",
};
/** How a visit came, in a few words (the desk's badge, the receipt). */
export function sourceShort(src: Source | undefined): string {
  if (!src || src.kind === "walk-in") return "walk-in";
  if (src.kind === "campaign") return src.name;
  if (src.kind === "referral") return `recommended by ${src.from}'s family`;
  return `after ${src.by === "staff" ? "your team's" : "your"} ${CALL[src.what]} call`;
}

/** Why this family comes, came back, or stopped coming — in plain words. */
export function familyStory(f: Facility, g: TRegular): string {
  const pup = g.name;
  if (g.issue && !g.issue.followedUp && (staysAway(f, g) || (g.sat ?? 100) < 60))
    return `Stopped coming after day ${g.issue.day}: ${g.issue.text} It wasn't put right — a follow-up call can win them back.`;
  if (g.issue?.followedUp)
    return `You followed up about day ${g.issue.day}'s problem — they may give you another chance.`;
  if (familyStatus(f, g) === "inactive")
    return `Hasn't been back for ${daysAway(f, g)} active days — an invitation may bring them back.`;
  if (familyStatus(f, g) === "regular")
    return `A regular — ${pup} went ${WENT(g.sat)} last time (visit #${g.visits}, ${friendshipLevel(g.friendship).label}).`;
  if (g.visits >= 2)
    return `Came back for visit #${g.visits} — last time ${pup} went ${WENT(g.sat)}.`;
  return `First visit on day ${g.firstDay ?? g.lastDay} — ${sourceWords(g.source)}.`;
}

/** How strongly this family wants to come back on its own (0 while staying away after a problem). */
export function returnWeight(f: Facility, g: TRegular): number {
  if (staysAway(f, g)) return 0;
  const mood = g.sat == null ? 0.6 : g.sat >= 80 ? 1 : g.sat >= 60 ? 0.7 : g.sat >= 40 ? 0.35 : 0.1;
  const issue = g.issue && !g.issue.followedUp ? 0.3 : 1;
  const away = daysAway(f, g) >= INACTIVE_AFTER ? 0.4 : 1;
  return mood * issue * away * (1 + g.friendship / 100);
}

/**
 * A returning family for a spontaneous drop-off, or null for a first-time family. The returning share grows with how
 * happy the guest book is (up to RETURNING_SHARE); within it, happier and closer families come more often. Draws dice
 * exactly as the old uniform pick did (none for an empty book, one for the share, one more to pick), so nothing else
 * in the day's randomness shifts.
 */
export function pickReturning(f: Facility, away: TRegular[], rand: () => number): TRegular | null {
  if (!away.length) return null;
  const w = away.map((g) => returnWeight(f, g));
  const total = w.reduce((a, b) => a + b, 0);
  const share = RETURNING_SHARE * Math.min(1, total / 3);
  if (rand() >= share || total <= 0) return null;
  let x = rand() * total;
  for (let i = 0; i < away.length; i++) if ((x -= w[i]!) < 0) return away[i]!;
  return away.at(-1)!;
}

/** Why the daycare can't take this family right now, or null when it can (rooms that exist and work). */
export function cantServe(
  f: Facility,
  pup: { size: "small" | "large"; temper: "gentle" | "active" },
  boarding: boolean,
  requests: Service[] = [],
): string | null {
  const c = caps(f);
  if (!c.lobby) return "no working lobby";
  if (boarding) {
    if (!c.beds.length) return "no boarding beds";
  } else {
    const g = groupOfFamily(pup);
    if (!c.playrooms.some((p) => p.group === g)) return `no ${groupName(g)} playroom`;
  }
  if (requests.includes("bath") && !c.bath) return "no bath room";
  return null;
}

export const outreachLog = (f: Facility): OutreachLog => {
  const o = f.outreach ?? {
    day: f.day,
    used: 0,
    stats: { calls: 0, booked: 0, arrivals: 0, visits: 0, revenue: 0, costs: 0 },
  };
  return o.day === f.day ? o : { ...o, day: f.day, used: 0 };
};
export const freeCallsLeft = (f: Facility) => Math.max(0, FREE_CALLS_PER_DAY - outreachLog(f).used);

export type OutreachOffer = { kind: OutreachKind; label: string; why: string; service?: Service };
const servicePrefs = (f: Facility, g: TRegular): Service | null => {
  const c = caps(f);
  if ((g.services?.boarding ?? 0) > 0 && c.beds.length) return "boarding";
  if ((g.services?.bath ?? 0) > 0 && c.bath) return "bath";
  return null;
};

/** What you could do from this family's record right now (each one free, limits apply when you do it). */
export function outreachOffers(f: Facility, g: TRegular): OutreachOffer[] {
  if (g.issue && !g.issue.followedUp)
    return [
      {
        kind: "followup",
        label: "Follow up",
        why: "Call about what went wrong and say how it's been put right — they may give you another chance.",
      },
    ];
  const out: OutreachOffer[] = [];
  const status = familyStatus(f, g);
  if (status === "inactive")
    out.push({
      kind: "invite",
      label: "Invite back",
      why: `They haven't been for ${daysAway(f, g)} active days.`,
    });
  else if ((g.sat ?? 0) >= 60 && g.thankedFor !== g.lastDay && daysAway(f, g) <= 1)
    out.push({
      kind: "thank",
      label: "Say thank you",
      why: `${g.name} had a good day — a thank-you makes a next booking more likely.`,
    });
  const svc = servicePrefs(f, g);
  if (svc && status !== "inactive")
    out.push({
      kind: "suggest",
      label: svc === "bath" ? "Suggest a bath" : "Suggest a boarding night",
      why:
        svc === "bath"
          ? `They've booked a bath before, and you have a bath room.`
          : `They've boarded before, and you have a boarding bed.`,
      service: svc,
    });
  return out;
}

/** The chance this family books after this kind of contact (shown as a likelihood, decided once). */
export function responseChance(g: TRegular, kind: OutreachKind): number {
  const mood =
    g.sat == null ? 0.5 : g.sat >= 80 ? 0.7 : g.sat >= 60 ? 0.55 : g.sat >= 40 ? 0.3 : 0.15;
  const close = Math.min(0.15, g.friendship / 400);
  if (kind === "thank") return Math.min(0.85, (g.sat ?? 0) >= 80 ? 0.6 + close : 0.4 + close);
  if (kind === "invite") return Math.min(0.85, mood + close);
  if (kind === "followup") return 0.35;
  return 0.5 + close;
}

/** Booking times: on the hour and half hour, outside the lobby's midday break (08:00–11:30, 14:00–14:30). */
export const BOOKING_SLOTS = [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 14, 14.5].map((h) => h * 60);
export const slotFor = (roll: () => number) =>
  BOOKING_SLOTS[Math.floor(roll() * BOOKING_SLOTS.length)]!;
/** A booking on the next active day (its time decided from the family and day, not re-rolled). */
function bookingFor(
  f: Facility,
  g: TRegular,
  source: Source,
  roll: () => number,
  kind: string,
  requests: Service[] = [],
  boarding = false,
): Booking {
  return {
    uid: `b${f.day}-${g.name}-${g.breed}-${kind}`.slice(0, 24),
    name: g.name,
    breed: g.breed,
    size: g.size,
    temper: g.temper,
    day: f.day + 1,
    min: slotFor(roll),
    boarding,
    ...(requests.length ? { requests } : {}),
    source,
  };
}
export const fmtHM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Get in touch with a family (free). Limits: one contact per family every CONTACT_COOLDOWN active days, one thank-you
 * per visit, FREE_CALLS_PER_DAY a day for you (staff have their own workload). The family's answer is decided once,
 * from the family and the day; a yes is a booking on the next active day — no coins, ever.
 */
export function contact(
  s: TycoonState,
  key: FamilyKey,
  kind: OutreachKind,
  by: "you" | "staff" = "you",
): TResult {
  const f = fac(s);
  const g = findFamily(f, key);
  if (!g) return { ok: false, error: "That family isn't in your guest book." };
  const owner = ownerFor(g);
  if (kind === "thank" && g.thankedFor === g.lastDay)
    return { ok: false, error: `You already thanked ${owner} for this visit.` };
  if (g.contactDay != null && f.day - g.contactDay < CONTACT_COOLDOWN)
    return {
      ok: false,
      error: `You contacted them on day ${g.contactDay} — give them a few days.`,
    };
  if ((f.bookings ?? []).some((b) => same(b, g)))
    return { ok: false, error: `${owner} already booked ${g.name} in.` };
  if (f.dogs.some((d) => same(d, g))) return { ok: false, error: `${g.name} is here today.` };
  const offer = outreachOffers(f, g).find((o) => o.kind === kind);
  if (!offer)
    return {
      ok: false,
      error:
        kind === "thank"
          ? "A thank-you fits right after a good visit."
          : kind === "invite"
            ? "They're not inactive — no need to invite them back."
            : kind === "followup"
              ? "There's nothing to follow up."
              : "No service to suggest that fits them.",
    };
  const requests = offer.service === "bath" ? (["bath"] as Service[]) : [];
  const boarding = offer.service === "boarding";
  const why = cantServe(f, g, boarding, requests);
  if (why) return { ok: false, error: `You have ${why} — they couldn't come.` };
  const log = outreachLog(f);
  if (by === "you" && log.used >= FREE_CALLS_PER_DAY)
    return {
      ok: false,
      error: `No free calls left today — you'll have ${FREE_CALLS_PER_DAY} again tomorrow.`,
    };
  const roll = mulberry(seedFrom(`${g.name}|${g.breed}|${f.day}|${kind}|reply`));
  const yes = roll() < responseChance(g, kind);
  const source: Source = { kind: "outreach", by, what: kind };
  const booking = yes ? bookingFor(f, g, source, roll, kind, requests, boarding) : null;
  const entry: TRegular = {
    ...g,
    contactDay: f.day,
    ...(kind === "thank" ? { thankedFor: g.lastDay } : {}),
    ...(kind === "followup" && g.issue
      ? {
          issue: { ...g.issue, followedUp: true },
          lostUntil: Math.min(g.lostUntil ?? f.day, f.day),
        }
      : {}),
  };
  const stats = {
    ...log.stats,
    calls: log.stats.calls + 1,
    booked: log.stats.booked + (booking ? 1 : 0),
  };
  const next = withFac(s, {
    ...f,
    guestBook: f.guestBook.map((x) => (same(x, g) ? entry : x)),
    bookings: booking ? [...(f.bookings ?? []), booking] : (f.bookings ?? []),
    outreach: { ...log, used: log.used + (by === "you" ? 1 : 0), stats },
  });
  const what =
    kind === "thank"
      ? "thanked"
      : kind === "invite"
        ? "invited back"
        : kind === "followup"
          ? "followed up with"
          : "made a suggestion to";
  return {
    ok: true,
    state: next,
    msg: booking
      ? `You ${what} ${owner} — they booked ${g.name}${boarding ? " for a boarding night" : requests.includes("bath") ? " with a bath" : ""} for day ${booking.day} at ${fmtHM(booking.min)}.`
      : `You ${what} ${owner} — they'll think about it.`,
  };
}

const runningCampaign = (f: Facility) =>
  f.campaign && f.day < f.campaign.untilDay ? f.campaign.id : null;
const freshDay = (f: Facility): Footfall => ({
  day: f.day,
  newWalkIns: 0,
  returning: 0,
  booked: 0,
  turned: {},
  campaign: runningCampaign(f),
});
/** Today's footfall entry, changed (the last FOOTFALL_DAYS active days are kept). */
export function touchDay(f: Facility, change: (d: Footfall) => Footfall = (d) => d): Facility {
  const list = f.footfall ?? [];
  const last = list.at(-1);
  const today = last?.day === f.day ? last : freshDay(f);
  const next = { ...change(today), campaign: today.campaign ?? runningCampaign(f) };
  return { ...f, footfall: [...list.filter((d) => d.day !== f.day), next].slice(-FOOTFALL_DAYS) };
}
/** A family who wanted to come but couldn't (unmet demand), by reason. */
export const noteTurned = (f: Facility, reason: string, n = 1): Facility =>
  touchDay(f, (d) => ({ ...d, turned: { ...d.turned, [reason]: (d.turned[reason] ?? 0) + n } }));
/** A family who came today: a first-time walk-in, a family back on their own, or a booking. */
export const noteArrival = (f: Facility, kind: "newWalkIns" | "returning" | "booked"): Facility =>
  touchDay(f, (d) => ({ ...d, [kind]: d[kind] + 1 }));

/** The campaign run a source belongs to, if any (a referral from a referral campaign counts there). */
export const runOf = (src: Source | undefined): string | null =>
  src?.kind === "campaign" ? src.run : src?.kind === "referral" && src.run ? src.run : null;
const creditRun = (
  f: Facility,
  uid: string,
  change: (
    r: NonNullable<Facility["campaignRuns"]>[number],
  ) => NonNullable<Facility["campaignRuns"]>[number],
): Facility => ({
  ...f,
  campaignRuns: (f.campaignRuns ?? []).map((r) => (r.uid === uid ? change(r) : r)),
});
/** A booked family arrived at the desk: one arrival for the source that brought them (never twice for one booking). */
export function creditArrival(f: Facility, src: Source | undefined): Facility {
  const run = runOf(src);
  if (run) return creditRun(f, run, (r) => ({ ...r, arrivals: r.arrivals + 1 }));
  if (src?.kind === "outreach") {
    const o = outreachLog(f);
    return { ...f, outreach: { ...o, stats: { ...o.stats, arrivals: o.stats.arrivals + 1 } } };
  }
  return f;
}
/**
 * A visit settled: its service revenue and direct costs (that visit's supplies, any refund paid out) go to the one
 * source that brought it — a campaign run, or outreach — and to nothing else. Settling happens once per visit.
 */
export function creditVisit(
  f: Facility,
  src: Source | undefined,
  x: { paid: boolean; revenue: number; costs: number },
): Facility {
  const add = <T extends { visits: number; revenue: number; costs: number }>(r: T): T => ({
    ...r,
    visits: r.visits + (x.paid ? 1 : 0),
    revenue: r.revenue + x.revenue,
    costs: r.costs + x.costs,
  });
  const run = runOf(src);
  if (run) return creditRun(f, run, add);
  if (src?.kind === "outreach") {
    const o = outreachLog(f);
    return { ...f, outreach: { ...o, stats: add(o.stats) } };
  }
  return f;
}

// ---------- staff-managed outreach ----------

/** Assigns a hired team member to make outreach calls in the midday break (null: nobody — you make your own calls). */
export function setOutreachStaff(s: TycoonState, id: string | null): TResult {
  const f = fac(s);
  if (id === null)
    return {
      ok: true,
      state: withFac(s, { ...f, outreachBy: null }),
      msg: "You'll make outreach calls yourself.",
    };
  const st = f.staff.find((x) => x.id === id);
  if (!st) return { ok: false, error: "Pick someone on your team." };
  if (st.founder)
    return {
      ok: false,
      error: `Hire a team member first — ${st.name} is your partner and helps when you tap.`,
    };
  return {
    ok: true,
    state: withFac(s, { ...f, outreachBy: id }),
    msg: `${st.name} will call up to ${STAFF_CALLS} families in each midday break — follow-ups first.`,
  };
}

const PRIORITY: OutreachKind[] = ["followup", "invite", "thank", "suggest"];
/**
 * The assigned team member's calls, once per active day (from the midday break): up to STAFF_CALLS families, problems
 * nobody followed up first, then inactive families, then thank-yous and suggestions — each under the same limits as
 * your own calls, without using your free calls. Bookings may follow; never coins.
 */
export function staffOutreach(s: TycoonState): TycoonState {
  const f = fac(s);
  const who = f.outreachBy ? f.staff.find((x) => x.id === f.outreachBy && !x.founder) : null;
  if (!who || outreachLog(f).staff?.day === f.day) return s;
  const todo = PRIORITY.flatMap((kind) =>
    f.guestBook
      .filter((g) => outreachOffers(f, g).some((o) => o.kind === kind))
      .sort((a, b) => b.friendship - a.friendship)
      .map((g) => ({ g, kind })),
  );
  let out = s;
  let calls = 0;
  let booked = 0;
  const called = new Set<string>();
  for (const { g, kind } of todo) {
    if (calls >= STAFF_CALLS) break;
    if (called.has(`${g.name}|${g.breed}`)) continue;
    const before = (fac(out).bookings ?? []).length;
    const r = contact(out, g, kind, "staff");
    if (!r.ok) continue;
    out = r.state;
    calls++;
    called.add(`${g.name}|${g.breed}`);
    if ((fac(out).bookings ?? []).length > before) booked++;
  }
  const nf = fac(out);
  return withFac(out, {
    ...nf,
    outreach: { ...outreachLog(nf), staff: { day: nf.day, calls, booked } },
  });
}
