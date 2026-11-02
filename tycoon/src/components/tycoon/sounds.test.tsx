// The Daycare's sounds: a doorbell at check-in, a yip when a pup arrives, a boing at playtime, coins at checkout,
// a light tap when you pick something, a soft "bonk" when something can't be done — and its own music.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }),
}));
let emit: (p: TPick | null) => void = () => {};
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, debug: () => null }));
      emit = props.onPick;
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { KEY, tycoonStore } from "@/tycoon/store";
import { fac, newTycoon } from "@/tycoon/state";
import { setSettings } from "@/lib/settings";
import { audio, audioLog } from "@/lib/audio/engine";
import { FakeAudioContext } from "@/lib/audio/fakeAudio";

const now = () => tycoonStore.getState()!;
const dogId = (name: string) => fac(now()).dogs.find((d) => d.name === name)!.id;
const inSheet = (name: string | RegExp) => within(screen.getByTestId("panel-sheet")).getByRole("button", { name });
const coach = () => screen.getByRole("region", { name: "Guide" });
const played = (n: string) => audioLog.includes(n);
/** Each step waits past the 50 ms same-sound guard. */
const later = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  audio._reset();
  audioLog.length = 0;
  setSettings({ sound: true, music: true, reducedMotion: true });
});
afterEach(() => {
  audio._reset();
  vi.unstubAllGlobals();
});

describe("the Daycare's sounds", () => {
  it("the care cycle sounds: arrival yip, select tap, check-in doorbell, playtime boing, coins", async () => {
    localStorage.setItem(KEY, JSON.stringify(newTycoon(Date.now())));
    render(<TycoonPlay />);
    fireEvent.click(screen.getByRole("button", { name: /Quick start/ }));
    expect(played("sfx:arrive")).toBe(true);
    await later();
    act(() => emit({ kind: "dog", id: dogId("Biscuit") }));
    expect(played("sfx:select")).toBe(true);
    fireEvent.click(inSheet(/Check in/));
    expect(played("sfx:checkin")).toBe(true);
    fireEvent.click(inSheet(/^To Small & Gentle/));
    fireEvent.click(inSheet(/^Playtime/));
    expect(played("sfx:playtime")).toBe(true);
    fireEvent.click(inSheet(/^Check out/));
    expect(played("sfx:coins")).toBe(true);
  });
  it("something that can't be done gets a soft bonk", async () => {
    localStorage.setItem(KEY, JSON.stringify(newTycoon(Date.now())));
    render(<TycoonPlay />);
    fireEvent.click(screen.getByRole("button", { name: /Quick start/ }));
    act(() => emit({ kind: "dog", id: dogId("Biscuit") }));
    fireEvent.click(inSheet(/Check in/));
    fireEvent.click(inSheet(/^To Small & Gentle/));
    fireEvent.click(inSheet(/^Playtime/));
    fireEvent.click(inSheet(/^Check out/));
    act(() => tycoonStore.set((s) => ({ ...s, coins: 100 })));
    fireEvent.click(within(coach()).getByRole("button", { name: /Play Yard · 200 coins/ }));
    expect(played("sfx:error")).toBe(true);
  });
  it("the Daycare's music starts after the first tap", () => {
    localStorage.setItem(KEY, JSON.stringify(newTycoon(Date.now())));
    render(<TycoonPlay />);
    expect(played("music:daycare")).toBe(false);
    fireEvent.pointerDown(document.body);
    expect(played("music:daycare")).toBe(true);
  });
  it("with Sound off nothing plays", () => {
    setSettings({ sound: false, music: false });
    localStorage.setItem(KEY, JSON.stringify(newTycoon(Date.now())));
    render(<TycoonPlay />);
    fireEvent.click(screen.getByRole("button", { name: /Quick start/ }));
    fireEvent.pointerDown(document.body);
    expect(audioLog).toEqual([]);
  });
});
