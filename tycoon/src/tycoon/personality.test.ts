// A little personality and anticipation (milestone "make PAWtastic feel like a daycare tycoon" §5): returning families
// remember their last visit, a pup's favourite changes a care decision (and says so, with the real numbers), the
// savings goal says why it's worth it, and a finished expansion says what it does right away.
import { describe, expect, it } from "vitest";
import { NAMES, personalityOf } from "@/game/engine";
import { BATH_HAPPY, PLAY_BASE, careTip } from "./effects";
import { EXPANSION_LEVEL, buyExpansion } from "./expansion";
import { savingFor } from "./objectives";
import { xpForLevel } from "./progress";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { ok, richState } from "./testkit";
import { rememberedVisit } from "./assess";
import { defaultVisit, ownerFor } from "./visit";
import type { Favorite } from "@/game/engine";
import type { TDog, TRegular, TycoonState } from "./types";

const pupWho = (fav: Favorite) => NAMES.map((name) => ({ name, breed: 1 })).find((d) => personalityOf(d).favorite === fav)!;
function pup(fav: Favorite, over: Partial<TDog> = {}): TDog {
  const { name, breed } = pupWho(fav);
  return { id: "p", name, breed, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false, ...over };
}
const regular = (d: TDog, over: Partial<TRegular>): TRegular => ({ name: d.name, breed: d.breed, size: d.size, temper: d.temper, visits: 2, friendship: 30, lastDay: 1, ...over });

describe("returning families remember their last visit", () => {
  const s = ok(quickStart(newTycoon(0)));
  const f = { ...fac(s), day: 3 };
  it("a first visit says nothing", () => {
    expect(rememberedVisit(f, pup("fetch"))).toBeNull();
  });
  it("a regular: which visit this is, how close they are, and how the last one went (and when)", () => {
    const d = pup("fetch", { visits: 3 });
    const g = { ...f, guestBook: [regular(d, { visits: 2, friendship: 30, lastDay: 2, sat: 88 })] };
    const r = rememberedVisit(g, d)!;
    expect(r.short).toBe("visit #3 · went home delighted yesterday");
    expect(r.line).toBe(`${ownerFor(d)} is back with ${d.name} for visit #3 (Pal) — last time ${d.name} went home delighted, yesterday.`);
  });
  it("a family who left disappointed says so — and that a good day wins them back", () => {
    const d = pup("fetch", { visits: 2 });
    const g = { ...f, guestBook: [regular(d, { lastDay: 1, sat: 45 })] };
    expect(rememberedVisit(g, d)!.line).toMatch(/went home a bit disappointed, 2 days ago\. A good day today wins them back\.$/);
  });
  it("an older guest-book entry without a score still greets them as regulars", () => {
    const d = pup("fetch", { visits: 2 });
    const g = { ...f, guestBook: [regular(d, {})] };
    expect(rememberedVisit(g, d)!.line).toBe(`${ownerFor(d)} is back with ${d.name} for visit #2 (Pal).`);
  });
});

describe("a pup's favourite changes a care decision, and the tip gives the real numbers", () => {
  const s = richState();
  const f = fac(s);
  it("the happiness numbers are the ones the rules use", () => {
    expect(PLAY_BASE).toEqual({ loves: 35, cuddles: 30, bathFan: 25 });
    expect(BATH_HAPPY).toEqual({ fan: 15, other: 5 });
  });
  it("a fetch fan: playtime is the treat", () => {
    expect(careTip(f, pup("fetch"))).toBe("Loves fetch 🎾 — playtime cheers them up +35 before toys.");
  });
  it("a cuddler: playtime a little less", () => {
    expect(careTip(f, pup("cuddles"))).toBe("Loves cuddles 🤗 — playtime cheers them up +30 before toys.");
  });
  it("a bath-time fan with a bath room: the bath is the treat, playtime less so", () => {
    expect(careTip(f, pup("splash"))).toBe("Loves bath time 🫧 — a bath cheers them up +15 (other pups +5); playtime only +25 before toys.");
  });
  it("a bath-time fan with no bath room: their family asked for one", () => {
    const bare = fac(ok(quickStart(newTycoon(0))));
    expect(careTip(bare, pup("splash"))).toBe("Loves bath time 🫧 — their family asked for a bath, but you have no bath room yet; playtime only +25 before toys.");
  });
});

describe("the savings goal says why it's worth it", () => {
  it("the playroom wing families asked for: its estimate from today's demand", () => {
    const base = { ...ok(quickStart(newTycoon(0))), coins: 100, xp: xpForLevel(EXPANSION_LEVEL) + 1 };
    const f = fac(base);
    const s = withFac(base, { ...f, asked: { day: f.day, groups: { "large-active": 3 } } });
    const save = savingFor(s)!;
    expect(save.title).toMatch(/Playroom wing for Large & Active/);
    expect(save.purpose).toBe("3 Large & Active families asked today — you have no room for them yet.");
  });
});

describe("a finished expansion says what it does, right away", () => {
  it("the wing: its new spots, and the waiting family who can now stay", () => {
    const base: TycoonState = { ...ok(quickStart(newTycoon(0))), coins: 5000, xp: xpForLevel(EXPANSION_LEVEL) };
    const f = fac(base);
    const rex: TDog = { id: "w", name: "Rex", breed: 0, size: "large", temper: "active", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false };
    const s = withFac(base, { ...f, open: true, clockMin: 600, dogs: [{ ...rex, visit: defaultVisit(f, rex) }], asked: { day: f.day, groups: { "large-active": 2 } } });
    const r = buyExpansion(s, "playroom");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.msg).toMatch(/\+3 spots for Large & Active pups/);
    expect(r.msg).toMatch(/Rex can stay — check them in\./);
  });
});
