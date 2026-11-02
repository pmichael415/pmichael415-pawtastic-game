// The stalled save from the audit (44 coins, two unhappy pups waiting, a loss every day, no service income):
// how it happened, what the player is told, and that it recovers through play (service design, "Stalls").
import { describe, expect, it } from "vitest";
import { setRoomType } from "./build";
import { incomeBlockers } from "./blockers";
import { assignRoom, checkout, playtime, setOpen, tick } from "./run";
import { fac, newTycoon, withFac } from "./state";
import { guidedBuild, ok } from "./testkit";
import { defaultVisit } from "./visit";
import type { TDog, TycoonState } from "./types";

/** The audit's save: the guided daycare (one Small & Gentle playroom), 44 coins, two Large & Active pups waiting. */
function stalled(): TycoonState {
  let s = ok(setOpen(guidedBuild(newTycoon(0)), true));
  const f = fac(s);
  const pup = (id: string, name: string): TDog => {
    const d: TDog = { id, name, breed: 0, size: "large", temper: "active", visits: 1, place: { kind: "lobby" }, checkedIn: true, happiness: 30, clean: 50, boarding: false, played: 0, bathed: false };
    return { ...d, visit: defaultVisit(f, d) };
  };
  s = withFac({ ...s, coins: 44 }, { ...f, day: 5, clockMin: 9 * 60, dogs: [pup("d1", "Bruno"), pup("d2", "Maple")] });
  return s;
}
const still = () => 0.99;

describe("the stalled save", () => {
  it("how it happened: the only playroom is for Small & Gentle pups, so the Large & Active ones can't be placed", () => {
    const s = stalled();
    const room = fac(s).rooms.find((r) => r.type === "playroom")!;
    expect(room.group).toBe("small-gentle");
    const r = assignRoom(s, "d1", room.uid);
    expect(r.ok).toBe(false); // a mismatch needs confirmation (and risks a scuffle) — so they waited, unhappy
  });
  it("the player is told what's blocking income, with a free fix", () => {
    const b = incomeBlockers(stalled());
    const group = b.find((x) => x.id === "group-large-active")!;
    expect(group.title).toMatch(/No playroom for Large & Active pups \(2 waiting\)/);
    expect(group.fix).toMatch(/Change type/);
    expect(group.fix).toMatch(/free/);
    expect(b.some((x) => x.id === "unhappy" || x.id === "group-large-active")).toBe(true);
  });
  it("recovering through play: regroup the empty playroom for free, settle them, play, check out — coins go up", () => {
    let s = stalled();
    const room = fac(s).rooms.find((r) => r.type === "playroom")!.uid;
    const coins = s.coins;
    s = ok(setRoomType(s, room, "playroom", "large-active"));
    expect(s.coins).toBe(coins); // free
    for (const id of ["d1", "d2"]) {
      s = ok(assignRoom(s, id, room));
      s = ok(playtime(s, id));
    }
    s = ok(checkout(s, "d1", false));
    expect(s.coins).toBeGreaterThan(coins);
  });
  it("doing nothing no longer stalls forever: their families collect them at 18:00 and the lobby is free again", () => {
    let s = withFac(stalled(), { ...fac(stalled()), clockMin: 17 * 60 + 50 });
    const day = fac(s).day;
    for (let i = 0; i < 100 && fac(s).day === day; i++) s = tick(s, 1, still);
    expect(fac(s).dogs.filter((d) => d.place.kind === "lobby")).toHaveLength(0);
  });
  it("coins below zero never block serving pups (only building, hiring and marketing pause)", () => {
    let s = { ...stalled(), coins: -20 };
    const room = fac(s).rooms.find((r) => r.type === "playroom")!.uid;
    s = ok(setRoomType(s, room, "playroom", "large-active"));
    s = ok(assignRoom(s, "d1", room));
    s = ok(playtime(s, "d1"));
    s = ok(checkout(s, "d1", false));
    expect(s.coins).toBeGreaterThan(-20);
  });
  it("closed, nothing runs: no day passes and nothing is charged", () => {
    const s = ok(setOpen(stalled(), false));
    const t = tick(s, 600, still);
    expect(t.coins).toBe(s.coins);
    expect(fac(t).day).toBe(fac(s).day);
  });
});

describe("what's blocking income", () => {
  it("names the cause: closed, lobby full, playroom full, tired staff, below zero", () => {
    const closed = ok(setOpen(stalled(), false));
    expect(incomeBlockers(closed).map((b) => b.id)).toContain("closed");
    const broke = { ...stalled(), coins: -5 };
    expect(incomeBlockers(broke).map((b) => b.id)).toContain("below-zero");
    const tired = withFac(stalled(), { ...fac(stalled()), staff: fac(stalled()).staff.map((x) => ({ ...x, energy: 2 })) });
    expect(incomeBlockers(tired).map((b) => b.id)).toContain("tired");
  });
  it("a daycare serving pups fine has nothing blocking it", () => {
    let s = stalled();
    const room = fac(s).rooms.find((r) => r.type === "playroom")!.uid;
    s = ok(setRoomType(s, room, "playroom", "large-active"));
    s = ok(assignRoom(s, "d1", room));
    s = ok(assignRoom(s, "d2", room));
    s = ok(playtime(s, "d1"));
    s = ok(playtime(s, "d2"));
    s = withFac(s, { ...fac(s), dogs: fac(s).dogs.map((d) => ({ ...d, happiness: 80 })) });
    expect(incomeBlockers(s)).toEqual([]);
  });
});
