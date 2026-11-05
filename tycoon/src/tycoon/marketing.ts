// PAWtastic Daycare Tycoon — marketing (customer-growth requirement §2, §4, §5). A campaign buys a defined activity for
// game coins up front; each of its active days, the simulation draws who responds (decided once per day, from the
// campaign and the day), and each response becomes a booking — or, when the daycare can't serve it, is declined and
// recorded as unmet demand. Results show what came of it, credited once per visit. Pure; run.ts calls in each tick.
import { BREEDS, NAMES, groupName, mulberry, seedFrom, type GroupId } from "@/game/engine";
import { spend } from "./business";
import { CAMPAIGNS, campaignDef, type Campaign } from "./catalog";
import { caps } from "./connect";
import { BOOKING_SLOTS, INACTIVE_AFTER, cantServe, familyStatus, noteTurned } from "./customers";
import { level } from "./progress";
import { adjustRep } from "./reputation";
import { fac, withFac } from "./state";
import type {
  Booking,
  CampaignId,
  CampaignRun,
  Facility,
  Service,
  Source,
  TRegular,
  TResult,
  TycoonState,
} from "./types";

const key = (x: { name: string; breed: number }) => `${x.name}|${x.breed}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, n) => a + n, 0);

/** The campaign running today (its run), if any. A campaign's last active day is untilDay − 1. */
export function runningRun(f: Facility): CampaignRun | null {
  if (!f.campaign || f.day >= f.campaign.untilDay) return null;
  return (f.campaignRuns ?? []).find((r) => r.uid === f.campaign!.run) ?? null;
}

// ---------- who a campaign reaches ----------

const staysAway = (f: Facility, g: TRegular, day: number) => (g.lostUntil ?? 0) > day;
const here = (f: Facility, g: TRegular) =>
  f.dogs.some((d) => key(d) === key(g)) || (f.bookings ?? []).some((b) => key(b) === key(g));
/** Families a welcome-back letter goes to: inactive when the campaign started, and not been since. */
function inactiveTargets(f: Facility, startDay: number): TRegular[] {
  return f.guestBook.filter(
    (g) =>
      g.lastDay < startDay && (startDay - g.lastDay >= INACTIVE_AFTER || staysAway(f, g, startDay)),
  );
}
/** Happy regulars a referral card goes to. */
function happyRegulars(f: Facility): TRegular[] {
  return f.guestBook.filter(
    (g) => familyStatus(f, g) === "regular" && (g.sat ?? 0) >= 70 && !staysAway(f, g, f.day),
  );
}

// ---------- the card: cost, who, days, estimate, readiness ----------

export type Check = { label: "Rooms" | "Equipment" | "Team"; ok: boolean; text: string };
export type Readiness = { ready: boolean; why: string | null; checks: Check[] };

/** Whether the daycare has the rooms, equipment and team to serve what this campaign brings (and anyone to reach). */
export function readiness(f: Facility, id: CampaignId): Readiness {
  const def = campaignDef(id);
  const c = caps(f);
  const groups = [...new Set(c.playrooms.map((p) => p.group))];
  const spots = c.playrooms.reduce((n, p) => n + p.spots, 0);
  const rooms: Check =
    def.service === "boarding"
      ? {
          label: "Rooms",
          ok: c.beds.length > 0,
          text: c.beds.length
            ? `A boarding room with ${plural(c.beds.length, "bed")}`
            : "No boarding room with a bed yet",
        }
      : {
          label: "Rooms",
          ok: groups.length > 0,
          text: groups.length
            ? `${plural(c.playrooms.length, "playroom")} (${groups.map((g) => groupName(g)).join(", ")}) — ${plural(spots, "spot")}`
            : "No working playroom yet",
        };
  const equipment: Check =
    def.service === "bath"
      ? {
          label: "Equipment",
          ok: !!c.bath && c.tubs.length > 0,
          text:
            c.bath && c.tubs.length
              ? `${plural(c.tubs.length, "tub")} in a working bath room`
              : "No working bath room with a tub",
        }
      : def.service === "boarding"
        ? {
            label: "Equipment",
            ok: c.beds.length > 0,
            text: c.beds.length ? `${plural(c.beds.length, "boarding bed")}` : "No boarding bed",
          }
        : { label: "Equipment", ok: true, text: "Nothing extra needed" };
  const hired = f.staff.filter((x) => !x.founder).length;
  const desk = f.staff.some((x) => x.role === "reception")
    ? "your receptionist checks families in"
    : "you check families in yourself";
  const team: Check = {
    label: "Team",
    ok: true,
    text: `You${hired ? ` + ${plural(hired, "staff member", "staff")}` : ""} — ${desk}`,
  };
  const checks = [rooms, equipment, team];
  let why: string | null = null;
  if (!c.lobby) why = "You need a working lobby first.";
  else if (def.service === "boarding" && !c.beds.length)
    why = "You need a boarding bed first — build a boarding room with a bed.";
  else if (def.service === "bath" && !(c.bath && c.tubs.length))
    why = "You need a working bath room with a tub first.";
  else if (!groups.length && def.service !== "boarding") why = "You need a working playroom first.";
  else if (def.target === "inactive" && !inactiveTargets(f, f.day).length)
    why =
      "You have no inactive families right now — a family counts as inactive after 4 active days without a visit.";
  else if (def.target === "regulars" && !happyRegulars(f).length)
    why = "You have no happy regulars yet — families with 3+ visits who went home happy.";
  return { ready: !why, why, checks };
}

/** The expected response range over the whole campaign, unrounded: [low, high] families. */
function expected(f: Facility, def: Campaign): [number, number] {
  if (def.target === "new")
    return [def.reach * def.rate[0] * def.days, def.reach * def.rate[1] * def.days];
  const who = def.target === "inactive" ? inactiveTargets(f, f.day) : happyRegulars(f);
  const n = who.reduce((a, g) => a + (g.issue && !g.issue.followedUp ? 0.2 : 1), 0);
  return [n * def.rate[0], n * def.rate[1]];
}
/** The estimated response range over the whole campaign: [low, high] families. */
export function estimate(f: Facility, def: Campaign): [number, number] {
  const [lo, hi] = expected(f, def);
  return [Math.floor(lo), Math.ceil(hi)];
}

const KINDS: GroupId[] = ["small-gentle", "small-active", "large-gentle", "large-active"];
/** The share of new families a campaign brings whose kind of pup has a playroom here (boarding: any pup can board). */
export function servableShare(f: Facility, def: Campaign): number {
  if (def.service === "boarding" || def.target === "inactive") return 1;
  const groups = new Set(caps(f).playrooms.map((p) => p.group));
  let n = 0;
  for (const b of BREEDS)
    for (const t of ["gentle", "active"]) if (groups.has(`${b.size}-${t}` as GroupId)) n++;
  return n / (BREEDS.length * 2);
}

const SPACE = /playroom full|lobby full|beds full|lobby was full/;
/** A daycare that's often full says so before you spend (families it brings would be offered another day). */
function capacityWarning(f: Facility, def: Campaign): string | null {
  const recent = (f.footfall ?? []).filter((d) => d.day >= f.day - 3);
  const n = recent.reduce(
    (a, d) => a + Object.entries(d.turned).reduce((b, [k, v]) => b + (SPACE.test(k) ? v : 0), 0),
    0,
  );
  if (n >= 2)
    return `You turned away ${n} families for lack of space in the last 3 active days. A campaign brings more families — they'd be offered another day or turned away. More room first may serve them better.`;
  const c = caps(f);
  if (def.service === "boarding")
    return c.beds.length && f.dogs.filter((d) => d.boarding && d.checkedIn).length >= c.beds.length
      ? "Every boarding bed is taken right now."
      : null;
  const spots = c.playrooms.reduce((a, p) => a + p.spots, 0);
  const inRooms = f.dogs.filter(
    (d) =>
      d.place.kind === "room" &&
      c.playrooms.some((p) => p.room.uid === (d.place as { room: string }).room),
  ).length;
  return spots && inRooms >= spots
    ? "Your playrooms are full right now — families this brings may have to wait for a spot or come another day."
    : null;
}

export type CampaignCard = {
  def: Campaign;
  estimate: string;
  range: [number, number];
  days: string;
  checks: Check[];
  ready: boolean;
  why: string | null;
  warn: string | null;
  /** Families of a kind with no playroom here are declined (unmet demand). */
  note: string | null;
  locked: string | null;
  running: boolean;
};

/** Everything a campaign's card shows before you pay. */
export function campaignCard(s: TycoonState, id: CampaignId): CampaignCard {
  const f = fac(s);
  const def = campaignDef(id);
  const r = readiness(f, id);
  const range = estimate(f, def);
  const groups = new Set(caps(f).playrooms.map((p) => p.group));
  const missing = KINDS.filter((g) => !groups.has(g));
  const share = servableShare(f, def);
  const [lo, hi] = expected(f, def);
  const note =
    share < 1 && groups.size
      ? `You have playrooms for ${groups.size} of the 4 kinds of pup, so you could take about ${Math.floor(lo * share)}–${Math.ceil(hi * share)} of them; the rest (${missing.map((g) => groupName(g)).join(", ")}) would be declined — counted as unmet demand.`
      : null;
  const run = runningRun(f);
  return {
    def,
    estimate: `About ${range[0]}–${range[1]} ${range[1] === 1 ? "family" : "families"} may respond — not guaranteed.`,
    range,
    days: `${def.days} active day${def.days > 1 ? "s" : ""}`,
    checks: r.checks,
    ready: r.ready,
    why: r.why,
    warn: r.ready ? capacityWarning(f, def) : null,
    note,
    locked: def.level > level(s) ? `Unlocks at level ${def.level}.` : null,
    running: run?.id === id,
  };
}

// ---------- launching ----------

/** Pays for a campaign (marketing expense) and starts it today. One at a time; it must be able to serve what it brings. */
export function startCampaign(s: TycoonState, id: CampaignId): TResult {
  const def = CAMPAIGNS.find((c) => c.id === id);
  if (!def) return { ok: false, error: "Unknown campaign." };
  if (def.level > level(s)) return { ok: false, error: `Unlocks at level ${def.level}.` };
  const f0 = fac(s);
  const cur =
    runningRun(f0) ??
    (f0.campaign && f0.day < f0.campaign.untilDay
      ? { name: campaignDef(f0.campaign.id).name, untilDay: f0.campaign.untilDay }
      : null);
  if (cur)
    return {
      ok: false,
      error: `One campaign at a time — ${cur.name} runs until day ${cur.untilDay}.`,
    };
  const r = readiness(f0, id);
  if (!r.ready) return { ok: false, error: r.why! };
  const paid = spend(s, def.price, "marketing");
  if (!paid.ok) return paid;
  let f = fac(paid.state);
  const run: CampaignRun = {
    uid: `c${s.seq}`,
    id,
    name: def.name,
    startDay: f.day,
    untilDay: f.day + def.days,
    cost: def.price,
    reached: 0,
    responses: 0,
    booked: 0,
    declined: {},
    arrivals: 0,
    visits: 0,
    revenue: 0,
    costs: 0,
    drawn: [],
  };
  f = {
    ...f,
    campaign: { id, untilDay: run.untilDay, run: run.uid },
    campaignRuns: [...(f.campaignRuns ?? []), run].slice(-12),
  };
  if (def.reputation) f = adjustRep(f, def.reputation, `${def.name} — families toured the daycare`);
  return {
    ok: true,
    state: withFac({ ...paid.state, seq: s.seq + 1 }, f),
    msg: `${def.name} is running for ${def.days} active days. Responses come in as bookings — not guaranteed.`,
  };
}

// ---------- each active day: who responds ----------

export type Draw = {
  reached: number;
  responses: number;
  bookings: Booking[];
  declined: Record<string, number>;
  answered: string[];
};

/**
 * One active day of a campaign: who it reaches and who responds, decided from the campaign and the day (the same day
 * always draws the same answers). Each response is a booking, or declined with the reason (unmet demand). Pure.
 */
export function drawDay(f: Facility, run: CampaignRun, day: number): Draw {
  const def = campaignDef(run.id);
  const roll = mulberry(seedFrom(`${run.uid}|${day}|draw`));
  const rate = def.rate[0] + roll() * (def.rate[1] - def.rate[0]);
  const out: Draw = { reached: 0, responses: 0, bookings: [], declined: {}, answered: [] };
  const first = !run.drawn.length;
  const done = new Set(run.answered ?? []);
  const taken = new Set([
    ...f.guestBook.map(key),
    ...(f.bookings ?? []).map(key),
    ...f.dogs.map(key),
  ]);
  const boarding = def.service === "boarding";
  const requests: Service[] = def.service === "bath" ? ["bath"] : [];
  const later = BOOKING_SLOTS.filter((m) => day !== f.day || m >= f.clockMin + 30);
  const respond = (pup: Pick<Booking, "name" | "breed" | "size" | "temper">, source: Source) => {
    out.responses++;
    const why = cantServe(f, pup, boarding, requests);
    if (why) {
      out.declined[why] = (out.declined[why] ?? 0) + 1;
      return;
    }
    const today = later.length > 0;
    const min = today
      ? later[Math.floor(roll() * later.length)]!
      : BOOKING_SLOTS[Math.floor(roll() * BOOKING_SLOTS.length)]!;
    out.bookings.push({
      uid: `${run.uid}-${day}-${out.responses}`,
      ...pup,
      day: today ? day : day + 1,
      min,
      boarding,
      ...(requests.length ? { requests } : {}),
      source,
    });
  };
  const newFamily = () => {
    for (let i = 0; i < 8; i++) {
      const breed = Math.floor(roll() * BREEDS.length);
      const name = NAMES[Math.floor(roll() * NAMES.length)]!;
      const temper = roll() < 0.5 ? ("gentle" as const) : ("active" as const);
      if (taken.has(`${name}|${breed}`)) continue;
      taken.add(`${name}|${breed}`);
      return { name, breed, size: BREEDS[breed]!.size, temper };
    }
    return null;
  };
  const campaign: Source = { kind: "campaign", run: run.uid, name: run.name };
  if (def.target === "new") {
    out.reached = def.reach;
    let n = 0;
    for (let i = 0; i < def.reach; i++) if (roll() < rate) n++;
    for (let i = 0; i < n; i++) {
      const pup = newFamily();
      if (pup) respond(pup, campaign);
    }
    return out;
  }
  const who = def.target === "inactive" ? inactiveTargets(f, run.startDay) : happyRegulars(f);
  if (first) out.reached = who.length;
  for (const g of who) {
    const willing =
      def.target === "inactive"
        ? staysAway(f, g, day)
          ? 0
          : (g.issue && !g.issue.followedUp ? 0.2 : 1) * ((g.sat ?? 60) >= 60 ? 1 : 0.6)
        : 1;
    const yes = roll() < (rate * willing) / def.days;
    if (!yes || done.has(key(g)) || (def.target === "inactive" && here(f, g))) continue;
    out.answered.push(key(g));
    if (def.target === "inactive")
      respond({ name: g.name, breed: g.breed, size: g.size, temper: g.temper }, campaign);
    else {
      const friend = newFamily();
      if (friend) respond(friend, { kind: "referral", from: g.name, run: run.uid });
    }
  }
  return out;
}

/** Today's draw for the running campaign, once per active day (called by tick while the daycare is open). */
export function campaignDay(s: TycoonState): TycoonState {
  let f = fac(s);
  const run = runningRun(f);
  if (!run || run.drawn.includes(f.day)) return s;
  const d = drawDay(f, run, f.day);
  const declined = { ...run.declined };
  for (const [k, v] of Object.entries(d.declined)) declined[k] = (declined[k] ?? 0) + v;
  const next: CampaignRun = {
    ...run,
    reached: run.reached + d.reached,
    responses: run.responses + d.responses,
    booked: run.booked + d.bookings.length,
    declined,
    drawn: [...run.drawn, f.day],
    ...(d.answered.length || run.answered
      ? { answered: [...(run.answered ?? []), ...d.answered].slice(-60) }
      : {}),
  };
  f = {
    ...f,
    campaignRuns: (f.campaignRuns ?? []).map((r) => (r.uid === run.uid ? next : r)),
    bookings: [...(f.bookings ?? []), ...d.bookings].slice(-60),
  };
  for (const [k, v] of Object.entries(d.declined)) f = noteTurned(f, k, v);
  return withFac(s, f);
}

// ---------- results ----------

export type RunResult = {
  run: CampaignRun;
  ended: boolean;
  /** Active days left (0 once it has ended). */
  daysLeft: number;
  /** Attributed service revenue − direct costs − the campaign's cost. */
  contribution: number;
  /** Wages and upkeep on the campaign's days — for every family, so shown apart, not charged to the campaign. */
  overhead: { wages: number; upkeep: number };
  /** New families in the guest book that this campaign brought (their later visits on their own aren't credited to it). */
  joined: number;
  note: string;
};
export function runResult(f: Facility, run: CampaignRun): RunResult {
  const days = f.ledger.filter(
    (d) => d.day >= run.startDay && d.day < run.untilDay && d.day < f.day,
  );
  const ended = f.day >= run.untilDay || f.campaign?.run !== run.uid;
  return {
    run,
    ended,
    daysLeft: ended ? 0 : run.untilDay - f.day,
    contribution: run.revenue - run.costs - run.cost,
    overhead: {
      wages: days.reduce((a, d) => a + d.expenses.wages, 0),
      upkeep: days.reduce((a, d) => a + d.expenses.upkeep, 0),
    },
    joined: f.guestBook.filter(
      (g) =>
        (g.source?.kind === "campaign" || g.source?.kind === "referral") &&
        g.source.run === run.uid,
    ).length,
    note: "Visits are attributed to the campaign that booked them — that's not proof the campaign caused them: some families might have come anyway.",
  };
}

const avg = (xs: number[]) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
/** First-time walk-ins a day on finished days with and without a campaign running (a comparison, not proof). */
export function walkInBaseline(f: Facility) {
  const done = (f.footfall ?? []).filter((d) => d.day < f.day);
  const part = (xs: typeof done) => ({
    days: xs.length,
    perDay: avg(xs.map((d) => d.newWalkIns)),
    bookedPerDay: avg(xs.map((d) => d.booked)),
  });
  return {
    with: part(done.filter((d) => d.campaign)),
    without: part(done.filter((d) => !d.campaign)),
  };
}

/** Which service a turned-away reason is about. */
export const serviceOfReason = (r: string): Service =>
  /bed|boarding/.test(r) ? "boarding" : /bath/.test(r) ? "bath" : "daycare";

/** Customers at a glance: families by status, who came, and who couldn't (by service, kind and reason). */
export function customerSummary(f: Facility) {
  const status = { new: 0, returning: 0, regular: 0, inactive: 0 };
  for (const g of f.guestBook) status[familyStatus(f, g)]++;
  const turned: Record<string, number> = {};
  const came = { newWalkIns: 0, returning: 0, booked: 0, rescheduled: 0 };
  for (const d of f.footfall ?? []) {
    came.newWalkIns += d.newWalkIns;
    came.returning += d.returning;
    came.booked += d.booked;
    came.rescheduled += d.rescheduled ?? 0;
    for (const [k, v] of Object.entries(d.turned)) turned[k] = (turned[k] ?? 0) + v;
  }
  const unmet: Record<Service, number> = { daycare: 0, boarding: 0, bath: 0 };
  const kinds: Record<string, number> = {};
  for (const [k, v] of Object.entries(turned)) {
    unmet[serviceOfReason(k)] += v;
    const kind = /(Small|Large) & (Gentle|Active)/.exec(k)?.[0];
    if (kind) kinds[kind] = (kinds[kind] ?? 0) + v;
  }
  const reasons = Object.entries(turned)
    .map(([reason, n]) => ({ reason, n }))
    .sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));
  return {
    status,
    came,
    unmet,
    kinds,
    reasons,
    total: sum(turned),
    days: (f.footfall ?? []).length,
  };
}
