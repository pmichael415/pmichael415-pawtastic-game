import { describe, expect, it } from "vitest";
import { recordAccept, recordDecline, shouldOffer, type PromptState } from "./prompt";

const DAY = 86_400_000;
const fresh: PromptState = { declines: 0, lastDeclineAt: null, accepted: false };

describe("when the 'Notify me' card may appear", () => {
  it("is offered to a new player", () => {
    expect(shouldOffer(fresh, 0)).toBe(true);
  });
  it("is never offered again once accepted", () => {
    expect(shouldOffer(recordAccept(fresh), 0)).toBe(false);
  });
  it("after one 'No thanks' it waits 14 days, then may come back once", () => {
    const once = recordDecline(fresh, 1_000);
    expect(shouldOffer(once, 1_000 + 13 * DAY)).toBe(false);
    expect(shouldOffer(once, 1_000 + 14 * DAY)).toBe(true);
  });
  it("after two 'No thanks' it only lives in Settings", () => {
    const twice = recordDecline(recordDecline(fresh, 0), 14 * DAY);
    expect(shouldOffer(twice, 400 * DAY)).toBe(false);
  });
});
