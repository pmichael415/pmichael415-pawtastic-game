// Music as step patterns: 16 steps a bar, each event a note (or chord) with a length in steps. Pure — the engine
// turns events into sound, a lookahead at a time, so timing stays tight even when the page is busy.

export type Voice = "lead" | "bass" | "chords" | "pad" | "kick" | "snare" | "hat";
/** How the lead sounds: a soft bell (calm) or a bright square (arcade). */
export type Tone = "bell" | "square";
export type NoteEv = { step: number; dur: number; notes: number[]; vel?: number };
export type Track = { voice: Voice; events: NoteEv[]; vol?: number; tone?: Tone };
export type Song = { bpm: number; length: number; tracks: Track[] };
export type Hit = { voice: Voice; notes: number[]; dur: number; vel: number; tone?: Tone; vol: number };

export const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
/** Seconds in one 16th-note step. */
export const stepSeconds = (bpm: number) => 60 / bpm / 4;

const index = new WeakMap<Song, Hit[][]>();
/** Everything that starts on this step (the loop repeats every `length` steps). */
export function eventsAt(song: Song, step: number): Hit[] {
  let byStep = index.get(song);
  if (!byStep) {
    byStep = Array.from({ length: song.length }, () => [] as Hit[]);
    for (const t of song.tracks)
      for (const e of t.events)
        byStep[e.step]!.push({ voice: t.voice, notes: e.notes, dur: e.dur, vel: e.vel ?? 1, vol: t.vol ?? 1, ...(t.tone ? { tone: t.tone } : {}) });
    index.set(song, byStep);
  }
  return byStep[((step % song.length) + song.length) % song.length]!;
}

// ---------- helpers for writing songs ----------
type Cell = [step: number, dur: number, note: number | number[]];
/** Events in bar `b` (0-based) from [step, dur, note] cells. */
export const bar = (b: number, cells: Cell[], vel?: number): NoteEv[] =>
  cells.map(([s, d, n]) => ({ step: b * 16 + s, dur: d, notes: Array.isArray(n) ? n : [n], ...(vel !== undefined ? { vel } : {}) }));
/** A drum hit on these steps in every bar. */
export const everyBar = (bars: number, steps: number[], vel = 1): NoteEv[] =>
  Array.from({ length: bars }, (_, b) => steps.map((s) => ({ step: b * 16 + s, dur: 1, notes: [], vel }))).flat();
