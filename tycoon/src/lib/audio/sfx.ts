// Sound effects for the Daycare and Recess Rush, synthesized (no files). Short, soft and friendly: nothing harsh,
// even for a refusal.
import { env, noiseHit, osc } from "./instruments";

type Ctx = BaseAudioContext;
type Recipe = (c: Ctx, out: AudioNode, t: number) => void;

const bellNote = (c: Ctx, out: AudioNode, f: number, t: number, len: number, vol: number) => {
  osc(c, env(c, out, t, vol, 0.01, len), "sine", f, t, t + len + 0.05);
  osc(c, env(c, out, t, vol * 0.3, 0.01, len * 0.4), "sine", f * 2.76, t, t + len * 0.5);
};

const RECIPES = {
  // ---------- the Daycare ----------
  /** A light tap when you pick a pup, room or item. */
  select: (c, out, t) => osc(c, env(c, out, t, 0.08, 0.01, 0.05), "sine", 880, t, t + 0.06, 1180),
  /** Something built. */
  thunk: (c, out, t) => {
    osc(c, env(c, out, t, 0.2, 0.01, 0.14), "triangle", 150, t, t + 0.15, 70);
    noiseHit(c, env(c, out, t, 0.06, 0.005, 0.06), t, 0.08, "lowpass", 900);
  },
  /** Something sold or removed. */
  pop: (c, out, t) => osc(c, env(c, out, t, 0.14, 0.01, 0.08), "sine", 640, t, t + 0.1, 220),
  /** An upgrade. */
  sparkle: (c, out, t) => [1047, 1319, 1568, 2093].forEach((f, i) => bellNote(c, out, f, t + i * 0.06, 0.25, 0.06)),
  /** Payment at checkout: a quick bright triad. */
  coins: (c, out, t) => [1047, 1319, 1568].forEach((f, i) => bellNote(c, out, f, t + i * 0.045, 0.22, 0.08)),
  /** Level up. */
  fanfare: (c, out, t) => [523, 659, 784, 1047].forEach((f, i) => osc(c, env(c, out, t + i * 0.13, 0.11, i === 3 ? 0.3 : 0.08, i === 3 ? 0.5 : 0.1), "triangle", f, t + i * 0.13, t + i * 0.13 + 0.9)),
  /** The day's report. */
  drumroll: (c, out, t) => {
    for (let i = 0; i < 14; i++) noiseHit(c, env(c, out, t + i * 0.045, 0.05 + i * 0.004, 0.005, 0.04), t + i * 0.045, 0.05, "bandpass", 1800);
    osc(c, env(c, out, t + 0.68, 0.3, 0.01, 0.3), "sine", 120, t + 0.68, t + 0.95, 50);
    bellNote(c, out, 784, t + 0.68, 0.5, 0.08);
  },
  /** Check-in: a doorbell, ding-dong. */
  checkin: (c, out, t) => {
    bellNote(c, out, 1319, t, 0.45, 0.1);
    bellNote(c, out, 1047, t + 0.22, 0.6, 0.1);
  },
  /** A pup arrives at the lobby: two little yips. */
  arrive: (c, out, t) => {
    for (const d of [0, 0.16]) {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1500, t + d);
      bp.connect(env(c, out, t + d, 0.12, 0.02, 0.07));
      const o = osc(c, bp, "sawtooth", 620, t + d, t + d + 0.1);
      o.frequency.linearRampToValueAtTime(980, t + d + 0.03);
      o.frequency.exponentialRampToValueAtTime(520, t + d + 0.1);
    }
  },
  /** Playtime: a springy boing and a squeak. */
  playtime: (c, out, t) => {
    const o = osc(c, env(c, out, t, 0.14, 0.12, 0.15), "sine", 260, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.28);
    osc(c, env(c, out, t + 0.22, 0.05, 0.02, 0.05), "sine", 1600, t + 0.22, t + 0.3, 2100);
  },
  /** A bath: bubbles. */
  bath: (c, out, t) => [520, 760, 610, 980, 700, 1150].forEach((f, i) => osc(c, env(c, out, t + i * 0.055, 0.06, 0.005, 0.05), "sine", f, t + i * 0.055, t + i * 0.055 + 0.06, f * 1.6)),
  /** Calm-down room: a soft descending chime. */
  calm: (c, out, t) => [784, 659, 523].forEach((f, i) => bellNote(c, out, f, t + i * 0.16, 0.6, 0.06)),
  /** A refusal (not enough coins, not allowed): a soft "bonk", never harsh. */
  error: (c, out, t) => {
    osc(c, env(c, out, t, 0.1, 0.03, 0.12), "triangle", 233, t, t + 0.16, 196);
    osc(c, env(c, out, t + 0.09, 0.08, 0.03, 0.12), "triangle", 175, t + 0.09, t + 0.26, 156);
  },

  // ---------- Recess Rush ----------
  /** Changing lanes. */
  swoosh: (c, out, t) => noiseHit(c, env(c, out, t, 0.08, 0.02, 0.08), t, 0.12, "bandpass", 500, 3000),
  /** A treat collected. */
  treat: (c, out, t) => {
    osc(c, env(c, out, t, 0.08, 0.02, 0.06), "square", 1047, t, t + 0.08, 1568);
    bellNote(c, out, 2093, t + 0.05, 0.12, 0.05);
  },
  /** A shield ball picked up: a rising arpeggio. */
  shield: (c, out, t) => [523, 659, 784, 1047, 1319].forEach((f, i) => osc(c, env(c, out, t + i * 0.04, 0.06, 0.02, 0.06), "square", f, t + i * 0.04, t + i * 0.04 + 0.09)),
  /** The shield blocks a puddle: a bright ting. */
  block: (c, out, t) => {
    bellNote(c, out, 2400, t, 0.3, 0.07);
    bellNote(c, out, 3600, t + 0.01, 0.2, 0.04);
    noiseHit(c, env(c, out, t, 0.05, 0.003, 0.03), t, 0.04, "highpass", 4000);
  },
  /** Into a puddle: a splash. */
  splash: (c, out, t) => {
    noiseHit(c, env(c, out, t, 0.18, 0.04, 0.3), t, 0.35, "lowpass", 2200, 350);
    osc(c, env(c, out, t, 0.12, 0.02, 0.2), "sine", 320, t, t + 0.25, 110);
  },
  /** Off you go. */
  go: (c, out, t) => osc(c, env(c, out, t, 0.1, 0.1, 0.08), "square", 1760, t, t + 0.2),
  /** Time's up: a whistle, twice. */
  whistle: (c, out, t) => {
    for (const d of [0, 0.32]) {
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.setValueAtTime(28, t + d);
      depth.gain.setValueAtTime(70, t + d);
      lfo.connect(depth);
      const o = osc(c, env(c, out, t + d, 0.07, 0.18, 0.06), "sine", 2100, t + d, t + d + 0.26);
      depth.connect(o.frequency);
      lfo.start(t + d);
      lfo.stop(t + d + 0.3);
    }
  },
} satisfies Record<string, Recipe>;

export type SfxName = keyof typeof RECIPES;
export const SFX: Record<SfxName, Recipe> = RECIPES;
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];
