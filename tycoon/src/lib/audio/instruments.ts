// Synthesized instruments (Web Audio, no files). Each schedules one note or hit at an exact time on any audio
// context — the live one, or an offline one for rendering previews.
import { midiToFreq, type Hit } from "./sequencer";

type Ctx = BaseAudioContext;

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();
/** One second of white noise per context (drums, splashes, swooshes). */
export function noise(c: Ctx): AudioBuffer {
  let b = noiseBuffers.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(c, b);
  }
  return b;
}

/** A gain envelope: quick attack to `peak`, hold, then a smooth release to silence by `end`. */
export function env(c: Ctx, out: AudioNode, at: number, peak: number, hold: number, release: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), at + 0.008);
  g.gain.setValueAtTime(Math.max(0.0002, peak), at + Math.max(0.01, hold));
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.01, hold) + release);
  g.connect(out);
  return g;
}

export function osc(c: Ctx, out: AudioNode, type: OscillatorType, freq: number, at: number, end: number, to?: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, end);
  o.connect(out);
  o.start(at);
  o.stop(end + 0.05);
  return o;
}

export function noiseHit(c: Ctx, out: AudioNode, at: number, dur: number, filter: BiquadFilterType, freq: number, toFreq?: number) {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, at);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, at + dur);
  s.connect(f);
  f.connect(out);
  s.start(at);
  s.stop(at + dur + 0.05);
}

/**
 * Plays one sequencer hit. `step` is one 16th note in seconds. `lite` (battery saver) drops the quietest layers —
 * the pad, the bell's overtones, the bass's sub-octave, soft ghost hats — for about half the audio work.
 */
export function playHit(c: Ctx, out: AudioNode, h: Hit, at: number, step: number, lite = false) {
  const len = h.dur * step;
  const v = h.vel * h.vol;
  if (lite && (h.voice === "pad" || (h.voice === "hat" && h.vel < 0.3) || (h.voice === "chords" && h.vol < 0.4))) return;
  switch (h.voice) {
    case "lead":
      for (const n of h.notes) {
        const f = midiToFreq(n);
        if (h.tone === "square") {
          const lp = c.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.setValueAtTime(3200, at);
          lp.frequency.exponentialRampToValueAtTime(1400, at + Math.max(0.05, len));
          lp.connect(env(c, out, at, 0.09 * v, len * 0.6, len * 0.5 + 0.05));
          osc(c, lp, "square", f, at, at + len + 0.1);
          osc(c, lp, "triangle", f * 2, at, at + len + 0.1);
        } else {
          // bell: a sine with a soft overtone that fades first
          osc(c, env(c, out, at, 0.16 * v, 0.02, len + 0.35), "sine", f, at, at + len + 0.4);
          if (lite) continue;
          osc(c, env(c, out, at, 0.05 * v, 0.01, 0.25), "sine", f * 3, at, at + 0.3);
          osc(c, env(c, out, at, 0.04 * v, 0.02, len * 0.8 + 0.1), "triangle", f * 2, at, at + len + 0.2);
        }
      }
      break;
    case "bass":
      for (const n of h.notes) {
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(700, at);
        lp.connect(env(c, out, at, 0.22 * v, len * 0.7, len * 0.4 + 0.04));
        osc(c, lp, "triangle", midiToFreq(n), at, at + len + 0.1);
        if (!lite) osc(c, lp, "sine", midiToFreq(n) / 2, at, at + len + 0.1);
      }
      break;
    case "chords":
      for (const n of h.notes) osc(c, env(c, out, at, 0.05 * v, 0.02, len * 0.8 + 0.08), "triangle", midiToFreq(n), at, at + len + 0.15);
      break;
    case "pad":
      for (const n of h.notes) {
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(900, at);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.03 * v, at + len * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, at + len);
        g.connect(out);
        lp.connect(g);
        osc(c, lp, "sawtooth", midiToFreq(n), at, at + len);
        osc(c, lp, "sawtooth", midiToFreq(n) * 1.004, at, at + len);
      }
      break;
    case "kick":
      osc(c, env(c, out, at, 0.5 * v, 0.01, 0.16), "sine", 150, at, at + 0.14, 45);
      break;
    case "snare":
      noiseHit(c, env(c, out, at, 0.18 * v, 0.005, 0.12), at, 0.14, "highpass", 1400);
      osc(c, env(c, out, at, 0.1 * v, 0.005, 0.06), "triangle", 190, at, at + 0.07);
      break;
    case "hat":
      noiseHit(c, env(c, out, at, 0.07 * v, 0.003, 0.035), at, 0.05, "highpass", 7000);
      break;
  }
}
