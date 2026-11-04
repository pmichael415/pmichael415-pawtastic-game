import { describe, expect, it } from "vitest";
import { firstFreeRoomPlan, placeFirstFree, rankedRoomsFor } from "./build";
import { canOpen, connectedRooms } from "./connect";
import { fac, newTycoon } from "./state";
import { ok } from "./testkit";
import type { TycoonState } from "./types";

const newest = (s: TycoonState) => fac(s).rooms.at(-1)!;

describe("the exact quote before you build (empire milestone §2: the hub build listed 'from 430' and charged 570)", () => {
  it("quotes the room, its door and every path square — and building charges exactly that", () => {
    const s0 = newTycoon(0);
    const q = firstFreeRoomPlan(fac(s0), "lobby");
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.cost.total).toBe(q.cost.room + q.cost.door + q.cost.paths);
    expect(q.cost.paths).toBe(q.paths.length * 10);
    const s = ok(placeFirstFree(s0, { room: "lobby" }));
    expect(s0.coins - s.coins).toBe(q.cost.total);
    expect(newest(s)).toMatchObject(q.rect);
  });
  it("says why when there's no spot (one lobby per daycare)", () => {
    const s = ok(placeFirstFree(newTycoon(0), { room: "lobby" }));
    const q = firstFreeRoomPlan(fac(s), "lobby");
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.reason).toMatch(/Only one Lobby/);
  });
  it("furniture: the rooms it fits, best first (fun goes where pups play)", () => {
    let s = ok(placeFirstFree(newTycoon(0), { room: "lobby" }));
    s = ok(placeFirstFree(s, "front_counter"));
    s = ok(placeFirstFree(s, { room: "playroom", group: "small-gentle" }));
    s = ok(placeFirstFree(s, "dog_bed"));
    const f = fac(s);
    expect(rankedRoomsFor(f, "water_bowl").map((r) => r.type)).toEqual(["playroom", "lobby"]);
    expect(rankedRoomsFor(f, "bath_tub")).toEqual([]);
  });
});

describe("place in first free spot", () => {
  it("a room gets its type, a door and a paved route to the entrance, all charged", () => {
    const s0 = newTycoon(0);
    const s = ok(placeFirstFree(s0, { room: "lobby" }));
    const lobby = newest(s);
    expect(lobby).toMatchObject({ type: "lobby", w: 4, d: 3, c: 10, r: 16 });
    expect(lobby.doors).toHaveLength(1);
    expect(connectedRooms(fac(s)).has(lobby.uid)).toBe(true);
    const paths = fac(s).items.filter((i) => i.kind === "path" && i.uid !== "entrance").length;
    expect(paths).toBeGreaterThan(0);
    expect(s.xp).toBeLessThan(100); // no level-up reward muddying the coin count
    expect(s0.coins - s.coins).toBe(400 + 30 + 10 * paths);
  });
  it("builds the whole guided start, and the daycare can open", () => {
    let s = ok(placeFirstFree(newTycoon(0), { room: "lobby" }));
    s = ok(placeFirstFree(s, "front_counter"));
    s = ok(placeFirstFree(s, "bench"));
    s = ok(placeFirstFree(s, { room: "playroom", group: "small-gentle" }));
    expect(newest(s).group).toBe("small-gentle");
    s = ok(placeFirstFree(s, "dog_bed"));
    s = ok(placeFirstFree(s, "dog_bed"));
    s = ok(placeFirstFree(s, "water_bowl"));
    s = ok(placeFirstFree(s, { room: "calm" }));
    const f = fac(s);
    expect(connectedRooms(f).size).toBe(3);
    expect(f.items.find((i) => i.kind === "front_counter")!.room).toBe(f.rooms.find((r) => r.type === "lobby")!.uid);
    expect(f.items.filter((i) => i.kind === "dog_bed").every((i) => i.room === f.rooms.find((r) => r.type === "playroom")!.uid)).toBe(true);
    // a water bowl is fun for the pups, so it goes where they play — not the lobby (the hub-build symptom)
    expect(f.items.find((i) => i.kind === "water_bowl")!.room).toBe(f.rooms.find((r) => r.type === "playroom")!.uid);
    expect(canOpen(f)).toEqual({ ok: true, missing: [] });
    expect(s.coins).toBeGreaterThan(0);
  });
  it("an item goes first to a room that needs it to work", () => {
    let s = ok(placeFirstFree(newTycoon(0), { room: "lobby" }));
    s = ok(placeFirstFree(s, { room: "playroom", group: "small-gentle" }));
    s = ok(placeFirstFree(s, { room: "playroom", group: "large-active" }));
    s = ok(placeFirstFree(s, "dog_bed"));
    s = ok(placeFirstFree(s, "dog_bed"));
    const [a, b] = fac(s).rooms.filter((r) => r.type === "playroom");
    const beds = fac(s).items.filter((i) => i.kind === "dog_bed");
    expect(beds.map((i) => i.room)).toEqual([a!.uid, b!.uid]);
  });
  it("explains what's missing", () => {
    const s = ok(placeFirstFree(newTycoon(0), { room: "lobby" }));
    expect(placeFirstFree(s, { room: "lobby" })).toEqual({ ok: false, error: "Only one Lobby per daycare." });
    expect(placeFirstFree(s, { room: "playroom" })).toEqual({ ok: false, error: "Pick a group for this playroom." });
    expect(placeFirstFree({ ...s, xp: 100 }, "bath_tub")).toEqual({ ok: false, error: "Build a Bath Room first." });
    expect(placeFirstFree({ ...s, coins: 50 }, { room: "calm" })).toMatchObject({ ok: false, error: expect.stringMatching(/^Need \d+ more coins\.$/) });
  });
  it("outdoor items go on the first free grounds", () => {
    const s = ok(placeFirstFree(newTycoon(0), "play_yard"));
    expect(fac(s).items.at(-1)).toMatchObject({ kind: "play_yard", room: null, c: 10, r: 16 });
  });
});
