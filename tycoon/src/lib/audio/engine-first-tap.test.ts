// A fresh page: the first tap anywhere unlocks audio, even if no sound has played yet (the tap that starts a run or
// picks Quick start must also start the music).
import { expect, it, vi } from "vitest";
import { FakeAudioContext } from "./fakeAudio";

it("the very first tap on the page starts music that was asked for", async () => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const { setSettings } = await import("@/lib/settings");
  setSettings({ sound: true, music: true });
  const { audio, audioLog } = await import("./engine");
  audio.music("daycare");
  document.dispatchEvent(new Event("pointerdown"));
  expect(audioLog).toContain("music:daycare");
  audio._reset();
  vi.unstubAllGlobals();
});
