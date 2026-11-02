// The shared audio engine: silent unless the player wants sound, music only after a tap, paused in a hidden tab.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext } from "./fakeAudio";
import { setSettings } from "@/lib/settings";
import { SFX_NAMES, audio, audioLog } from "./engine";

const ctxNow = () => (audio._ctx() as unknown as FakeAudioContext | null);
function advance(sec: number) {
  const c = ctxNow();
  if (c) c.currentTime += sec;
  vi.advanceTimersByTime(sec * 1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  FakeAudioContext.reset();
  audio._reset();
  audioLog.length = 0;
  setSettings({ sound: true, music: true });
});
afterEach(() => {
  audio._reset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sound effects", () => {
  it("off in Settings: no audio context is made and nothing plays", () => {
    setSettings({ sound: false });
    audio.sfx("treat");
    expect(FakeAudioContext.made).toBe(0);
    expect(audioLog).toEqual([]);
  });
  it("on: a sound effect starts notes and is logged", () => {
    audio.unlock();
    audio.sfx("treat");
    expect(FakeAudioContext.started.length).toBeGreaterThan(0);
    expect(audioLog).toContain("sfx:treat");
  });
  it("the same effect twice within 50 ms plays once (no pile-ups)", () => {
    audio.unlock();
    audio.sfx("coins");
    audio.sfx("coins");
    expect(audioLog.filter((x) => x === "sfx:coins")).toHaveLength(1);
    advance(0.1);
    audio.sfx("coins");
    expect(audioLog.filter((x) => x === "sfx:coins")).toHaveLength(2);
  });
  it("every effect plays without throwing", () => {
    audio.unlock();
    for (const n of SFX_NAMES) {
      advance(0.1);
      expect(() => audio.sfx(n), n).not.toThrow();
    }
    expect(audioLog.filter((x) => x.startsWith("sfx:"))).toHaveLength(SFX_NAMES.length);
  });
  it("no AudioContext in the browser is fine", () => {
    vi.stubGlobal("AudioContext", undefined);
    audio._reset();
    expect(() => audio.sfx("pop")).not.toThrow();
  });
});

describe("music", () => {

  it("waits for the first tap, then schedules notes ahead of time", () => {
    audio.music("recess");
    advance(0.5);
    expect(FakeAudioContext.started.length).toBe(0);
    audio.unlock();
    advance(0.5);
    expect(FakeAudioContext.started.length).toBeGreaterThan(4);
    expect(audioLog).toContain("music:recess");
  });
  it("switching Music off in Settings stops it; on again resumes the same song", () => {
    audio.unlock();
    audio.music("daycare");
    advance(0.5);
    setSettings({ music: false });
    const n = FakeAudioContext.started.length;
    advance(1);
    expect(FakeAudioContext.started.length).toBe(n);
    setSettings({ music: true });
    advance(1);
    expect(FakeAudioContext.started.length).toBeGreaterThan(n);
  });
  it("a hidden tab pauses the music and coming back resumes it", () => {
    audio.unlock();
    audio.music("daycare");
    advance(0.5);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    const n = FakeAudioContext.started.length;
    advance(1);
    expect(FakeAudioContext.started.length).toBe(n);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    advance(1);
    expect(FakeAudioContext.started.length).toBeGreaterThan(n);
  });
  it("stop() ends it and a jingle plays once, on top", () => {
    audio.unlock();
    audio.music("recess");
    advance(0.3);
    audio.stopMusic();
    const n = FakeAudioContext.started.length;
    advance(1);
    expect(FakeAudioContext.started.length).toBe(n);
    audio.jingle("finish");
    expect(FakeAudioContext.started.length).toBeGreaterThan(n);
    expect(audioLog).toContain("jingle:finish");
  });
  it("battery saver plays a lighter arrangement: at most two-thirds of the notes' voices", () => {
    const count = (lowPower: boolean) => {
      audio._reset();
      FakeAudioContext.reset();
      setSettings({ lowPower });
      audio.unlock();
      audio.music("daycare");
      advance(5);
      return FakeAudioContext.started.length;
    };
    const full = count(false);
    const lite = count(true);
    expect(lite).toBeGreaterThan(0);
    expect(lite).toBeLessThanOrEqual(Math.round(full * 0.67));
    setSettings({ lowPower: false });
  });
  it("changing song (rush hour) keeps playing", () => {
    audio.unlock();
    audio.music("daycare");
    advance(0.5);
    audio.music("daycare-rush");
    advance(3);
    expect(audioLog).toContain("music:daycare-rush");
  });
});
