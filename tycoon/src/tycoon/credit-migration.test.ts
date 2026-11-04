// Audit finding 6: no daycare credit in the game. Saves from before that promised a family "credit next visit" are
// settled once, on load, as a game-coin refund recorded on today's books (the alternative they could have had), and
// the promise is removed. Nothing else in the save changes; the books still add up.
import { describe, expect, it } from "vitest";
import { quickStart } from "./start";
import { fac, newTycoon, parseTycoon } from "./state";
import { ok } from "./testkit";

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const books = (s: ReturnType<typeof parseTycoon>) => fac(s!).ledger.reduce((a, d) => a + sum(d.income) + (d.sales ?? 0) - sum(d.expenses), 0);

describe("saved credits are settled once, fairly", () => {
  it("credits owed to returning families become a refund recorded today, the promise goes, and coins still match the books", () => {
    const s = { ...ok(quickStart(newTycoon(0))), tour: null };
    const raw = JSON.parse(JSON.stringify(s));
    raw.facilities.f1.guestBook = [
      { name: "Biscuit", breed: 1, size: "small", temper: "gentle", visits: 2, friendship: 3, lastDay: 1, sat: 60, credit: 20 },
      { name: "Daisy", breed: 2, size: "small", temper: "gentle", visits: 1, friendship: 1, lastDay: 1, credit: 15 },
    ];
    const gap0 = s.coins - books(parseTycoon(JSON.parse(JSON.stringify(s))));
    const loaded = parseTycoon(raw)!;
    expect(loaded.coins).toBe(s.coins - 35);
    expect(fac(loaded).guestBook.every((g) => !("credit" in g))).toBe(true);
    expect(fac(loaded).guestBook).toHaveLength(2); // the families themselves are kept
    expect(fac(loaded).ledger.at(-1)!.expenses.refunds).toBe(35);
    expect(loaded.settledCredits).toBe(35);
    expect(loaded.coins - books(loaded)).toBe(gap0);
    // and only once: saving and loading again settles nothing more
    const again = parseTycoon(JSON.parse(JSON.stringify(loaded)))!;
    expect(again.coins).toBe(loaded.coins);
    expect(again.settledCredits ?? 0).toBe(0);
  });
  it("a visit in progress whose complaint was answered with a credit is asked again at checkout", () => {
    const s = { ...ok(quickStart(newTycoon(0))), tour: null };
    const raw = JSON.parse(JSON.stringify(s));
    const play = raw.facilities.f1.rooms.find((r: { type: string }) => r.type === "playroom").uid;
    raw.facilities.f1.dogs = [{ id: "dq", name: "Quill", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room: play }, checkedIn: true, happiness: 70, clean: 80, boarding: false, played: 1, bathed: false, visit: { owner: "Kai", requests: ["daycare", "bath"], prepaid: [], arrivedDay: 1, arrived: 480, pickupDay: 1, pickup: 960, ownerHere: 960, waitedLobby: 0, checkedInAt: 480, history: [], scuffle: false, safeMove: false, finishing: null, remedies: { bath: "credit" }, paid: 0 } }];
    const loaded = parseTycoon(raw)!;
    expect(fac(loaded).dogs[0]!.visit!.remedies).toEqual({});
  });
});
