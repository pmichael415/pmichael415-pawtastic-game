// Campaigns as real marketing activities (customer-growth requirement §2, §4, §5): each buys a defined activity for game
// coins up front, says who it targets, for how many active days, an estimated response range (not guaranteed) and
// whether the daycare can serve that demand; each active day's responses are drawn in the simulation and become
// bookings — or are declined and recorded as unmet demand. Results show contribution after the campaign's cost, with
// overhead apart.
import { describe, expect, it } from "vitest";
import { closeDay, today } from "./business";
import { CAMPAIGNS } from "./catalog";
import {
  campaignCard,
  customerSummary,
  drawDay,
  readiness,
  runResult,
  startCampaign,
  walkInBaseline,
} from "./marketing";
import { tick } from "./run";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { ok, richState } from "./testkit";
import type { CampaignRun, Facility, TRegular, TycoonState } from "./types";

const never = () => 0.999;
function open(over: Partial<Facility> = {}): TycoonState {
  const s = richState();
  return withFac(s, {
    ...fac(s),
    open: true,
    day: 3,
    introDay: 0,
    clockMin: 8 * 60,
    dogs: [],
    guestBook: [],
    campaignRuns: [],
    bookings: [],
    footfall: [],
    ...over,
  });
}
const fam = (i: number, over: Partial<TRegular> = {}): TRegular => ({
  name: `Pup${i}`,
  breed: 1,
  size: "small",
  temper: "gentle",
  visits: 3,
  friendship: 40,
  lastDay: 1,
  sat: 90,
  firstDay: 1,
  ...over,
});
const runOf = (s: TycoonState) => fac(s).campaignRuns!.at(-1)!;

describe("every campaign is a defined activity with honest numbers", () => {
  it("cost, who it targets, active days, the activity it buys and a response range — not guaranteed", () => {
    expect(CAMPAIGNS.map((c) => c.id).sort()).toEqual([
      "bath_promo",
      "boarding_ads",
      "flyers",
      "online",
      "openhouse",
      "referral",
      "welcome",
    ]);
    const s = open({ guestBook: [fam(1, { lastDay: 1, visits: 2, friendship: 10 })], day: 9 });
    for (const c of CAMPAIGNS) {
      expect(c.price).toBeGreaterThan(0);
      expect(c.days).toBeGreaterThanOrEqual(1);
      expect(c.who.length).toBeGreaterThan(10);
      expect(c.activity.length).toBeGreaterThan(10);
      const card = campaignCard(s, c.id);
      expect(card.estimate).toMatch(/^About \d+–\d+ famil(y|ies) may respond — not guaranteed\.$/);
      expect(card.days).toBe(`${c.days} active day${c.days > 1 ? "s" : ""}`);
    }
  });
});

describe("launching a campaign", () => {
  it("costs its coins once, recorded as marketing; one at a time; unlocks by level", () => {
    const s = open();
    const r = ok(startCampaign(s, "flyers"));
    expect(r.coins).toBe(s.coins - 150);
    expect(today(fac(r)).expenses.marketing).toBe(today(fac(s)).expenses.marketing + 150);
    const run = runOf(r);
    expect(fac(r).campaign).toEqual({ id: "flyers", untilDay: 6, run: run.uid });
    expect(run).toMatchObject({
      id: "flyers",
      name: "Local flyers",
      startDay: 3,
      untilDay: 6,
      cost: 150,
      reached: 0,
      responses: 0,
      booked: 0,
      arrivals: 0,
      visits: 0,
      revenue: 0,
      costs: 0,
      drawn: [],
    });
    expect(startCampaign(r, "online")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/One campaign at a time — Local flyers runs until day 6/),
    });
    expect(startCampaign(newTycoon(0), "flyers")).toMatchObject({
      ok: false,
      error: "Unlocks at level 2.",
    });
  });
  it("a campaign the daycare can't serve says so before you pay — and can't be launched", () => {
    const s = open();
    const noBeds = withFac(s, {
      ...fac(s),
      items: fac(s).items.filter((i) => i.kind !== "boarding_bed"),
    });
    expect(readiness(fac(noBeds), "boarding_ads")).toMatchObject({
      ready: false,
      why: expect.stringMatching(/boarding bed/),
    });
    expect(startCampaign(noBeds, "boarding_ads")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/boarding bed/),
    });
    const noBath = withFac(s, {
      ...fac(s),
      items: fac(s).items.filter((i) => !/tub/.test(i.kind)),
    });
    expect(startCampaign(noBath, "bath_promo")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/bath/),
    });
    expect(startCampaign(s, "welcome")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no inactive families/i),
    });
    expect(startCampaign(s, "referral")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no happy regulars/i),
    });
    expect(fac(noBeds).ledger).toEqual(fac(s).ledger);
  });
  it("shows the rooms, equipment and team it relies on", () => {
    const card = campaignCard(open(), "bath_promo");
    expect(card.checks.map((c) => c.label)).toEqual(["Rooms", "Equipment", "Team"]);
    expect(card.checks.every((c) => c.ok)).toBe(true);
    expect(card.checks[1]!.text).toMatch(/tub/i);
  });
  it("a full daycare explains the capacity problem before spending", () => {
    const s = open({
      footfall: [
        {
          day: 2,
          newWalkIns: 3,
          returning: 1,
          booked: 0,
          turned: { "Small & Gentle playroom full": 2, "lobby full": 1 },
          campaign: null,
        },
      ],
    });
    const card = campaignCard(s, "flyers");
    expect(card.warn).toMatch(/turned away 3 families for lack of space/i);
    expect(card.warn).toMatch(/more room/i);
    expect(ok(startCampaign(s, "flyers"))).toBeTruthy(); // the choice stays yours
  });
});

describe("responses are drawn in the simulation, once per active day", () => {
  it("each response becomes a booking carrying the campaign, or is declined as unmet demand — never coins", () => {
    const s = ok(startCampaign(open(), "flyers"));
    const t = tick(s, 1, never);
    const run = runOf(t);
    expect(run.drawn).toEqual([3]);
    expect(run.reached).toBe(200);
    const declined = Object.values(run.declined).reduce((a, n) => a + n, 0);
    expect(run.responses).toBe(run.booked + declined);
    expect(fac(t).bookings!.length).toBe(run.booked);
    for (const b of fac(t).bookings!) {
      expect(b.source).toEqual({ kind: "campaign", run: run.uid, name: "Local flyers" });
      expect(b.size === "small" && b.temper === "gentle").toBe(true); // only the kind there's a playroom for is booked
      expect(b.day === 3 ? b.min > 8 * 60 : b.day === 4).toBe(true);
    }
    for (const k of Object.keys(run.declined))
      expect(k).toMatch(/^no (Large|Small) & (Gentle|Active) playroom$/);
    expect(t.coins).toBe(s.coins);
    // drawn once: the rest of the day adds nothing
    const later = tick(t, 30, never);
    expect(runOf(later).responses).toBe(run.responses);
    expect(runOf(later).drawn).toEqual([3]);
  });
  it("the same day draws the same answers (decided once, not re-rolled)", () => {
    const s = ok(startCampaign(open(), "online"));
    const run = runOf(s);
    const a = drawDay(fac(s), run, 3);
    const b = drawDay(fac(s), run, 3);
    expect(a).toEqual(b);
  });
  it("nothing is drawn while the daycare is closed — the campaign's days are active days", () => {
    const s0 = ok(startCampaign(open(), "flyers"));
    const s = tick(withFac(s0, { ...fac(s0), open: false }), 60, never);
    expect(runOf(s).drawn).toEqual([]);
    expect(fac(s).campaign!.untilDay).toBe(6);
  });
  it("it ends clearly: no responses after its last day, and it never stacks", () => {
    let s = ok(startCampaign(open(), "flyers"));
    for (let day = 3; day <= 7; day++) {
      s = tick(s, 1, never);
      s = closeDay(s);
      s = withFac(s, { ...fac(s), clockMin: 8 * 60, dogs: [] });
    }
    expect(fac(s).campaign).toBeNull();
    expect(runOf(s).drawn).toEqual([3, 4, 5]);
    expect(runOf(s).reached).toBe(600);
    expect(ok(startCampaign(s, "flyers")).facilities).toBeTruthy();
  });
  it("a boarding campaign brings boarding enquiries; a bath promotion brings bath bookings", () => {
    for (const [id, check] of [
      ["boarding_ads", (b: { boarding: boolean }) => expect(b.boarding).toBe(true)],
      ["bath_promo", (b: { requests?: string[] }) => expect(b.requests).toEqual(["bath"])],
    ] as const) {
      const s = ok(startCampaign(open(), id));
      const run = runOf(s);
      const f = fac(s);
      const days = [3, 4, 5].map((d) => drawDay({ ...f, day: d }, run, d));
      const bookings = days.flatMap((d) => d.bookings);
      expect(days.reduce((n, d) => n + d.responses, 0)).toBeGreaterThan(0);
      for (const b of bookings) check(b as never);
    }
  });
  it("welcome-back letters reach inactive families; one with a problem nobody followed up rarely answers", () => {
    const happy = Array.from({ length: 12 }, (_, i) => fam(i, { visits: 2, friendship: 20 }));
    const hurt = Array.from({ length: 12 }, (_, i) =>
      fam(i + 20, {
        visits: 2,
        friendship: 20,
        sat: 30,
        issue: { text: "x", day: 1, followedUp: false },
      }),
    );
    const s = ok(startCampaign(open({ day: 8, guestBook: [...happy, ...hurt] }), "welcome"));
    const run = runOf(s);
    let f = fac(s);
    let answered = { happy: 0, hurt: 0 };
    for (const d of [8, 9]) {
      const r = drawDay({ ...f, day: d }, run, d);
      for (const b of r.bookings) answered[/^Pup([2-9]\d)$/.test(b.name) ? "hurt" : "happy"]++;
      f = { ...f, bookings: [...(f.bookings ?? []), ...r.bookings] };
      if (d === 8) expect(r.reached).toBe(24);
    }
    expect(answered.happy).toBeGreaterThan(answered.hurt);
    expect(answered.happy).toBeGreaterThan(0);
  });
  it("referral outreach asks happy regulars; their friends are new families they recommended", () => {
    const regulars = Array.from({ length: 8 }, (_, i) => fam(i, { lastDay: 3 }));
    const s = ok(startCampaign(open({ guestBook: regulars }), "referral"));
    const run = runOf(s);
    const days = [3, 4, 5].map((d) => drawDay({ ...fac(s), day: d }, run, d));
    expect(days[0]!.reached).toBe(8);
    const bookings = days.flatMap((d) => d.bookings);
    expect(bookings.length).toBeGreaterThan(0);
    for (const b of bookings) {
      expect(b.source).toMatchObject({ kind: "referral", run: run.uid });
      expect(regulars.map((g) => g.name)).toContain((b.source as { from: string }).from);
      expect(regulars.some((g) => g.name === b.name && g.breed === b.breed)).toBe(false);
    }
  });
  it("a save and reload mid-campaign neither loses nor repeats a day's draw", () => {
    const s = tick(ok(startCampaign(open(), "flyers")), 1, never);
    const back = parseTycoon(JSON.parse(JSON.stringify(s)))!;
    expect(runOf(back)).toEqual(runOf(s));
    expect(runOf(tick(back, 5, never)).drawn).toEqual([3]);
    const next = (x: TycoonState) =>
      runOf(
        tick(withFac(closeDay(x), { ...fac(closeDay(x)), clockMin: 8 * 60, dogs: [] }), 1, never),
      );
    expect(next(back)).toEqual(next(s));
  });
});

describe("whether it worked", () => {
  const run: CampaignRun = {
    uid: "c1",
    id: "flyers",
    name: "Local flyers",
    startDay: 3,
    untilDay: 6,
    cost: 150,
    reached: 600,
    responses: 7,
    booked: 5,
    declined: { "no Large & Active playroom": 2 },
    arrivals: 5,
    visits: 4,
    revenue: 160,
    costs: 8,
    drawn: [3, 4, 5],
  };
  it("contribution after the campaign's cost; overhead on those days shown apart, never called profit", () => {
    const s = open({ day: 7, campaignRuns: [run] });
    const r = runResult(fac(s), run);
    expect(r.contribution).toBe(160 - 8 - 150);
    expect(r.ended).toBe(true);
    expect(r.overhead.wages + r.overhead.upkeep).toBeGreaterThanOrEqual(0);
    expect(r.note).toMatch(/attributed/i);
    expect(r.note).toMatch(/not proof/i);
    expect(JSON.stringify(r)).not.toMatch(/profit/i);
  });
  it("first-time walk-ins a day with and without a campaign — a comparison, not proof", () => {
    const s = open({
      day: 7,
      footfall: [
        { day: 2, newWalkIns: 4, returning: 1, booked: 0, turned: {}, campaign: null },
        { day: 3, newWalkIns: 5, returning: 1, booked: 2, turned: {}, campaign: "flyers" },
        { day: 4, newWalkIns: 3, returning: 2, booked: 3, turned: {}, campaign: "flyers" },
        { day: 5, newWalkIns: 2, returning: 2, booked: 0, turned: {}, campaign: null },
        { day: 7, newWalkIns: 9, returning: 0, booked: 0, turned: {}, campaign: null },
      ],
    });
    expect(walkInBaseline(fac(s))).toEqual({
      with: { days: 2, perDay: 4, bookedPerDay: 2.5 },
      without: { days: 2, perDay: 3, bookedPerDay: 0 },
    });
  });
  it("customers at a glance: new, returning, regular, inactive; unmet demand by service and kind; why they couldn't come", () => {
    const s = open({
      day: 9,
      guestBook: [
        fam(1, { visits: 1, lastDay: 9 }),
        fam(2, { visits: 2, lastDay: 8, friendship: 10 }),
        fam(3, { lastDay: 8 }),
        fam(4, { lastDay: 2 }),
      ],
      footfall: [
        {
          day: 8,
          newWalkIns: 3,
          returning: 1,
          booked: 1,
          turned: {
            "no Large & Active playroom": 2,
            "lobby full": 1,
            "no bath room": 1,
            "boarding beds full": 1,
          },
          campaign: null,
        },
      ],
    });
    const c = customerSummary(fac(s));
    expect(c.status).toEqual({ new: 1, returning: 1, regular: 1, inactive: 1 });
    expect(c.unmet).toEqual({ daycare: 3, boarding: 1, bath: 1 });
    expect(c.reasons[0]).toEqual({ reason: "no Large & Active playroom", n: 2 });
    expect(c.came).toEqual({ newWalkIns: 3, returning: 1, booked: 1 });
  });
});
