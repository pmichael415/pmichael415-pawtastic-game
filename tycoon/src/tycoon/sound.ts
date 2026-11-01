// Sound effects and a little looping tune, synthesized with Web Audio (no files). Silent when the player turns them
// off in Settings, or when the browser has no AudioContext.
import { getSettings } from "@/lib/settings";

export type SoundName = "thunk" | "sparkle" | "coins" | "fanfare" | "drumroll" | "pop";
type Ctx = AudioContext;

let ctx: Ctx | null = null;
function audio(): Ctx | null {
  if (ctx) return ctx;
  const g = globalThis as unknown as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx };
  const C = g.AudioContext ?? g.webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    return null;
  }
  return ctx;
}

function tone(c: Ctx, freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.12, to?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

const SOUNDS: Record<SoundName, (c: Ctx, t: number) => void> = {
  thunk: (c, t) => tone(c, 140, t, 0.14, "square", 0.08, 70),
  pop: (c, t) => tone(c, 620, t, 0.09, "sine", 0.12, 220),
  sparkle: (c, t) => [1047, 1319, 1568, 2093].forEach((f, i) => tone(c, f, t + i * 0.06, 0.18, "triangle", 0.07)),
  coins: (c, t) => {
    tone(c, 988, t, 0.08, "square", 0.05);
    tone(c, 1319, t + 0.07, 0.22, "square", 0.05);
  },
  fanfare: (c, t) => [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.13, i === 3 ? 0.6 : 0.16, "triangle", 0.1)),
  drumroll: (c, t) => {
    for (let i = 0; i < 14; i++) tone(c, 95 + (i % 2) * 12, t + i * 0.045, 0.05, "triangle", 0.06);
    tone(c, 196, t + 0.68, 0.3, "triangle", 0.1);
  },
};

export const sound = {
  play(name: SoundName) {
    if (!getSettings().sound) return;
    const c = audio();
    if (!c) return;
    try {
      if (c.state === "suspended") void c.resume();
      SOUNDS[name](c, c.currentTime + 0.01);
    } catch {
      /* never break the game for sound */
    }
  },
};

// ---------- music: a gentle looping arpeggio; faster in rush hour ----------
const TUNE = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1047, 784, 659, 587, 494];
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let intensity: 0 | 1 = 0;

function beat() {
  if (!getSettings().music) return music.stop();
  const c = audio();
  if (!c || c.state !== "running") return;
  const f = TUNE[step % TUNE.length]!;
  tone(c, f, c.currentTime + 0.01, intensity ? 0.16 : 0.28, "triangle", 0.025);
  if (step % 4 === 0) tone(c, f / 2, c.currentTime + 0.01, 0.4, "sine", 0.02);
  step++;
}

export const music = {
  /** Starts the loop (call from a tap: browsers only allow audio after the player interacts). */
  start() {
    if (timer || !getSettings().music) return;
    const c = audio();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    timer = setInterval(beat, intensity ? 230 : 380);
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
  },
  /** 0 = normal play, 1 = rush hour (faster). */
  setIntensity(n: 0 | 1) {
    if (n === intensity) return;
    intensity = n;
    if (timer) {
      music.stop();
      music.start();
    }
  },
};

/** Test helper. */
export function _resetAudio() {
  music.stop();
  ctx = null;
  intensity = 0;
  step = 0;
}
