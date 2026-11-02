// The shared audio engine for every PAWtastic game: one AudioContext, a music bus and an effects bus. Silent until
// the player's first tap (browsers require it), when Sound or Music is switched off in Settings, and while the tab
// is hidden. Music is scheduled a little ahead with a lookahead timer so it stays in time on a busy phone.
import { getSettings, onSettingsChange } from "@/lib/settings";
import { playHit } from "./instruments";
import { eventsAt, stepSeconds, type Song } from "./sequencer";
import { SFX, SFX_NAMES, type SfxName } from "./sfx";
import { JINGLES, SONGS, type JingleId, type SongId } from "./songs";

export { SFX_NAMES, type SfxName, type SongId, type JingleId };

export const MUSIC_VOL = 0.5;
export const SFX_VOL = 1.4;
const LOOKAHEAD = 0.12; // seconds of music scheduled ahead
const TICK_MS = 25;
const SFX_GAP_MS = 50; // the same effect again within this is dropped

/** What played (names only), for tests and the DEV browser checks. */
export const audioLog: string[] = [];
const log = (x: string) => {
  audioLog.push(x);
  if (audioLog.length > 300) audioLog.shift();
};

type Bus = { ctx: AudioContext; music: GainNode; sfx: GainNode };
let bus: Bus | null = null;
let unlocked = false;
const lastSfx = new Map<string, number>();
let wanted: SongId | null = null;
let playing: { id: SongId; song: Song; step: number; next: number; pending: SongId | null } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let wired = false;

function ensure(): Bus | null {
  if (bus) return bus;
  const g = globalThis as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
  const C = g.AudioContext ?? g.webkitAudioContext;
  if (!C) return null;
  try {
    const ctx = new C();
    let out: AudioNode = ctx.destination;
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      out = comp;
    } catch {
      /* older browsers: straight to the speakers */
    }
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    music.gain.value = MUSIC_VOL;
    sfx.gain.value = SFX_VOL;
    music.connect(out);
    sfx.connect(out);
    bus = { ctx, music, sfx };
  } catch {
    return null;
  }
  wire();
  return bus;
}

/** Listens once for taps (to unlock), visibility and settings changes. */
function wire() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  const tap = () => audio.unlock();
  document.addEventListener("pointerdown", tap, { capture: true, passive: true });
  document.addEventListener("keydown", tap, { capture: true });
  document.addEventListener("touchend", tap, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? halt() : startIfReady()));
  onSettingsChange(() => (getSettings().music ? startIfReady() : halt()));
}

function halt() {
  if (timer) clearInterval(timer);
  timer = null;
  playing = null;
}

function startIfReady() {
  if (!wanted || !unlocked || timer || !getSettings().music) return;
  if (typeof document !== "undefined" && document.hidden) return;
  const b = ensure();
  if (!b) return;
  playing = { id: wanted, song: SONGS[wanted], step: 0, next: b.ctx.currentTime + 0.06, pending: null };
  log(`music:${wanted}`);
  timer = setInterval(schedule, TICK_MS);
  schedule();
}

function schedule() {
  const b = bus;
  const p = playing;
  if (!b || !p) return;
  try {
    while (p.next < b.ctx.currentTime + LOOKAHEAD) {
      // a song change waits for the next bar, so the tune never stumbles
      if (p.pending && p.step % 16 === 0) {
        p.id = p.pending;
        p.song = SONGS[p.pending];
        p.pending = null;
        log(`music:${p.id}`);
      }
      const dt = stepSeconds(p.song.bpm);
      const lite = getSettings().lowPower;
      for (const h of eventsAt(p.song, p.step)) playHit(b.ctx, b.music, h, p.next, dt, lite);
      p.next += dt;
      p.step++;
    }
  } catch {
    halt(); // never break the game for music
  }
}

export const audio = {
  /** Called on the player's taps: lets the browser play sound, then starts any music that's waiting. */
  unlock() {
    if (!getSettings().sound && !getSettings().music) return;
    const b = ensure();
    if (!b) return;
    try {
      if (b.ctx.state !== "running") void b.ctx.resume();
      if (!unlocked) {
        // iOS: a silent buffer played inside the tap unlocks output for the page
        const s = b.ctx.createBufferSource();
        s.buffer = b.ctx.createBuffer(1, 1, 22050);
        s.connect(b.ctx.destination);
        s.start(0);
      }
    } catch {
      /* ignore */
    }
    unlocked = true;
    startIfReady();
  },
  sfx(name: SfxName) {
    if (!getSettings().sound) return;
    const now = Date.now();
    if (now - (lastSfx.get(name) ?? -Infinity) < SFX_GAP_MS) return;
    const b = ensure();
    if (!b) return;
    lastSfx.set(name, now);
    try {
      if (b.ctx.state === "suspended") void b.ctx.resume();
      SFX[name](b.ctx, b.sfx, b.ctx.currentTime + 0.005);
      log(`sfx:${name}`);
    } catch {
      /* never break the game for sound */
    }
  },
  /** A short tune played once over everything (start, finish, a new best). */
  jingle(id: JingleId) {
    if (!getSettings().sound) return;
    const b = ensure();
    if (!b) return;
    try {
      const song = JINGLES[id];
      const dt = stepSeconds(song.bpm);
      const t0 = b.ctx.currentTime + 0.02;
      for (let s = 0; s < song.length; s++) for (const h of eventsAt(song, s)) playHit(b.ctx, b.sfx, h, t0 + s * dt, dt);
      log(`jingle:${id}`);
    } catch {
      /* ignore */
    }
  },
  /** Plays a song on a loop (from the first tap, if there hasn't been one yet). Changing song waits for the bar. */
  music(id: SongId) {
    wanted = id;
    if (playing && playing.id !== id) {
      playing.pending = id;
      return;
    }
    if (playing) {
      playing.pending = null;
      return;
    }
    startIfReady();
  },
  stopMusic() {
    wanted = null;
    halt();
  },
  /** Test helpers. */
  _ctx: () => bus?.ctx ?? null,
  _reset() {
    halt();
    wanted = null;
    unlocked = false;
    lastSfx.clear();
    try {
      void bus?.ctx.close?.();
    } catch {
      /* ignore */
    }
    bus = null;
  },
};

// Listen from the start, so the player's very first tap unlocks audio (creating nothing until then).
wire();

// DEV-only hook for qa/e2e-audio.cjs (never in production builds).
if (import.meta.env?.DEV && typeof window !== "undefined")
  (window as unknown as { __audio?: unknown }).__audio = { log: audioLog, state: () => ({ playing: playing?.id ?? null, ctx: bus?.ctx.state ?? null }) };
