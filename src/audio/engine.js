// The game's sound engine. Nothing plays before the first gesture (browser rule);
// any failure — no AudioContext, a missing file, a decode error — is silent.

import { playSfx } from './sfx.js';

export const TRACKS = {
  'map-theme': 'static/audio/map-theme.mp3',
  'level-theme': 'static/audio/level-theme.mp3',
  'graduation-jingle': 'static/audio/graduation-jingle.mp3',
  'jar-fanfare': 'static/audio/jar-fanfare.mp3',
  'happy-bark': 'static/audio/happy-bark.mp3',
};
export const GAIN = { music: 0.45, sfx: 0.8, duck: 0.3 };
const CROSSFADE = 2;
const FADE_OUT = 0.3;

function defaultContext() {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio is not available');
  return new AudioCtx();
}

export async function defaultLoadBuffer(ctx, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

export function createAudio({
  settings, createContext = defaultContext, loadBuffer = defaultLoadBuffer,
  setTimer = setTimeout, clearTimer = clearTimeout, log = null,
}) {
  let ctx = null;
  let unavailable = false;
  let suspendedByUs = false;
  let musicBus = null;
  let sfxBus = null;
  let wanted = null;
  let playing = null; // { name, buffer, group, timer }
  const buffers = new Map();

  const ready = () => !!ctx && !suspendedByUs && ctx.state === 'running';
  const note = (...entry) => log?.push(entry.join(':'));

  function load(name) {
    if (!buffers.has(name)) {
      buffers.set(name, Promise.resolve().then(() => loadBuffer(ctx, TRACKS[name])).catch(() => null));
    }
    return buffers.get(name);
  }

  function scheduleLoop(pl, when, first) {
    const src = ctx.createBufferSource();
    src.buffer = pl.buffer;
    const g = ctx.createGain();
    const end = when + pl.buffer.duration;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + (first ? 0.5 : CROSSFADE));
    g.gain.setValueAtTime(1, end - CROSSFADE);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g);
    g.connect(pl.group);
    src.start(when);
    src.stop(end);
    pl.sources.push(src);
    const next = end - CROSSFADE;
    pl.timer = setTimer(() => { if (playing === pl) scheduleLoop(pl, next, false); }, Math.max(0, (next - ctx.currentTime - 5) * 1000));
  }

  function stopPlaying() {
    if (!playing) return;
    const pl = playing;
    playing = null;
    clearTimer(pl.timer);
    const now = ctx.currentTime;
    pl.group.gain.setValueAtTime(1, now);
    pl.group.gain.linearRampToValueAtTime(0, now + FADE_OUT);
    for (const s of pl.sources) { try { s.stop(now + FADE_OUT + 0.05); } catch { /* already stopped */ } }
  }

  function startWanted() {
    if (!ready() || playing?.name === wanted) return;
    stopPlaying();
    if (!wanted || !settings.get().music) return;
    const name = wanted;
    load(name).then(buffer => {
      if (!buffer || !ready() || wanted !== name || playing || !settings.get().music) return;
      const group = ctx.createGain();
      group.connect(musicBus);
      playing = { name, buffer, group, sources: [], timer: null };
      note('music', name);
      scheduleLoop(playing, ctx.currentTime, true);
    });
  }

  settings.onChange(v => {
    if (!ctx) return;
    if (!v.music) stopPlaying();
    else startWanted();
  });

  return {
    unlock() {
      if (unavailable) return;
      if (!ctx) {
        try { ctx = createContext(); } catch { unavailable = true; return; }
        musicBus = ctx.createGain();
        musicBus.gain.setValueAtTime(GAIN.music, ctx.currentTime);
        musicBus.connect(ctx.destination);
        sfxBus = ctx.createGain();
        sfxBus.gain.setValueAtTime(GAIN.sfx, ctx.currentTime);
        sfxBus.connect(ctx.destination);
      }
      suspendedByUs = false;
      if (ctx.state !== 'running') {
        try { ctx.resume()?.catch?.(() => {}); } catch { /* resume refused: try again on the next gesture */ }
      }
      startWanted();
    },
    music(name) {
      wanted = name;
      if (!ctx) return;
      if (!name) { stopPlaying(); return; }
      startWanted();
    },
    jingle(name) {
      if (!ready() || !settings.get().sfx || !TRACKS[name]) return;
      note('jingle', name);
      load(name).then(buffer => {
        if (!buffer || !ready()) return;
        const now = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(sfxBus);
        src.start(now);
        if (name !== 'happy-bark' && playing) {
          const low = GAIN.music * GAIN.duck;
          const g = musicBus.gain;
          g.cancelScheduledValues(now);
          g.setValueAtTime(GAIN.music, now);
          g.linearRampToValueAtTime(low, now + 0.15);
          g.setValueAtTime(low, now + buffer.duration);
          g.linearRampToValueAtTime(GAIN.music, now + buffer.duration + 0.4);
        }
      });
    },
    sfx(name, arg) {
      if (!ready() || !settings.get().sfx) return;
      note('sfx', name);
      try { playSfx(ctx, sfxBus, name, arg); } catch { /* never let a sound break the game */ }
    },
    suspend() {
      if (!ctx) return;
      suspendedByUs = true;
      try { ctx.suspend()?.catch?.(() => {}); } catch { /* ignore */ }
    },
    resume() {
      if (!ctx) return;
      suspendedByUs = false;
      try { ctx.resume()?.catch?.(() => {}); } catch { /* ignore */ }
      startWanted();
    },
    get state() {
      if (unavailable) return 'unavailable';
      if (!ctx) return 'locked';
      if (suspendedByUs || ctx.state === 'interrupted' || ctx.state === 'suspended') return 'suspended';
      if (ctx.state === 'closed') return 'unavailable';
      return 'running';
    },
  };
}
