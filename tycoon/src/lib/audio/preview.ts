// Renders the music and effects offline (OfflineAudioContext) with the same mix as the games, for listening
// previews (qa/audio-preview.cjs). Not used by the games themselves.
import { MUSIC_VOL, SFX_VOL } from "./engine";
import { playHit } from "./instruments";
import { eventsAt, stepSeconds, type Song } from "./sequencer";
import { SFX, type SfxName } from "./sfx";
import { JINGLES, SONGS, type JingleId, type SongId } from "./songs";

const RATE = 44100;
function chain(c: OfflineAudioContext, vol: number): AudioNode {
  const comp = c.createDynamicsCompressor();
  comp.connect(c.destination);
  const g = c.createGain();
  g.gain.value = vol;
  g.connect(comp);
  return g;
}
function schedule(c: BaseAudioContext, out: AudioNode, song: Song, from: number, seconds: number, loop: boolean) {
  const dt = stepSeconds(song.bpm);
  const steps = loop ? Math.floor(seconds / dt) : song.length;
  for (let s = 0; s < steps; s++) for (const h of eventsAt(song, s)) playHit(c, out, h, from + s * dt, dt);
}

export async function renderSong(id: SongId, seconds: number): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, Math.ceil(RATE * (seconds + 1)), RATE);
  schedule(c, chain(c, MUSIC_VOL), SONGS[id], 0.05, seconds, true);
  return c.startRendering();
}
export async function renderJingles(ids: JingleId[], gap = 2.2): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, Math.ceil(RATE * (ids.length * gap + 1)), RATE);
  const out = chain(c, SFX_VOL);
  ids.forEach((id, i) => schedule(c, out, JINGLES[id], 0.05 + i * gap, 0, false));
  return c.startRendering();
}
export async function renderSfx(names: SfxName[], gap = 0.9): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, Math.ceil(RATE * (names.length * gap + 1)), RATE);
  const out = chain(c, SFX_VOL);
  names.forEach((n, i) => SFX[n](c, out, 0.05 + i * gap));
  return c.startRendering();
}

/** 16-bit PCM WAV bytes, plus peak and RMS level (to check nothing is silent or clipping). */
export function wav(b: AudioBuffer): { bytes: Uint8Array; peak: number; rms: number } {
  const ch = b.numberOfChannels;
  const n = b.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((x, i) => data.setUint8(o + i, x.charCodeAt(0)));
  str(0, "RIFF");
  data.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, b.sampleRate, true);
  data.setUint32(28, b.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => b.getChannelData(i));
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < ch; k++) {
      const v = Math.max(-1, Math.min(1, chans[k]![i]!));
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
      data.setInt16(44 + (i * ch + k) * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
  return { bytes: new Uint8Array(data.buffer), peak, rms: Math.sqrt(sum / (n * ch)) };
}
