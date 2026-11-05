// Customers in the running daycare (customer-growth requirement §1, §2, §4, §5): bookings arrive through the desk on
// their active day, the desk can offer another day or decline (recorded as unmet demand), a checkout writes the family's
// history, and a visit's revenue is credited once — to the campaign or outreach that brought it, or to nothing.
import { describe, expect, it } from "vitest";
import { DAY_CLOSE, mulberry } from "@/game/engine";
import { SUPPLY_COST } from "./business";
import { caps } from "./connect";
import {
  assignRoom,
  checkIn,
  checkout,
  createArrival,
  offerAnotherDay,
  tick,
  turnAway,
} from "./run";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import { LAST_DROPOFF } from "./visit";
import type { Booking, CampaignRun, Facility, TycoonState } from "./types";

const never = () => 0.999; // no natural drop-offs, no scuffles
const run0: CampaignRun = {
  uid: "c1",
  id: "flyers",
  name: "Local flyers",
  startDay: 3,
  untilDay: 6,
  cost: 150,
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
const booking = (over: Partial<Booking> = {}): Booking => ({
  uid: "b1",
  name: "Biscuit",
  breed: 1,
  size: "small",
  temper: "gentle",
  day: 3,
  min: 9 * 60,
  boarding: false,
  source: { kind: "campaign", run: "c1", name: "Local flyers" },
  ...over,
});

function open(over: Partial<Facility> = {}): TycoonState {
  const s = richState();
  return withFac(s, {
    ...fac(s),
    open: true,
    day: 3,
    introDay: 0,
    clockMin: 8 * 60 + 50,
    guestBook: [],
    dogs: [],
    campaignRuns: [run0],
    ...over,
  });
}
const playroom = (s: TycoonState) =>
  caps(fac(s)).playrooms.find((p) => p.group === "small-gentle")!.room.uid;
/** Arrives on a booking, checks in, plays in the matching playroom, and is ready for pickup. */
function served(s: TycoonState, b: Booking = booking()): { s: TycoonState; id: string } {
  const a = ok(
    createArrival(withFac(s, { ...fac(s), clockMin: 9 * 60, bookings: [b] }), never, false, b),
  );
  const id = fac(a).dogs.at(-1)!.id;
  const c = ok(assignRoom(ok(checkIn(a, id)), id, playroom(a)));
  const f = fac(c);
  return {
    s: withFac(c, {
      ...f,
      clockMin: 16 * 60,
      dogs: f.dogs.map((d) =>
        d.id === id
          ? { ...d, happiness: 90, played: 1, visit: { ...d.visit!, ownerHere: 16 * 60 } }
          : d,
      ),
    }),
    id,
  };
}

describe("bookings arrive through the desk on their active day", () => {
  it("a booked family arrives at its time carrying how they came; it counts as that campaign's arrival", () => {
    let s = open({ bookings: [booking()] });
    s = tick(s, 4, never); // 08:50 → 08:58
    expect(fac(s).dogs).toHaveLength(0);
    s = tick(s, 2, never); // → 09:02
    const d = fac(s).dogs[0]!;
    expect(d).toMatchObject({
      name: "Biscuit",
      breed: 1,
      place: { kind: "lobby" },
      checkedIn: false,
    });
    expect(d.visit!.source).toEqual({ kind: "campaign", run: "c1", name: "Local flyers" });
    expect(d.visit!.booking).toBe("b1");
    expect(fac(s).bookings).toEqual([]);
    expect(fac(s).campaignRuns![0]!.arrivals).toBe(1);
  });
  it("nothing happens while the daycare is closed — the booking waits", () => {
    const s0 = open({ bookings: [booking()] });
    const s = tick(withFac(s0, { ...fac(s0), open: false }), 30, never);
    expect(fac(s).dogs).toHaveLength(0);
    expect(fac(s).bookings).toHaveLength(1);
  });
  it("an outreach booking counts as an outreach arrival", () => {
    const s = tick(
      open({ bookings: [booking({ source: { kind: "outreach", by: "you", what: "thank" } })] }),
      6,
      never,
    );
    expect(fac(s).outreach!.stats.arrivals).toBe(1);
    expect(fac(s).campaignRuns![0]!.arrivals).toBe(0);
  });
  it("a booked family waits for lobby space; not in by the last drop-off, it moves to the next active day — twice at most", () => {
    const s0 = open({ bookings: [booking()], clockMin: LAST_DROPOFF - 30 });
    const full = caps(fac(s0)).waiting;
    const waiting = Array.from({ length: full }, (_, i) => ({
      ...fac(ok(createArrival(s0, mulberry(i + 1)))).dogs.at(-1)!,
      id: `w${i}`,
      name: `Wait${i}`,
    }));
    let s = withFac(s0, { ...fac(s0), dogs: waiting });
    s = tick(s, 20, never);
    expect(fac(s).dogs.some((d) => d.name === "Biscuit")).toBe(false);
    s = withFac(s, { ...fac(s), dogs: [], clockMin: DAY_CLOSE - 1 });
    s = tick(s, 1, never); // closing: the day's bookings that didn't come move on
    expect(fac(s).day).toBe(4);
    expect(fac(s).bookings![0]).toMatchObject({ uid: "b1", day: 4, moved: 1 });
    s = withFac(s, {
      ...fac(s),
      bookings: [{ ...fac(s).bookings![0]!, moved: 2 }],
      dogs: waiting,
      clockMin: DAY_CLOSE - 1,
    });
    s = tick(s, 1, never);
    expect(fac(s).bookings!.some((b) => b.uid === "b1")).toBe(false);
    expect(fac(s).footfall!.find((d) => d.day === 4)!.turned).toMatchObject({
      "booked, but the lobby was full": 1,
    });
  });
  it("a booked pup brings its own dice: the day's walk-ins are the same with or without the booking", () => {
    const walkIns = (s: TycoonState) => {
      const t = fac(tick(s, 25, mulberry(7)));
      return [...t.outcomes.map((o) => o.dog), ...t.dogs.map((d) => d.name)].filter(
        (n) => n !== "Biscuit",
      );
    };
    expect(walkIns(open({ bookings: [booking()] }))).toEqual(walkIns(open()));
  });
});

describe("the desk: offer another day, or can't take today", () => {
  it("Offer another day books the same family for the next active day — same source, no charge", () => {
    const s0 = open({ bookings: [booking()] });
    const a = ok(createArrival(s0, never, false, booking()));
    const id = fac(a).dogs[0]!.id;
    const r = offerAnotherDay(a, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.coins).toBe(a.coins);
    expect(fac(r.state).dogs).toHaveLength(0);
    const b = fac(r.state).bookings![0]!;
    expect(b).toMatchObject({
      name: "Biscuit",
      breed: 1,
      day: 4,
      moved: 1,
      again: true,
      source: { kind: "campaign", run: "c1" },
    });
    expect(r.msg).toMatch(/will bring Biscuit on day 4 at \d\d:\d\d/);
    // when they come again, it isn't a second arrival for the campaign
    const back = tick(withFac(r.state, { ...fac(r.state), day: 4, clockMin: b.min - 1 }), 2, never);
    expect(fac(back).dogs).toHaveLength(1);
    expect(fac(back).campaignRuns![0]!.arrivals).toBe(1);
    // and the day's footfall counts them as rescheduled, not as a new booking
    expect(fac(back).footfall!.at(-1)).toMatchObject({ booked: 0, rescheduled: 1 });
  });
  it("only before check-in, and a family can move at most twice", () => {
    const a = ok(createArrival(open(), never, false, booking({ moved: 2 })));
    const id = fac(a).dogs[0]!.id;
    expect(offerAnotherDay(a, id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/can't make another day/),
    });
    const b = ok(createArrival(open(), never, false, booking({ uid: "b2" })));
    const id2 = fac(b).dogs[0]!.id;
    expect(offerAnotherDay(ok(checkIn(b, id2)), id2)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already checked in/),
    });
  });
  it("Can't take today records why — unmet demand by reason", () => {
    const s = open();
    const room = playroom(s);
    const f = fac(s);
    const spots = caps(f).playrooms.find((p) => p.room.uid === room)!.spots;
    const full = Array.from({ length: spots }, (_, i) => ({
      ...fac(ok(createArrival(s, mulberry(i + 3)))).dogs[0]!,
      id: `p${i}`,
      name: `Pal${i}`,
      size: "small" as const,
      temper: "gentle" as const,
      checkedIn: true,
      place: { kind: "room" as const, room },
    }));
    const a = ok(createArrival(withFac(s, { ...f, dogs: full }), never, false, booking()));
    const id = fac(a).dogs.at(-1)!.id;
    const r = ok(turnAway(a, id));
    expect(fac(r).footfall!.at(-1)!.turned).toEqual({ "Small & Gentle playroom full": 1 });
  });
});

describe("a checkout writes the family's history and credits its source once", () => {
  it("first visit: first day, services, how they found you; the outcome says first visit, source and revenue", () => {
    const { s, id } = served(open());
    const r = ok(checkout(s, id, false));
    const g = fac(r).guestBook[0]!;
    expect(g).toMatchObject({
      name: "Biscuit",
      visits: 1,
      firstDay: 3,
      lastDay: 3,
      services: { daycare: 1 },
      source: { kind: "campaign", run: "c1" },
    });
    expect(g.issue ?? null).toBeNull();
    const o = fac(r).outcomes.at(-1)!;
    expect(o.firstVisit).toBe(true);
    expect(o.source).toEqual({ kind: "campaign", run: "c1", name: "Local flyers" });
    expect(o.revenue).toBe(o.total);
  });
  it("a campaign visit's revenue and direct costs go to that campaign only — counted once", () => {
    const { s, id } = served(open());
    const r = ok(checkout(s, id, false));
    const run = fac(r).campaignRuns![0]!;
    const o = fac(r).outcomes.at(-1)!;
    expect(run).toMatchObject({
      arrivals: 1,
      visits: 1,
      revenue: o.total,
      costs: SUPPLY_COST[fac(r).supplies],
    });
    expect(fac(r).outreach?.stats.visits ?? 0).toBe(0);
    expect(checkout(r, id, false).ok).toBe(false);
    expect(fac(r).campaignRuns![0]!.visits).toBe(1);
  });
  it("a walk-in visit is credited to no campaign; a returning family keeps how they first found you", () => {
    const first = ok(checkout(...(Object.values(served(open())) as [TycoonState, string]), false));
    const again = served(
      withFac(first, { ...fac(first), day: 4 }),
      booking({ uid: "b9", day: 4, source: { kind: "walk-in" } }),
    );
    const r = ok(checkout(again.s, again.id, false));
    const g = fac(r).guestBook[0]!;
    expect(g).toMatchObject({
      visits: 2,
      firstDay: 3,
      lastDay: 4,
      services: { daycare: 2 },
      source: { kind: "campaign", run: "c1" },
    });
    expect(fac(r).outcomes.at(-1)!.firstVisit).toBe(false);
    expect(fac(r).campaignRuns![0]!.visits).toBe(1);
  });
  it("a family from before this update (no 'how they found you') isn't counted as joining from the campaign it came back through", () => {
    const old = { name: "Biscuit", breed: 1, size: "small" as const, temper: "gentle" as const, visits: 4, friendship: 40, lastDay: 1, sat: 85 };
    const { s, id } = served(open({ guestBook: [old] }));
    const r = ok(checkout(s, id, false));
    const g = fac(r).guestBook[0]!;
    expect(g.source).toBeUndefined();
    expect(g.visits).toBe(5);
    expect(fac(r).outcomes.at(-1)!.firstVisit).toBe(false);
    expect(fac(r).campaignRuns![0]!.visits).toBe(1); // the visit itself still came from the campaign
  });
  it("closing time: a family who's already moved twice goes home and the notice says so (no promise of a return)", () => {
    const s0 = open({ clockMin: DAY_CLOSE - 1 });
    const a = ok(createArrival(withFac(s0, { ...fac(s0), clockMin: 15 * 60 }), never, false, booking({ moved: 2 })));
    const s = tick(withFac(a, { ...fac(a), clockMin: DAY_CLOSE - 1 }), 1, never);
    expect(fac(s).bookings ?? []).toEqual([]);
    expect(fac(s).courtesy).toMatchObject({ why: "closing", names: ["Biscuit"], rebooked: false });
    const b = ok(createArrival(withFac(s0, { ...fac(s0), clockMin: 15 * 60 }), never, false, booking()));
    const t = tick(withFac(b, { ...fac(b), clockMin: DAY_CLOSE - 1 }), 1, never);
    expect(fac(t).courtesy).toMatchObject({ names: ["Biscuit"], rebooked: true });
  });
  it("an outreach visit is credited to outreach", () => {
    const { s, id } = served(
      open(),
      booking({ source: { kind: "outreach", by: "you", what: "invite" } }),
    );
    const r = ok(checkout(s, id, false));
    expect(fac(r).outreach!.stats).toMatchObject({
      arrivals: 1,
      visits: 1,
      revenue: fac(r).outcomes.at(-1)!.total,
    });
  });
  it("an upset family with nothing put right: the problem is on their record — a good next visit clears it", () => {
    const { s, id } = served(open());
    const f = fac(s);
    const hurt = withFac(s, {
      ...f,
      clockMin: 17 * 60 + 10,
      dogs: f.dogs.map((d) =>
        d.id === id
          ? { ...d, happiness: 20, played: 0, visit: { ...d.visit!, ownerHere: 16 * 60 } }
          : d,
      ),
    });
    const r = ok(checkout(hurt, id, false));
    const g = fac(r).guestBook[0]!;
    expect(g.issue).toMatchObject({ day: 3, followedUp: false });
    expect(g.issue!.text.length).toBeGreaterThan(5);
    const again = served(
      withFac(r, { ...fac(r), day: 7 }),
      booking({ uid: "b3", day: 7, source: { kind: "walk-in" } }),
    );
    const g2 = fac(ok(checkout(again.s, again.id, false))).guestBook[0]!;
    expect(g2.issue ?? null).toBeNull();
  });
});

describe("natural arrivals and families who couldn't come", () => {
  it("a running campaign doesn't change natural drop-offs (no multiplier)", () => {
    const names = (s: TycoonState) => {
      const t = fac(tick(s, 200, mulberry(11)));
      return [...t.outcomes.map((o) => o.dog), ...t.dogs.map((d) => d.name)];
    };
    const without = open({ campaignRuns: [] });
    const withCampaign = open({
      campaign: { id: "flyers", untilDay: 6, run: "c1" },
      campaignRuns: [{ ...run0, drawn: [3, 4, 5] }],
    });
    expect(names(withCampaign)).toEqual(names(without));
  });
  it("families whose kind of pup has no playroom don't drop off — counted by reason", () => {
    const s = open();
    let got = s;
    for (
      let i = 0;
      i < 40 &&
      !(fac(got).footfall ?? []).some((d) =>
        Object.keys(d.turned).some((k) => /no .* playroom/.test(k)),
      );
      i++
    )
      got = tick(got, 10, mulberry(100 + i));
    const turned = fac(got).footfall!.at(-1)!.turned;
    expect(
      Object.keys(turned).some((k) => /^no (Large|Small) & (Gentle|Active) playroom$/.test(k)),
    ).toBe(true);
  });
});
