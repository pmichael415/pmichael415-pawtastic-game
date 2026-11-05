// Customers and marketing survive save and reload (customer-growth requirement): family history, bookings, campaign
// runs, outreach and footfall (who came, who couldn't) round-trip; anything malformed is dropped; an old save loads with none of it.
import { describe, expect, it } from "vitest";
import { quickStart } from "./start";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { ok } from "./testkit";
import { defaultVisit } from "./visit";
import type { Booking, CampaignRun, TDog, TRegular, TycoonState } from "./types";

const reload = (s: TycoonState) => parseTycoon(JSON.parse(JSON.stringify(s)))!;

function withCustomers(): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  const f = fac(s);
  const family: TRegular = {
    name: "Biscuit",
    breed: 1,
    size: "small",
    temper: "gentle",
    visits: 3,
    friendship: 40,
    lastDay: 2,
    sat: 88,
    firstDay: 1,
    services: { daycare: 3, bath: 1 },
    source: { kind: "campaign", run: "c1", name: "Local flyers" },
    issue: { text: "Taylor waited 60 minutes at pickup.", day: 2, followedUp: true },
    contactDay: 3,
    thankedFor: 2,
  };
  const booking: Booking = {
    uid: "b1",
    name: "Biscuit",
    breed: 1,
    size: "small",
    temper: "gentle",
    day: 4,
    min: 570,
    boarding: false,
    requests: ["bath"],
    source: { kind: "outreach", by: "you", what: "thank" },
    moved: 1,
    again: true,
  };
  const run: CampaignRun = {
    uid: "c1",
    id: "flyers",
    name: "Local flyers",
    startDay: 1,
    untilDay: 4,
    cost: 150,
    reached: 80,
    responses: 5,
    booked: 4,
    declined: { "no Large & Active playroom": 1 },
    arrivals: 3,
    visits: 2,
    revenue: 74,
    costs: 4,
    drawn: [1, 2],
    answered: ["Biscuit|1"],
  };
  const pup: TDog = {
    id: "d1",
    name: "Pip",
    breed: 2,
    size: "small",
    temper: "active",
    visits: 1,
    place: { kind: "lobby" },
    checkedIn: false,
    happiness: 70,
    clean: 70,
    boarding: false,
    played: 0,
    bathed: false,
  };
  return withFac(s, {
    ...f,
    day: 3,
    guestBook: [family],
    bookings: [booking],
    campaign: { id: "flyers", untilDay: 4, run: "c1" },
    campaignRuns: [run],
    outreach: {
      day: 3,
      used: 1,
      stats: { calls: 4, booked: 2, arrivals: 1, visits: 1, revenue: 38, costs: 2 },
      staff: { day: 3, calls: 3, booked: 1 },
    },
    outreachBy: "s1",
    footfall: [
      {
        day: 3,
        newWalkIns: 2,
        returning: 1,
        booked: 1,
        turned: { "lobby full": 1, "no Large & Active playroom": 2 },
        campaign: "flyers",
      },
    ],
    dogs: [
      {
        ...pup,
        visit: {
          ...defaultVisit(f, pup),
          source: { kind: "referral", from: "Biscuit", run: "c9" },
          booking: "b0",
          moved: 1,
        },
      },
    ],
    outcomes: [
      {
        dog: "Biscuit",
        owner: "Taylor",
        day: 2,
        min: 900,
        how: "checkout",
        mood: "delighted",
        satisfaction: 90,
        total: 40,
        lines: [{ label: "Daycare", amount: 40 }],
        complaints: [],
        repDelta: 2,
        review: null,
        reward: null,
        firstVisit: true,
        source: { kind: "campaign", run: "c1", name: "Local flyers" },
        revenue: 40,
      },
    ],
  });
}

describe("customers and marketing in the save", () => {
  it("round-trip: families, bookings, campaign runs, outreach, footfall (who came, who couldn't) and a visit's source", () => {
    const s = withCustomers();
    const f = fac(reload(s));
    expect(f.guestBook[0]).toEqual(fac(s).guestBook[0]);
    expect(f.bookings).toEqual(fac(s).bookings);
    expect(f.campaign).toEqual({ id: "flyers", untilDay: 4, run: "c1" });
    expect(f.campaignRuns).toEqual(fac(s).campaignRuns);
    expect(f.outreach).toEqual(fac(s).outreach);
    expect(f.outreachBy).toBe("s1");
    expect(f.footfall).toEqual(fac(s).footfall);
    expect(f.dogs[0]!.visit!.source).toEqual({ kind: "referral", from: "Biscuit", run: "c9" });
    expect(f.dogs[0]!.visit!.booking).toBe("b0");
    expect(f.dogs[0]!.visit!.moved).toBe(1);
    expect(f.outcomes[0]).toEqual(fac(s).outcomes[0]);
  });
  it("malformed entries are dropped, the rest kept", () => {
    const s = withCustomers();
    const raw = JSON.parse(JSON.stringify(s));
    const rf = raw.facilities.f1;
    rf.bookings.push({ uid: "x", name: "Ghost", breed: 99, size: "huge", day: "soon" }, null);
    rf.campaignRuns.push({ uid: "y", id: "spam" });
    rf.guestBook[0].source = { kind: "magic" };
    rf.guestBook[0].services = { daycare: -4, haircut: 3 };
    const f = fac(parseTycoon(raw)!);
    expect(f.bookings).toHaveLength(1);
    expect(f.campaignRuns).toHaveLength(1);
    expect(f.guestBook[0]!.source).toBeUndefined();
    expect(f.guestBook[0]!.services).toEqual({ daycare: 0 });
  });
  it("an old save (before customers) loads with an empty history and no campaign records", () => {
    const s = ok(quickStart(newTycoon(0)));
    const raw = JSON.parse(JSON.stringify(s));
    for (const k of ["bookings", "campaignRuns", "outreach", "footfall"])
      delete raw.facilities.f1[k];
    raw.facilities.f1.campaign = { id: "flyers", untilDay: 9 };
    const f = fac(parseTycoon(raw)!);
    expect(f.bookings ?? []).toEqual([]);
    expect(f.campaignRuns ?? []).toEqual([]);
    expect(f.footfall ?? []).toEqual([]);
    expect(f.campaign).toEqual({ id: "flyers", untilDay: 9 });
  });
});
