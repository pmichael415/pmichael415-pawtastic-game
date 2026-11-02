// An upgrade's benefit is visible (Stage A, spec §3.2 "benefit"): furniture helps the pups in its own room, outdoor
// play areas help every pup at playtime, and the playtime message names what helped most.
import { describe, expect, it } from "vitest";
import { placeFirstFree, placeThing, setClosed } from "./build";
import { playGain } from "./effects";
import { assignRoom, checkIn, playtime } from "./run";
import { fac, newTycoon } from "./state";
import { ok } from "./testkit";
import { startTour } from "./tour";
import type { TycoonState } from "./types";

function biscuitPlaying(): TycoonState {
  let s = startTour({ ...newTycoon(0), coins: 5000 }, "quick", 0);
  const id = fac(s).dogs[0]!.id;
  s = ok(checkIn(s, id));
  return ok(assignRoom(s, id, fac(s).rooms.find((r) => r.type === "playroom")!.uid));
}
const biscuit = (s: TycoonState) => fac(s).dogs.find((d) => d.name === "Biscuit")!;

describe("what an upgrade adds to playtime", () => {
  it("a Toy Bin in the playroom adds +6 (3 per Fun point in the pup's own room) and is named", () => {
    const before = biscuitPlaying();
    const withBin = ok(placeFirstFree(before, "toy_bin"));
    const a = playGain(fac(before), biscuit(before));
    const b = playGain(fac(withBin), biscuit(withBin));
    expect(b.base).toBe(a.base);
    expect(b.total - a.total).toBe(6);
    expect(b.topItem).toBe("Toy Bin");
    const played = playtime(withBin, biscuit(withBin).id);
    expect(played.ok && played.msg).toContain(`(+${b.total - b.base} from your Toy Bin)`);
  });
  it("a Play Yard outside adds its Fun to every pup's playtime and is named", () => {
    let s = biscuitPlaying();
    s = ok(setClosed(s, fac(s).items.find((i) => i.kind === "water_bowl")!.uid, true)); // nothing else helping
    const plain = playGain(fac(s), biscuit(s));
    expect(plain.total).toBe(plain.base);
    expect(plain.topItem).toBeNull();
    const yard = ok(placeThing(s, "play_yard", 12, 18, 0));
    const g = playGain(fac(yard), biscuit(yard));
    expect(g.total - g.base).toBe(4);
    expect(g.topItem).toBe("Play Yard");
  });
  it("with nothing helping, the playtime message says nothing about items", () => {
    let s = biscuitPlaying();
    s = ok(setClosed(s, fac(s).items.find((i) => i.kind === "water_bowl")!.uid, true));
    const r = playtime(s, biscuit(s).id);
    expect(r.ok && r.msg).not.toMatch(/from your/);
  });
  it("the happiness gained is exactly the breakdown's total (capped at 100)", () => {
    const s = ok(placeFirstFree(biscuitPlaying(), "toy_bin"));
    const g = playGain(fac(s), biscuit(s));
    const after = ok(playtime(s, biscuit(s).id));
    expect(biscuit(after).happiness).toBe(Math.min(100, biscuit(s).happiness + g.total));
  });
});

