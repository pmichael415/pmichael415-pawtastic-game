// Families have a history (customer-growth requirement §1, §3): status and a plain-language story, return likelihood
// from how visits went, free outreach that leads to a booking (never coins), and fair limits on contacting a family.
import { describe, expect, it } from "vitest";
import { mulberry } from "@/game/engine";
import {
  CONTACT_COOLDOWN,
  FREE_CALLS_PER_DAY,
  INACTIVE_AFTER,
  STAFF_CALLS,
  contact,
  contactBlock,
  familyStatus,
  familyStory,
  outreachOffers,
  returnWeight,
  setOutreachStaff,
} from "./customers";
import { createArrival, setOpen, tick } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { ok } from "./testkit";
import type { Facility, TRegular, TycoonState } from "./types";

const fam = (over: Partial<TRegular> = {}): TRegular => ({
  name: "Biscuit",
  breed: 1,
  size: "small",
  temper: "gentle",
  visits: 1,
  friendship: 10,
  lastDay: 1,
  sat: 85,
  firstDay: 1,
  ...over,
});
function daycare(day: number, guestBook: TRegular[]): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  return withFac(s, {
    ...fac(s),
    day,
    guestBook,
    introDay: 0,
    stats: { ...fac(s).stats, checkouts: 3 },
  });
}
const f0 = (day: number, g: TRegular[]): Facility => fac(daycare(day, g));

describe("a family's status and story", () => {
  it("new, returning, regular and inactive — from their visits, closeness and active days away", () => {
    expect(familyStatus(f0(1, []), fam())).toBe("new");
    expect(familyStatus(f0(2, []), fam({ visits: 2, lastDay: 2 }))).toBe("returning");
    expect(familyStatus(f0(3, []), fam({ visits: 3, friendship: 30, lastDay: 3 }))).toBe("regular");
    expect(
      familyStatus(f0(1 + INACTIVE_AFTER, []), fam({ visits: 3, friendship: 30, lastDay: 1 })),
    ).toBe("inactive");
    expect(familyStatus(f0(2, []), fam({ lastDay: 2, lostUntil: 5 }))).toBe("inactive");
  });
  it("inactivity counts active business days only: a family's status doesn't change while the game day doesn't", () => {
    // f.day only advances while the daycare is open and on screen, so time away never ages a family
    const g = fam({ visits: 2, lastDay: 3 });
    expect(familyStatus(f0(3, []), g)).toBe("returning");
    expect(familyStatus(f0(3 + INACTIVE_AFTER - 1, []), g)).toBe("returning");
    expect(familyStatus(f0(3 + INACTIVE_AFTER, []), g)).toBe("inactive");
  });
  it("each status has a plain-language reason", () => {
    expect(
      familyStory(
        f0(1, []),
        fam({ source: { kind: "campaign", run: "c1", name: "Local flyers" } }),
      ),
    ).toMatch(/First visit on day 1 — heard about you from Local flyers/);
    expect(familyStory(f0(4, []), fam({ visits: 4, friendship: 40, lastDay: 4, sat: 90 }))).toMatch(
      /A regular — Biscuit went home delighted last time \(visit #4, Pal\)/,
    );
    expect(familyStory(f0(9, []), fam({ visits: 2, lastDay: 3 }))).toMatch(
      /Hasn't been back for 6 active days/,
    );
    const hurt = fam({
      visits: 2,
      lastDay: 3,
      sat: 30,
      lostUntil: 6,
      issue: { text: "Taylor waited 60 minutes at pickup.", day: 3, followedUp: false },
    });
    expect(familyStory(f0(4, []), hurt)).toMatch(
      /Stopped coming after day 3: Taylor waited 60 minutes at pickup\. It wasn't put right — a follow-up call can win them back\./,
    );
  });
});

describe("who comes back on their own", () => {
  it("a delighted family is far more likely to return than one that left upset with nothing put right", () => {
    const happy = fam({ name: "Biscuit", sat: 92, friendship: 40, visits: 3, lastDay: 2 });
    const hurt = fam({
      name: "Daisy",
      breed: 4,
      sat: 25,
      friendship: 5,
      visits: 1,
      lastDay: 2,
      issue: { text: "Daisy never got a playroom.", day: 2, followedUp: false },
    });
    const f = f0(3, [happy, hurt]);
    expect(returnWeight(f, happy)).toBeGreaterThan(5 * returnWeight(f, hurt));
    let s = withFac(ok(setOpen(daycare(3, [happy, hurt]), true)), {
      ...f,
      open: true,
      clockMin: 9 * 60,
      guestBook: [happy, hurt],
    });
    const rand = mulberry(42);
    const came: Record<string, number> = { Biscuit: 0, Daisy: 0 };
    for (let i = 0; i < 400; i++) {
      const r = createArrival(withFac(s, { ...fac(s), dogs: [] }), rand);
      if (!r.ok) continue;
      const d = fac(r.state).dogs.at(-1)!;
      if (d.name in came && d.visits > 1) came[d.name]!++;
    }
    expect(came["Biscuit"]).toBeGreaterThan(4 * came["Daisy"]!);
  });
  it("a family staying away after an unresolved problem doesn't come back on its own in those days", () => {
    const hurt = fam({ lostUntil: 6, issue: { text: "x", day: 3, followedUp: false } });
    expect(returnWeight(f0(4, [hurt]), hurt)).toBe(0);
  });
});

describe("outreach: free, simple, fair — and it leads to a booking, never coins", () => {
  it("thank a family after a good visit: a booking may follow (decided once), no coins change hands", () => {
    const s = daycare(2, [fam({ lastDay: 2, sat: 90, visits: 1 })]);
    const r = contact(s, { name: "Biscuit", breed: 1 }, "thank");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.coins).toBe(s.coins);
    const f = fac(r.state);
    expect(f.guestBook[0]!.thankedFor).toBe(2);
    expect(f.outreach!.stats.calls).toBe(1);
    expect(f.outreach!.used).toBe(1);
    // the answer is decided once: either a booking on a coming active day, or "they'll think about it"
    const b = f.bookings ?? [];
    if (b.length) {
      expect(b[0]).toMatchObject({
        name: "Biscuit",
        breed: 1,
        source: { kind: "outreach", by: "you", what: "thank" },
      });
      expect(b[0]!.day).toBeGreaterThan(2);
      expect(r.msg).toMatch(/booked/);
    } else expect(r.msg).toMatch(/think about it/);
  });
  it("each save's families answer for themselves: decided once per save, but not the same answer in every new game", () => {
    const answer = (startedAt: number) => {
      const s = daycare(2, [fam({ lastDay: 2, sat: 90, visits: 1 })]);
      const r = ok(contact({ ...s, tour: { mode: "quick" as const, beat: "goals" as const, startedAt, upgrade: null, done: true, skipped: false } }, { name: "Biscuit", breed: 1 }, "thank"));
      return (fac(r).bookings ?? []).length > 0;
    };
    expect(answer(1234)).toBe(answer(1234));
    const many = Array.from({ length: 24 }, (_, i) => answer(1_700_000_000_000 + i * 977));
    expect(many.some(Boolean) && !many.every(Boolean)).toBe(true);
  });
  it("one thank-you per visit, and one contact per family every few active days", () => {
    const s = ok(
      contact(daycare(2, [fam({ lastDay: 2, sat: 90 })]), { name: "Biscuit", breed: 1 }, "thank"),
    );
    expect(contact(s, { name: "Biscuit", breed: 1 }, "thank")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already thanked/i),
    });
    const later = withFac(s, {
      ...fac(s),
      day: 2 + CONTACT_COOLDOWN - 1,
      guestBook: fac(s).guestBook.map((g) => ({ ...g, lastDay: 1 + CONTACT_COOLDOWN })),
    });
    expect(contact(later, { name: "Biscuit", breed: 1 }, "thank")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/contacted them on day 2/i),
    });
  });
  it(`${FREE_CALLS_PER_DAY} free calls an active day; the next day brings them back`, () => {
    const many = ["Biscuit", "Daisy", "Milo", "Luna"].map((name, i) =>
      fam({ name, breed: i, lastDay: 1, visits: 2, sat: 80 }),
    );
    let s = daycare(1 + INACTIVE_AFTER, many);
    for (let i = 0; i < FREE_CALLS_PER_DAY; i++)
      s = ok(contact(s, { name: many[i]!.name, breed: i }, "invite"));
    expect(contact(s, { name: "Luna", breed: 3 }, "invite")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no free calls left today/i),
    });
    const tomorrow = withFac(s, { ...fac(s), day: fac(s).day + 1 });
    expect(contact(tomorrow, { name: "Luna", breed: 3 }, "invite").ok).toBe(true);
  });
  it("a family whose kind of pup has no playroom here can't be invited (it says why)", () => {
    const s = daycare(6, [
      fam({ name: "Rocket", breed: 0, size: "large", temper: "active", lastDay: 1, visits: 2 }),
    ]);
    expect(contact(s, { name: "Rocket", breed: 0 }, "invite")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no Large & Active playroom/),
    });
  });
  it("a follow-up after a problem ends the stay-away and records it; the family's story says so", () => {
    const hurt = fam({
      lastDay: 3,
      sat: 30,
      lostUntil: 6,
      issue: { text: "Taylor waited 60 minutes at pickup.", day: 3, followedUp: false },
    });
    const r = ok(contact(daycare(4, [hurt]), { name: "Biscuit", breed: 1 }, "followup"));
    const g = fac(r).guestBook[0]!;
    expect(g.lostUntil ?? 0).toBeLessThanOrEqual(4);
    expect(g.issue!.followedUp).toBe(true);
    expect(familyStory(fac(r), g)).toMatch(/You followed up/);
  });
  it("no call is offered while a family can't be contacted: within a few days of the last contact, or while their pup is here or booked in", () => {
    const g = fam({ lastDay: 3, sat: 90, visits: 2, contactDay: 2, thankedFor: 2 });
    expect(outreachOffers(f0(3, [g]), g)).toEqual([]);
    expect(contactBlock(f0(3, [g]), g)).toBe("You got in touch on day 2 — you can again from day 5.");
    expect(outreachOffers(f0(5, [g]), g).map((o) => o.kind)).not.toContain("thank"); // that visit's thank-you window has passed
    const fresh = fam({ lastDay: 3, sat: 90 });
    const booked = { ...f0(3, [fresh]), bookings: [{ uid: "b1", name: "Biscuit", breed: 1, size: "small" as const, temper: "gentle" as const, day: 4, min: 600, boarding: false, source: { kind: "walk-in" as const } }] };
    expect(outreachOffers(booked, fresh)).toEqual([]);
    expect(contactBlock(booked, fresh)).toMatch(/booked in for day 4 at 10:00/);
    expect(outreachOffers(f0(3, [fresh]), fresh).map((o) => o.kind)).toContain("thank");
  });
  it("the offers on a family's record fit them: thank after a good visit, invite when inactive, follow up after a problem", () => {
    const f = f0(2, []);
    expect(outreachOffers(f, fam({ lastDay: 2, sat: 90 })).map((o) => o.kind)).toContain("thank");
    expect(outreachOffers(f0(9, []), fam({ lastDay: 2, visits: 2 })).map((o) => o.kind)).toContain(
      "invite",
    );
    expect(
      outreachOffers(
        f0(4, []),
        fam({ lastDay: 3, sat: 30, lostUntil: 6, issue: { text: "x", day: 3, followedUp: false } }),
      ).map((o) => o.kind),
    ).toEqual(["followup"]);
  });
});

describe("staff take an outreach workload as the daycare grows", () => {
  const team = (s: TycoonState) =>
    withFac(s, {
      ...fac(s),
      staff: [...fac(s).staff, { id: "s9", name: "Maya", energy: 100, role: "reception" }],
    });
  const book = () => [
    fam({ name: "Happy", breed: 2, lastDay: 1, visits: 2 }),
    fam({
      name: "Hurt",
      breed: 3,
      lastDay: 4,
      sat: 30,
      lostUntil: 7,
      issue: { text: "x", day: 4, followedUp: false },
    }),
    fam({ name: "Gone", breed: 1, lastDay: 1, visits: 3, friendship: 30 }),
    fam({
      name: "Away",
      breed: 1,
      size: "small",
      temper: "gentle",
      lastDay: 1,
      visits: 2,
      sat: 70,
    }),
  ];
  it("only a hired team member can be assigned", () => {
    const s = daycare(5, book());
    expect(setOutreachStaff(s, fac(s).staff[0]!.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/hire/i),
    });
    const t = ok(setOutreachStaff(team(s), "s9"));
    expect(fac(t).outreachBy).toBe("s9");
    expect(fac(ok(setOutreachStaff(t, null))).outreachBy ?? null).toBeNull();
  });
  it(`in the midday break they call up to ${STAFF_CALLS} families — follow-ups first — without using your free calls`, () => {
    let s = ok(setOutreachStaff(team(daycare(5, book())), "s9"));
    s = withFac(ok(setOpen(s, true)), { ...fac(s), open: true, clockMin: 11 * 60 + 58 });
    s = tick(s, 1, () => 0.999);
    const f = fac(s);
    expect(f.outreach!.staff).toMatchObject({ day: 5, calls: STAFF_CALLS });
    expect(f.outreach!.used).toBe(0);
    expect(f.guestBook.find((g) => g.name === "Hurt")!.issue!.followedUp).toBe(true);
    expect(f.guestBook.filter((g) => g.contactDay === 5)).toHaveLength(STAFF_CALLS);
    for (const b of f.bookings ?? [])
      expect(b.source).toMatchObject({ kind: "outreach", by: "staff" });
    // once per active day
    const again = tick(withFac(s, { ...f, clockMin: 11 * 60 + 58 }), 1, () => 0.999);
    expect(fac(again).outreach!.staff!.calls).toBe(STAFF_CALLS);
  });
  it("nothing happens while the daycare is closed", () => {
    let s = ok(setOutreachStaff(team(daycare(5, book())), "s9"));
    s = withFac(s, { ...fac(s), open: false, clockMin: 11 * 60 + 58 });
    expect(fac(tick(s, 2, () => 0.999)).outreach?.staff).toBeUndefined();
  });
});
