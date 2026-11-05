// Audit finding 2: every coin is on the books. For any sequence of play — services, building, selling, rewards,
// refunds, closing the day, a reload, an old save — opening coins + recorded inflows − recorded outflows = closing
// coins. Sale proceeds are recorded on their own (they are not service revenue); unrelated rewards are bonus income.
import { describe, expect, it } from "vitest";
import { mulberry, seedFrom } from "@/game/engine";
import { buildConnectedRoom, placeThing, removeDoor, sellRoom, sellThing } from "./build";
import { closeDay } from "./business";
import { claimGuide } from "./guide";
import { gainXp, level, levelReward, xpForLevel } from "./progress";
import { checkTrophies } from "./trophies";
import { assignRoom, checkIn, checkout, createArrival, playtime, setOpen, tick, welcomeBack } from "./run";
import { pickupView, remedy } from "./pickup";
import { nextAction } from "./nextAction";
import { quickStart } from "./start";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { ok } from "./testkit";
import type { DayLedger, TycoonState } from "./types";

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const change = (d: DayLedger) => sum(d.income) + (d.sales ?? 0) - sum(d.expenses);
/** Coins not explained by the books. Must never move. */
const gap = (s: TycoonState) => s.coins - fac(s).ledger.reduce((a, d) => a + change(d), 0);

describe("every coin is on the books", () => {
  it("selling things, a room and a door is recorded as sale proceeds — not service revenue", () => {
    let s: TycoonState = { ...ok(quickStart(newTycoon(0))), tour: null };
    const g0 = gap(s);
    const income0 = sum(fac(s).ledger.at(-1)!.income);
    const flowers = fac(s).items.find((i) => i.kind === "flowers")!;
    s = ok(sellThing(s, flowers.uid));
    expect(gap(s)).toBe(g0);
    const lobby = fac(s).rooms.find((r) => r.type === "lobby")!;
    const westDoor = lobby.doors.find((d) => d.side === "W")!; // the calm room's way in (nobody inside)
    s = ok(removeDoor(s, lobby.uid, westDoor));
    expect(gap(s)).toBe(g0);
    s = ok(sellRoom(s, fac(s).rooms.find((r) => r.type === "calm")!.uid));
    expect(gap(s)).toBe(g0);
    const d = fac(s).ledger.at(-1)!;
    expect(d.sales).toBeGreaterThan(0);
    expect(sum(d.income)).toBe(income0); // proceeds are not revenue
  });

  it("a level reward on a day with no ledger entry yet creates today's entry and records it", () => {
    const base: TycoonState = { ...ok(quickStart(newTycoon(0))), tour: null };
    const s = withFac(base, { ...fac(base), ledger: [] }); // e.g. an old save, or a day not yet written
    const g0 = gap(s);
    const t = gainXp(s, xpForLevel(level(s) + 1) - s.xp);
    expect(t.coins - s.coins).toBe(levelReward(level(s) + 1));
    expect(gap(t)).toBe(g0);
    expect(fac(t).ledger.at(-1)).toMatchObject({ day: fac(t).day, income: expect.objectContaining({ bonus: levelReward(level(s) + 1) }) });
  });

  it("a whole mixed run — services, staff-free play, building, selling, trophies, the guide, a welcome back, refunds, nights — then a reload, never leaves a coin unexplained", () => {
    const rand = mulberry(seedFrom("reconcile"));
    let s: TycoonState = ok(setOpen({ ...ok(quickStart(newTycoon(0))), tour: null }, true));
    const g0 = gap(s);
    const did = new Set<string>();
    const step = (t: TycoonState, what: string) => {
      expect(gap(t), what).toBe(g0);
      if (t !== s) did.add(what);
      return t;
    };
    for (let i = 0; i < 1500 && fac(s).day <= 2; i++) {
      s = step(tick(s, 1, rand), "tick");
      for (const d of fac(s).dogs) {
        const n = nextAction(fac(s), d);
        const r = n.id === "checkin" ? checkIn(s, d.id) : n.id === "room" ? assignRoom(s, d.id, n.room!) : n.id === "play" ? playtime(s, d.id) : n.id === "checkout" ? checkout(s, d.id, false) : null;
        if (r?.ok) s = step(r.state, n.id);
      }
      s = step(checkTrophies(s).state, "trophies");
      if (i === 300) s = step(ok(placeThing(s, "rug", 17, 23, 0)), "buy a rug");
      if (i >= 400 && fac(s).items.some((x) => x.kind === "rug")) {
        const r = sellThing(s, fac(s).items.find((x) => x.kind === "rug")!.uid); // only once the lobby is empty
        if (r.ok) s = step(r.state, "sell it");
      }
      if (i === 500) {
        const r = buildConnectedRoom({ ...s }, { c: 11, r: 17, w: 3, d: 3 }, "bath");
        if (r.ok) s = step(r.state, "build a bath room");
      }
    }
    // a refund, for real: a family kept waiting over 45 minutes at pickup gets part of the daycare back in game coins
    {
      const f = fac(s);
      const play = f.rooms.find((r) => r.type === "playroom")!.uid;
      let t: TycoonState = withFac(s, { ...f, open: true, clockMin: 10 * 60 });
      t = ok(createArrival(t, () => 0.1));
      const pup = fac(t).dogs.at(-1)!;
      t = withFac(t, { ...fac(t), dogs: fac(t).dogs.map((d) => (d.id === pup.id ? { ...d, size: "small" as const, temper: "gentle" as const, boarding: false } : d)) });
      t = ok(checkIn(t, pup.id));
      t = ok(assignRoom(t, pup.id, play));
      t = ok(playtime(t, pup.id));
      t = withFac(t, { ...fac(t), clockMin: 15 * 60, dogs: fac(t).dogs.map((d) => (d.id === pup.id ? { ...d, happiness: 85, visit: { ...d.visit!, pickup: 14 * 60, ownerHere: 14 * 60 } } : d)) });
      expect(pickupView(t, pup.id, false).options.wait).toContain("refund");
      t = ok(remedy(t, pup.id, "wait", "refund"));
      t = ok(checkout(t, pup.id, false));
      expect(fac(t).outcomes.at(-1)!.lines.some((l) => /^Refund — the wait/.test(l.label) && l.amount < 0)).toBe(true);
      s = step(t, "refund");
    }
    s = step({ ...s, guide: { ...s.guide, painted: true } }, "paint");
    const g = claimGuide(s);
    if (g.ok) s = step(g.state, "guide reward");
    s = step(welcomeBack({ ...s, lastSeen: 0 }, 2 * 60 * 60 * 1000).state, "welcome back");
    s = step(closeDay(s), "close the day");
    // the run really did each kind of transaction (not skipped)
    for (const k of ["checkin", "room", "play", "checkout", "buy a rug", "sell it", "build a bath room", "refund", "guide reward", "welcome back", "close the day"]) expect(did, k).toContain(k);
    expect(fac(s).ledger.some((d) => d.sales > 0)).toBe(true);
    const reloaded = parseTycoon(JSON.parse(JSON.stringify(s)))!;
    expect(reloaded.coins).toBe(s.coins);
    expect(gap(reloaded)).toBe(g0);
  });

  it("an old save whose ledger has no sale field still loads and adds up", () => {
    const s: TycoonState = { ...ok(quickStart(newTycoon(0))), tour: null };
    const raw = JSON.parse(JSON.stringify(s));
    for (const d of raw.facilities.f1.ledger) {
      delete d.sales;
      delete d.income.tips;
    }
    const loaded = parseTycoon(raw)!;
    expect(fac(loaded).ledger.at(-1)!.sales).toBe(0);
    expect(fac(loaded).ledger.at(-1)!.income.tips).toBe(0);
    const t = ok(sellThing(loaded, fac(loaded).items.find((i) => i.kind === "flowers")!.uid));
    expect(gap(t)).toBe(gap(loaded));
  });
});

describe("refunds on an older save (audit gap D)", () => {
  it("a refund larger than the bill, on a day with no ledger entry yet, is booked on today's entry — never yesterday's — and the books still add up after a reload", () => {
    // an older save, loaded the morning after a day closed: its books end with yesterday
    let s: TycoonState = ok(setOpen({ ...ok(quickStart(newTycoon(0))), tour: null }, true));
    s = closeDay(s);
    const f = fac(s);
    const calm = f.rooms.find((r) => r.type === "calm")!.uid;
    // a pup resting in the calm room whose bath was paid for in advance and never done; the family is here
    const raw = JSON.parse(JSON.stringify(withFac(s, { ...f, clockMin: 10 * 60 })));
    // an older save's books can end with yesterday (nothing recorded today yet) — loading accepts that
    raw.facilities.f1.ledger = raw.facilities.f1.ledger.filter((d: { day: number }) => d.day < f.day);
    raw.facilities.f1.dogs = [{ id: "dold", name: "Pepper", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "calm", room: calm }, checkedIn: true, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false, visit: { owner: "Sam", requests: ["daycare", "bath"], prepaid: ["bath"], arrivedDay: f.day, arrived: 480, pickupDay: f.day, pickup: 600, ownerHere: 600, waitedLobby: 0, checkedInAt: 480, history: [], scuffle: false, safeMove: false, finishing: null, remedies: {}, paid: 25 } }];
    let t = parseTycoon(raw)!;
    expect(t).not.toBeNull();
    expect(fac(t).ledger.at(-1)!.day).toBe(fac(t).day - 1);
    const g0 = gap(t);
    const yesterday = fac(t).ledger.at(-1)!;
    expect(pickupView(t, "dold", false).options.billing).toContain("refund");
    t = ok(remedy(t, "dold", "billing", "refund"));
    t = ok(checkout(t, "dold", false));
    expect(fac(t).outcomes.at(-1)!.total).toBe(-25);
    const books = fac(t).ledger;
    const todayEntry = books.find((d) => d.day === fac(t).day);
    expect(todayEntry?.expenses.refunds).toBe(25);
    expect(books.find((d) => d.day === yesterday.day)!.expenses.refunds).toBe(yesterday.expenses.refunds);
    expect(todayEntry!.sales).toBe(0); // a refund is not a sale
    expect(gap(t)).toBe(g0);
    const reloaded = parseTycoon(JSON.parse(JSON.stringify(t)))!;
    expect(gap(reloaded)).toBe(g0);
    expect(reloaded.coins).toBe(t.coins);
  });
});
