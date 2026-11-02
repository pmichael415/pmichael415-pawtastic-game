// One tap mutes a game's sound and music; one tap brings both back.
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SoundToggle } from "./SoundToggle";
import { getSettings, setSettings } from "@/lib/settings";
import { settingsSwitches } from "./GameHeader";

describe("the mute button", () => {
  beforeEach(() => setSettings({ sound: true, music: true }));
  it("mutes sound and music together, then turns both back on", () => {
    render(<SoundToggle />);
    const b = screen.getByRole("button", { name: "Mute sound" });
    expect(b.className).toMatch(/h-11/);
    fireEvent.click(b);
    expect(getSettings().sound).toBe(false);
    expect(getSettings().music).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Turn sound on" }));
    expect(getSettings().sound).toBe(true);
    expect(getSettings().music).toBe(true);
  });
  it("with only music on, it still counts as 'on' and mutes everything", () => {
    setSettings({ sound: false, music: true });
    render(<SoundToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Mute sound" }));
    expect(getSettings().music).toBe(false);
  });
  it("games with sound show the Sound effects and Music switches in Settings", () => {
    expect(settingsSwitches(true).map(([k]) => k)).toEqual(expect.arrayContaining(["sound", "music"]));
  });
});
