// The music is written as step patterns (16 steps a bar) and played by a lookahead scheduler.
import { describe, expect, it } from "vitest";
import { eventsAt, midiToFreq, stepSeconds } from "./sequencer";
import { SONGS, type SongId } from "./songs";

describe("the sequencer", () => {
  it("A4 is 440 Hz and an octave doubles it", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
  it("a 16th note at 120 BPM lasts 0.125 s", () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125);
  });
  it("events loop: step 0 and step `length` give the same notes", () => {
    const song = SONGS.recess;
    expect(eventsAt(song, song.length)).toEqual(eventsAt(song, 0));
  });
  it("the Daycare tune opens on F: an F bass and a C melody note, with a kick", () => {
    const ev = eventsAt(SONGS.daycare, 0);
    expect(ev.some((e) => e.voice === "bass" && e.notes.includes(41))).toBe(true);
    expect(ev.some((e) => e.voice === "lead" && e.notes.includes(72))).toBe(true);
    expect(ev.some((e) => e.voice === "kick")).toBe(true);
  });
});

describe("the songs", () => {
  const ids = Object.keys(SONGS) as SongId[];
  it("every song is whole bars, its notes in a singable range, every event inside the loop", () => {
    for (const id of ids) {
      const s = SONGS[id];
      expect(s.length % 16, id).toBe(0);
      expect(s.bpm, id).toBeGreaterThanOrEqual(70);
      for (const t of s.tracks)
        for (const e of t.events) {
          expect(e.step, `${id}/${t.voice}`).toBeGreaterThanOrEqual(0);
          expect(e.step + e.dur, `${id}/${t.voice}`).toBeLessThanOrEqual(s.length);
          for (const n of e.notes) {
            expect(n, `${id}/${t.voice}`).toBeGreaterThanOrEqual(28);
            expect(n, `${id}/${t.voice}`).toBeLessThanOrEqual(96);
          }
        }
    }
  });
  it("rush hour is the same tune, faster and with more drums", () => {
    const calm = SONGS.daycare;
    const rush = SONGS["daycare-rush"];
    expect(rush.length).toBe(calm.length);
    expect(rush.bpm).toBeGreaterThan(calm.bpm);
    const lead = (id: SongId) => SONGS[id].tracks.find((t) => t.voice === "lead")!.events;
    expect(lead("daycare-rush")).toEqual(lead("daycare"));
    const drums = (id: SongId) => SONGS[id].tracks.filter((t) => ["kick", "snare", "hat"].includes(t.voice)).reduce((n, t) => n + t.events.length, 0);
    expect(drums("daycare-rush")).toBeGreaterThan(drums("daycare"));
  });
  it("Recess Run is quicker than the Daycare tune and has a backbeat", () => {
    expect(SONGS.recess.bpm).toBeGreaterThanOrEqual(130);
    expect(SONGS.recess.tracks.some((t) => t.voice === "snare" && t.events.length >= 8)).toBe(true);
  });
});
