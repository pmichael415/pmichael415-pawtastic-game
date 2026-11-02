import { describe, expect, it } from "vitest";
import { settingsSwitches } from "./GameHeader";

describe("shared settings", () => {
  it("today's games don't show the new Daycare's sound switches", () => {
    expect(settingsSwitches(false).map(([k]) => k)).not.toContain("sound");
    expect(settingsSwitches(false).map(([k]) => k)).not.toContain("music");
  });
  it("the new Daycare does", () => {
    expect(settingsSwitches(true).map(([k]) => k)).toEqual(expect.arrayContaining(["sound", "music"]));
  });
});
