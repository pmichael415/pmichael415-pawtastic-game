// Sound effects synthesized with Web Audio: short oscillator and noise envelopes,
// no audio files. Match pops climb a pentatonic ladder as cascades chain.

import { pitchFor } from '../fx/callouts.js';

export const SFX_NAMES = ['swap', 'invalid', 'match', 'special-made', 'zoomie', 'bomb', 'blaster', 'crate', 'mud', 'untie', 'star', 'tap', 'lose', 'stamp', 'purchase'];

const C5 = 523.25;
const noiseBuffers = new WeakMap();

function envelope(ctx, dest, t0, dur, gain, attack = 0.005) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(dest);
  return g;
}

function tone(ctx, dest, { type = 'sine', freq, freqEnd, at = 0, dur, gain }) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  osc.connect(envelope(ctx, dest, t0, dur, gain));
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(ctx, dest, { filter = 'bandpass', f0, f1, at = 0, dur, gain }) {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(f0, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  src.connect(f);
  f.connect(envelope(ctx, dest, t0, dur, gain));
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const click = (ctx, dest) => tone(ctx, dest, { type: 'square', freq: 1200, dur: 0.008, gain: 0.2 });

const RECIPES = {
  swap: (ctx, d) => noise(ctx, d, { f0: 800, f1: 2400, dur: 0.12, gain: 0.12 }),
  invalid: (ctx, d) => { tone(ctx, d, { type: 'triangle', freq: 330, dur: 0.08, gain: 0.18 }); tone(ctx, d, { type: 'triangle', freq: 262, at: 0.09, dur: 0.1, gain: 0.18 }); },
  match: (ctx, d, step = 1) => {
    const freq = C5 * 2 ** (pitchFor(step) / 12);
    tone(ctx, d, { type: 'triangle', freq, dur: 0.16, gain: 0.25 });
    tone(ctx, d, { freq: freq * 2, dur: 0.12, gain: 0.08 });
  },
  'special-made': (ctx, d) => [1046.5, 1318.5, 1568].forEach((freq, i) => tone(ctx, d, { freq, at: i * 0.05, dur: 0.18, gain: 0.15 })),
  zoomie: (ctx, d) => noise(ctx, d, { filter: 'highpass', f0: 600, f1: 6000, dur: 0.3, gain: 0.2 }),
  bomb: (ctx, d) => { tone(ctx, d, { freq: 120, freqEnd: 45, dur: 0.35, gain: 0.5 }); noise(ctx, d, { filter: 'lowpass', f0: 400, dur: 0.2, gain: 0.2 }); },
  blaster: (ctx, d) => { for (let i = 0; i < 5; i++) tone(ctx, d, { freq: 600 + Math.random() * 800, at: i * 0.04, dur: 0.06, gain: 0.12 }); },
  crate: (ctx, d) => { noise(ctx, d, { f0: 1800, dur: 0.07, gain: 0.3 }); tone(ctx, d, { type: 'square', freq: 180, dur: 0.05, gain: 0.08 }); },
  mud: (ctx, d) => noise(ctx, d, { filter: 'lowpass', f0: 500, f1: 200, dur: 0.18, gain: 0.25 }),
  untie: (ctx, d) => { tone(ctx, d, { type: 'triangle', freq: 520, freqEnd: 880, dur: 0.12, gain: 0.18 }); noise(ctx, d, { f0: 2500, dur: 0.05, gain: 0.1 }); },
  star: (ctx, d, n = 1) => {
    const freq = [1046.5, 1318.5, 1568][Math.min(Math.max(n, 1), 3) - 1];
    tone(ctx, d, { freq, dur: 0.35, gain: 0.22 });
    tone(ctx, d, { type: 'triangle', freq: freq * 2, dur: 0.25, gain: 0.05 });
  },
  tap: click,
  purchase: click,
  lose: (ctx, d) => tone(ctx, d, { type: 'triangle', freq: 440, freqEnd: 220, dur: 0.5, gain: 0.2 }),
  stamp: (ctx, d) => { noise(ctx, d, { filter: 'lowpass', f0: 900, dur: 0.06, gain: 0.35 }); tone(ctx, d, { freq: 200, freqEnd: 120, dur: 0.1, gain: 0.25 }); },
};

export function playSfx(ctx, destination, name, arg) {
  RECIPES[name]?.(ctx, destination, arg);
}
