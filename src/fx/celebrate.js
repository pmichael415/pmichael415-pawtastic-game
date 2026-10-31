// The win celebration as a timeline of cues, the runner that plays (or skips) it,
// a score count-up, and the Treat Jar rule: a fanfare only for a real prize.

export function winTimeline({ stars, bonus, areaCompleted }) {
  const t = [
    { at: 0, cue: 'jingle' }, { at: 0, cue: 'banner' },
    { at: 300, cue: 'cheer' }, { at: 300, cue: 'bark' },
  ];
  for (let n = 1; n <= stars; n++) t.push({ at: 700 + (n - 1) * 350, cue: 'star', n });
  t.push({ at: 700 + stars * 350, cue: 'confetti' });
  if (bonus > 0) t.push({ at: 900 + stars * 350, cue: 'bonus' });
  if (areaCompleted) t.push({ at: 2600, cue: 'diploma' });
  return t.sort((a, b) => a.at - b.at);
}

// Plays the cues on time; a tap on `root` (or effects being off) lands the rest at once.
export function playWin(root, timeline, { effects, onCue, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const pending = new Map(); // cue → timer id
  let done = false;

  const fire = (cue, skipped) => {
    if (!pending.has(cue)) return;
    pending.delete(cue);
    onCue(cue, { skipped });
  };
  function skip() {
    if (done) return;
    for (const [cue, id] of [...pending]) { clearTimer(id); fire(cue, true); }
    finish();
  }
  function finish() {
    done = true;
    root.removeEventListener('pointerdown', skip);
  }

  for (const cue of timeline) pending.set(cue, null);
  if (!effects) {
    skip();
  } else {
    for (const cue of timeline) pending.set(cue, setTimer(() => { fire(cue, false); if (!pending.size) finish(); }, cue.at));
    root.addEventListener('pointerdown', skip);
  }

  return {
    skip,
    destroy() {
      for (const id of pending.values()) clearTimer(id);
      pending.clear();
      finish();
    },
  };
}

const format = n => Math.round(n).toLocaleString('en-US');
const easeOut = x => 1 - (1 - x) ** 3;

// Counts el's number from `from` to `to`; returns a cancel function.
export function countUp(el, from, to, ms, { effects = true, raf = cb => requestAnimationFrame(cb), now = () => performance.now() } = {}) {
  if (!effects || ms <= 0) { el.textContent = format(to); return () => {}; }
  const start = now();
  let cancelled = false;
  const frame = t => {
    if (cancelled) return;
    const x = Math.min(1, (t - start) / ms);
    el.textContent = format(from + (to - from) * easeOut(x));
    if (x < 1) raf(frame);
  };
  el.textContent = format(from);
  raf(frame);
  return () => { cancelled = true; };
}

// The jar celebrates only a real win; a no-win stays quiet (no near-miss effects).
export function jarCelebration(result) {
  const won = !!(result && result.ok && result.won);
  return { sound: won ? 'jar-fanfare' : null, sparkle: won };
}
