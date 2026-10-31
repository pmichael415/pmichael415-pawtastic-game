import { describe, expect, it } from "vitest";
import { checkIn, createArrival, FREE_COSMETICS, LOBBY_CAP, newGame, parseSave, recoveryDogs, DAY_OPEN, type GameState } from "./engine";

const validSave = (): GameState => ({ ...newGame(0, "d"), coins: 321 });
const must = (r: { ok: boolean; state?: GameState; error?: string }) => { if (!r.ok) throw new Error(r.error); return r.state!; };
const freeId = FREE_COSMETICS[0]!.id;

describe("parseSave repairs", () => {
  it("strips paid product IDs from cosmetics, equipped and entitlements", () => {
    const s = parseSave({ ...validSave(), cosmetics: ["blue-ribbon-style", "deluxe-daycare-decor"], equipped: "blue-ribbon-style", entitlements: ["blue-ribbon-style"] })!;
    expect(s.cosmetics).toEqual([]);
    expect(s.equipped).toBeNull();
    expect((s as unknown as Record<string, unknown>)["entitlements"]).toBeUndefined();
    expect(s.coins).toBe(321);
  });

  it("keeps earned free cosmetics and their equip", () => {
    const s = parseSave({ ...validSave(), cosmetics: [freeId, "blue-ribbon-style", "paid:x"], equipped: freeId })!;
    expect(s.cosmetics).toEqual([freeId]);
    expect(s.equipped).toBe(freeId);
  });

  it("moves excess unchecked lobby pups to recovery and they can still check in", () => {
    let g = { ...validSave(), clockMin: DAY_OPEN + 60 };
    const tpl = must(createArrival(g, () => 0.3)).dogs.at(-1)!;
    for (let i = 0; i < LOBBY_CAP + 2; i++) g = { ...g, dogs: [...g.dogs, { ...tpl, id: `d${i + 1}` }] };
    g = { ...g, seq: LOBBY_CAP + 3 };
    const s = parseSave(g)!;
    expect(s.dogs).toHaveLength(LOBBY_CAP + 2);
    expect(s.dogs.filter((d) => d.place.kind === "lobby")).toHaveLength(LOBBY_CAP);
    const rec = recoveryDogs(s, "hawthorne");
    expect(rec).toHaveLength(2);
    expect(rec.every((d) => !d.checkedIn)).toBe(true);
    expect(must(checkIn(s, rec[0]!.id)).coins).toBeGreaterThan(s.coins);
  });

  it("gives unique IDs and a sequence above all generated IDs when seq is missing", () => {
    const base = validSave() as unknown as Record<string, unknown>;
    delete base["seq"];
    const s = parseSave({ ...base, dogs: [{ id: "d7", name: "A" }, { name: "B" }, { id: "d_fix0", name: "C" }, { id: "d7", name: "D" }, { id: "x", name: "E" }, { id: "x", name: "F" }] })!;
    const ids = s.dogs.map((d) => d.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toContain("d7");
    expect(ids).toContain("d_fix0");
    expect(s.seq).toBeGreaterThanOrEqual(8);
    expect(ids).not.toContain(`d${s.seq}`);
  });
});
