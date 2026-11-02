// Original PAWtastic tunes, written for these games (no borrowed melodies). Notes are MIDI numbers (60 = middle C).
//
// "Daycare Day" — F major, 96 BPM, 8 bars: F · Dm · B♭ · C · F · Dm · Gm · C, a bell melody over a bouncy bass.
//   Rush hour plays the same tune at 120 BPM with a fuller beat.
// "Recess Run" — E minor to G, 140 BPM, 8 bars: Em · C · G · D twice, a bright square lead over driving eighths.
// Jingles: "start" (off you go), "finish" (time's up) and "best" (a new best score).
import { bar, everyBar, type NoteEv, type Song, type Track } from "./sequencer";

// ---------- Daycare Day ----------
const DAY_ROOTS = [41, 38, 34, 36, 41, 38, 43, 36]; // F2 D2 B♭1 C2 F2 D2 G2 C2
const DAY_CHORDS = [
  [53, 57, 60], // F
  [50, 53, 57], // Dm
  [50, 53, 58], // B♭
  [52, 55, 60], // C
  [53, 57, 60], // F
  [50, 53, 57], // Dm
  [50, 55, 58], // Gm
  [52, 55, 58], // C7
];
const DAY_LEAD: NoteEv[] = [
  ...bar(0, [[0, 2, 72], [2, 2, 69], [4, 2, 65], [6, 2, 69], [8, 4, 72], [12, 2, 74], [14, 2, 72]]),
  ...bar(1, [[0, 4, 69], [4, 2, 65], [6, 2, 69], [8, 6, 74]]),
  ...bar(2, [[0, 2, 74], [2, 2, 72], [4, 2, 70], [6, 2, 74], [8, 4, 77], [12, 4, 74]]),
  ...bar(3, [[0, 4, 76], [4, 2, 74], [6, 2, 72], [8, 8, 67]]),
  ...bar(4, [[0, 2, 72], [2, 2, 69], [4, 2, 65], [6, 2, 69], [8, 2, 72], [10, 2, 77], [12, 2, 76], [14, 2, 74]]),
  ...bar(5, [[0, 4, 72], [4, 4, 69], [8, 2, 65], [10, 2, 69], [12, 4, 74]]),
  ...bar(6, [[0, 2, 70], [2, 2, 74], [4, 4, 79], [8, 2, 77], [10, 2, 74], [12, 4, 70]]),
  ...bar(7, [[0, 2, 67], [2, 2, 72], [4, 4, 76], [8, 4, 74], [12, 2, 72], [14, 2, 70]]),
];
const dayBass = (): NoteEv[] => DAY_ROOTS.flatMap((r, b) => bar(b, [[0, 3, r], [6, 2, r + 7], [8, 2, r + 12], [12, 3, r + 7]]));
const dayChords = (steps: number[], dur: number): NoteEv[] => DAY_CHORDS.flatMap((c, b) => bar(b, steps.map((s) => [s, dur, c] as [number, number, number[]])));

const daycare: Song = {
  bpm: 96,
  length: 128,
  tracks: [
    { voice: "lead", tone: "bell", events: DAY_LEAD, vol: 0.9 },
    { voice: "bass", events: dayBass(), vol: 0.8 },
    { voice: "chords", events: dayChords([4, 12], 2), vol: 0.45 },
    { voice: "pad", events: dayChords([0], 16), vol: 0.25 },
    { voice: "kick", events: everyBar(8, [0, 8], 0.7) },
    { voice: "snare", events: everyBar(8, [4, 12], 0.25) },
    { voice: "hat", events: everyBar(8, [2, 6, 10, 14], 0.35) },
  ],
};
const daycareRush: Song = {
  bpm: 120,
  length: 128,
  tracks: [
    { voice: "lead", tone: "bell", events: DAY_LEAD, vol: 0.9 },
    { voice: "bass", events: dayBass(), vol: 0.85 },
    { voice: "chords", events: dayChords([2, 6, 10, 14], 1), vol: 0.45 },
    { voice: "kick", events: everyBar(8, [0, 4, 8, 12], 0.85) },
    { voice: "snare", events: everyBar(8, [4, 12], 0.5) },
    { voice: "hat", events: everyBar(8, [0, 2, 4, 6, 8, 10, 12, 14], 0.3) },
  ],
};

// ---------- Recess Run ----------
const RUN_ROOTS = [40, 36, 43, 38, 40, 36, 43, 38]; // E2 C2 G2 D2
const RUN_CHORDS = [
  [64, 67, 71], // Em
  [60, 64, 67], // C
  [62, 67, 71], // G
  [62, 66, 69], // D
  [64, 67, 71],
  [60, 64, 67],
  [62, 67, 71],
  [62, 66, 69],
];
const RUN_LEAD: NoteEv[] = [
  ...bar(0, [[0, 2, 71], [2, 2, 76], [4, 2, 79], [6, 2, 76], [8, 3, 83], [11, 1, 81], [12, 2, 79], [14, 2, 76]]),
  ...bar(1, [[0, 2, 79], [2, 2, 76], [4, 2, 72], [6, 2, 76], [8, 4, 79], [12, 4, 76]]),
  ...bar(2, [[0, 2, 74], [2, 2, 79], [4, 2, 83], [6, 2, 79], [8, 3, 86], [11, 1, 84], [12, 2, 83], [14, 2, 79]]),
  ...bar(3, [[0, 2, 81], [2, 2, 78], [4, 2, 74], [6, 2, 78], [8, 6, 81]]),
  ...bar(4, [[0, 1, 76], [1, 1, 76], [2, 2, 79], [4, 4, 83], [8, 2, 81], [10, 2, 79], [12, 4, 76]]),
  ...bar(5, [[0, 4, 84], [4, 2, 83], [6, 2, 79], [8, 4, 76], [12, 4, 79]]),
  ...bar(6, [[0, 2, 83], [2, 2, 81], [4, 2, 79], [6, 2, 74], [8, 2, 79], [10, 2, 83], [12, 4, 86]]),
  ...bar(7, [[0, 2, 81], [2, 2, 83], [4, 2, 81], [6, 2, 78], [8, 4, 74], [12, 2, 69], [14, 2, 71]]),
];
const recess: Song = {
  bpm: 140,
  length: 128,
  tracks: [
    { voice: "lead", tone: "square", events: RUN_LEAD, vol: 0.7 },
    { voice: "bass", events: RUN_ROOTS.flatMap((r, b) => bar(b, [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, 2, i % 4 === 2 ? r + 12 : r] as [number, number, number]))), vol: 0.8 },
    { voice: "chords", events: RUN_CHORDS.flatMap((c, b) => bar(b, [2, 6, 10, 14].map((s) => [s, 1, c] as [number, number, number[]]))), vol: 0.35 },
    { voice: "kick", events: everyBar(8, [0, 4, 8, 12], 0.9) },
    { voice: "snare", events: everyBar(8, [4, 12], 0.6) },
    { voice: "hat", events: [...everyBar(8, [2, 6, 10, 14], 0.4), ...everyBar(8, [1, 3, 5, 7, 9, 11, 13, 15], 0.15)] },
  ],
};

// ---------- jingles (played once) ----------
const jingle = (bpm: number, tracks: Track[]): Song => ({ bpm, length: 16, tracks });
const start = jingle(150, [
  { voice: "lead", tone: "square", events: bar(0, [[0, 2, 67], [2, 2, 71], [4, 2, 74], [6, 6, 79]]), vol: 0.7 },
  { voice: "bass", events: bar(0, [[6, 6, 43]]) },
  { voice: "kick", events: everyBar(1, [6], 0.9) },
]);
const finish = jingle(130, [
  { voice: "lead", tone: "square", events: bar(0, [[0, 2, 79], [2, 2, 76], [4, 2, 72], [6, 8, 76]]), vol: 0.7 },
  { voice: "chords", events: bar(0, [[6, 8, [60, 64, 67]]]), vol: 0.5 },
  { voice: "bass", events: bar(0, [[6, 8, 36]]) },
]);
const best = jingle(140, [
  { voice: "lead", tone: "bell", events: bar(0, [[0, 2, 72], [2, 2, 76], [4, 2, 79], [6, 2, 84], [8, 8, 88]]) },
  { voice: "chords", events: bar(0, [[8, 8, [60, 64, 67]]]), vol: 0.5 },
  { voice: "bass", events: bar(0, [[8, 8, 36]]) },
  { voice: "kick", events: everyBar(1, [8], 0.9) },
]);

export const SONGS = { daycare, "daycare-rush": daycareRush, recess } satisfies Record<string, Song>;
export type SongId = keyof typeof SONGS;
export const JINGLES = { start, finish, best } satisfies Record<string, Song>;
export type JingleId = keyof typeof JINGLES;
