// Music and sound in Recess Rush and the new Daycare, in a real browser (headless Chromium plays to no speaker, so
// this checks what the engine plays, not how it sounds — listen to qa/out/audio-*.wav for that). Needs the dev
// server (DEV-only hook window.__audio). Run: node qa/e2e-audio.cjs [base-url]
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
let pass = 0, fail = 0; const out = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const log = () => page.evaluate(() => [...(window.__audio?.log ?? [])]);
  const state = () => page.evaluate(() => window.__audio?.state() ?? null);
  const has = async (x) => (await log()).includes(x);
  const clear = () => page.evaluate(() => { if (window.__audio) window.__audio.log.length = 0; });

  try {
    // ---------- Recess Rush ----------
    await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: true, music: true })); });
    // a fixed course: the daily course changes every day, and on some days this unsteered run ends within seconds
    await page.goto(BASE + '/recess?seed=2026-11-02', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__audio);
    check('Recess Rush has a mute button', (await page.getByRole('button', { name: 'Mute sound' }).count()) === 1);
    await page.getByRole('button', { name: /Start run/ }).click();
    await page.waitForTimeout(400);
    check('starting a run plays the start jingle', await has('jingle:start'));
    check('…and "Recess Run" music', (await state())?.playing === 'recess', JSON.stringify(await state()));
    check('the audio is running after the tap', (await state())?.ctx === 'running', JSON.stringify(await state()));
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    check('changing lanes swooshes', await has('sfx:swoosh'));
    await page.waitForTimeout(9000);
    const l = await log();
    check('treats, shields and puddles make their sounds', l.some((x) => ['sfx:treat', 'sfx:shield', 'sfx:splash', 'sfx:block'].includes(x)), l.filter((x) => x.startsWith('sfx:')).join(','));
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(200);
    check('pausing stops the music', (await state())?.playing === null, JSON.stringify(await state()));
    await page.getByRole('button', { name: /Resume/ }).click();
    await page.waitForTimeout(300);
    check('resuming starts it again', (await state())?.playing === 'recess');
    await page.waitForFunction(() => (window.__audio?.log ?? []).includes('sfx:whistle'), null, { timeout: 70000 }).catch(() => {});
    check('the end of the run blows the whistle', await has('sfx:whistle'));
    check('…stops the music', (await state())?.playing === null);
    await page.waitForFunction(() => (window.__audio?.log ?? []).some((x) => x === 'jingle:finish' || x === 'jingle:best'), null, { timeout: 3000 }).catch(() => {});
    check('…and plays a jingle (finish, or a new best)', (await has('jingle:finish')) || (await has('jingle:best')));

    // ---------- the new Daycare ----------
    await clear();
    await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    await page.getByRole('button', { name: /Quick start/ }).click();
    await page.waitForTimeout(400);
    check('the Daycare plays "Daycare Day" after a tap', (await state())?.playing === 'daycare', JSON.stringify(await state()));
    check('a pup arriving yips', await has('sfx:arrive'));
    await page.getByRole('button', { name: 'Mute sound' }).click();
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-settings-v1') || '{}'));
    check('the mute button turns off sound and music, and the music stops', st.sound === false && st.music === false && (await state())?.playing === null, JSON.stringify(st));
    check('…then it reads "Turn sound on"', (await page.getByRole('button', { name: 'Turn sound on' }).count()) === 1);
    await page.getByRole('button', { name: 'Turn sound on' }).click();
    await page.waitForTimeout(300);
    check('turning it back on resumes the music', (await state())?.playing === 'daycare');
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) {
    check('audio checks ran', false, String(e).split('\n')[0]);
  }
  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
