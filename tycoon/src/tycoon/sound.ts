// The Daycare's sounds and music, played by the shared audio engine (src/lib/audio). Silent when the player turns
// them off in Settings, before the first tap, or when the browser has no audio.
import { audio, type SfxName } from "@/lib/audio/engine";

export type SoundName = SfxName;

export const sound = {
  play(name: SoundName) {
    audio.sfx(name);
  },
};

// ---------- music: "Daycare Day", faster in rush hour ----------
let on = false;
let intensity: 0 | 1 = 0;
const song = () => (intensity ? "daycare-rush" : "daycare");

export const music = {
  /** Asks for the Daycare's music; it starts with the player's first tap (browsers require one). */
  start() {
    on = true;
    audio.music(song());
  },
  stop() {
    on = false;
    audio.stopMusic();
  },
  /** 0 = normal play, 1 = rush hour (the same tune, faster, from the next bar). */
  setIntensity(n: 0 | 1) {
    intensity = n;
    if (on) audio.music(song());
  },
};

/** Test helper. */
export function _resetAudio() {
  audio._reset();
  on = false;
  intensity = 0;
}
