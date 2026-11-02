// Renders listening previews of the games' music and sounds to qa/out/audio-*.wav, in Chromium, with the same
// synth code and mix the games use (via the dev server). Prints each file's peak and loudness.
// Run: node qa/audio-preview.cjs [base-url] [out-dir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = process.argv[3] || path.join(__dirname, 'out');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE + '/help', { waitUntil: 'networkidle' });
  const jobs = [
    ['audio-1-daycare-day.wav', 'song', 'daycare', 30],
    ['audio-2-daycare-rush-hour.wav', 'song', 'daycare-rush', 20],
    ['audio-3-recess-run.wav', 'song', 'recess', 28],
    ['audio-4-jingles-start-finish-best.wav', 'jingles', ['start', 'finish', 'best']],
    ['audio-5-daycare-sounds.wav', 'sfx', ['select', 'arrive', 'checkin', 'playtime', 'bath', 'calm', 'coins', 'thunk', 'pop', 'sparkle', 'error', 'fanfare', 'drumroll']],
    ['audio-6-recess-sounds.wav', 'sfx', ['swoosh', 'treat', 'shield', 'block', 'splash', 'go', 'whistle']],
  ];
  for (const [file, kind, what, secs] of jobs) {
    const r = await page.evaluate(async ([kind, what, secs]) => {
      const m = await import('/src/lib/audio/preview.ts');
      const buf = kind === 'song' ? await m.renderSong(what, secs) : kind === 'jingles' ? await m.renderJingles(what) : await m.renderSfx(what);
      const w = m.wav(buf);
      let s = '';
      for (let i = 0; i < w.bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, w.bytes.subarray(i, i + 0x8000));
      return { b64: btoa(s), peak: w.peak, rms: w.rms, sec: buf.duration };
    }, [kind, what, secs]);
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.b64, 'base64'));
    console.log(`${file}: ${r.sec.toFixed(1)} s, peak ${r.peak.toFixed(2)}, loudness ${(20 * Math.log10(r.rms || 1e-9)).toFixed(1)} dBFS`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
