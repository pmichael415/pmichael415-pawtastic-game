// "Start over" in today's Daycare (review finding): the daycare starts again, but what was bought stays —
// Recess Rush power-ups, and the delivery list (so a purchase collected here can't be lost or added twice).
import { beforeEach, describe, expect, it } from "vitest";
import { resetSave, updateSave } from "./store";

const KEY = "pawtastic-tycoon-save-v1";
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

describe("starting over keeps purchases", () => {
  beforeEach(() => localStorage.clear());
  it("a new daycare, with the same power-ups and delivery list", () => {
    updateSave((s) => ({
      ...s,
      coins: 4321,
      recessPowerups: { shield: 9, life: 4 },
      deliveries: { applied: ["00000000-0000-4000-8000-0000000000a1"], done: ["00000000-0000-4000-8000-0000000000a2"] },
    }));
    expect(stored().coins).toBe(4321);
    resetSave();
    const s = stored();
    expect(s.coins).not.toBe(4321); // the daycare itself starts over
    expect(s.recessPowerups).toEqual({ shield: 9, life: 4 });
    expect(s.deliveries).toEqual({ applied: ["00000000-0000-4000-8000-0000000000a1"], done: ["00000000-0000-4000-8000-0000000000a2"] });
  });
});
