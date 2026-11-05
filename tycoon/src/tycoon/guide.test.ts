import { describe, expect, it } from "vitest";
import { GUIDE_REWARD, START_COINS } from "./catalog";
import { GUIDE_STEPS, claimGuide, guideProgress, guideVisible, markPainted, skipGuide } from "./guide";
import { assignRoom, checkIn, checkout, createArrival, setOpen } from "./run";
import { fac, newTycoon, withFac } from "./state";
import { guidedBuild, ok } from "./testkit";
import type { TycoonState } from "./types";

/** Opens at 08:00, takes one pup in and checks it out. */
function firstCheckout(s: TycoonState): TycoonState {
  let t = withFac(ok(setOpen(s, true)), { ...fac(s), open: true, clockMin: 480 });
  t = ok(createArrival(t, () => 0.5));
  const pup = fac(t).dogs[0]!;
  t = ok(checkIn(t, pup.id));
  const play = fac(t).rooms.find((r) => r.type === "playroom")!;
  t = ok(assignRoom(t, pup.id, play.uid, true));
  return ok(checkout(t, pup.id, false));
}

describe("guided start", () => {
  it("has the five steps", () => {
    expect(GUIDE_STEPS.map((x) => x.title)).toEqual(["Build a Lobby", "Build a Playroom", "Build a Calm-Down Room", "Paint the Lobby", "Serve your first family"]);
  });
  it("a new game starts at step 1", () => {
    expect(guideProgress(newTycoon(0))).toEqual({ step: 1, checks: [false, false, false, false, false] });
  });
  it("the guided build finishes steps 1–3; painting and the first checkout finish it; the reward is paid once", () => {
    const g = guidedBuild(newTycoon(0));
    expect(guideProgress(g)).toEqual({ step: 4, checks: [true, true, true, false, false] });
    const p = markPainted(g);
    expect(guideProgress(p).step).toBe(5);
    expect(claimGuide(p)).toEqual({ ok: false, error: "Finish the checklist first." });
    const done = firstCheckout(p);
    expect(guideProgress(done)).toEqual({ step: 6, checks: [true, true, true, true, true] });
    const c = ok(claimGuide(done));
    expect(c.coins).toBe(done.coins + GUIDE_REWARD);
    expect(guideVisible(c)).toBe(false);
    expect(claimGuide(c)).toEqual({ ok: false, error: "Already claimed." });
  });
  it("skipping hides the guide without paying", () => {
    const s = skipGuide(newTycoon(0));
    expect(guideVisible(newTycoon(0))).toBe(true);
    expect(guideVisible(s)).toBe(false);
    expect(s.coins).toBe(START_COINS);
    expect(claimGuide(s)).toEqual({ ok: false, error: "The guide was skipped." });
  });
});
