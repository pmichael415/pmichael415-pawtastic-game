// End-to-end QA for notifications and ad prep: the "Notify me" card appears only after a good moment, "No thanks"
// and "Notify me" behave, Settings turns notifications off, iPhones get Add to Home Screen steps, a notification tap
// is counted, and the privacy page, manifest and background script are served.
// Headless Chromium has no push service and always reports notifications as denied, so the permission prompt and
// PushManager.subscribe are stubbed and the notification routes are intercepted.
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-tycoon-save-v1';
const QUESTION = 'Want a heads-up when the new weekly challenge and prizes are out?';
const nyDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let pass = 0, fail = 0; const out = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const P256 = 'B' + 'A'.repeat(86);
const AUTH = 'A'.repeat(22);
const PUBLIC_KEY = 'BA' + 'A'.repeat(85); // shape of a real 65-byte key; the stubbed subscribe ignores it

async function phone(browser, device, { stubPush = true, noPush = false } = {}) {
  const ctx = await browser.newContext({ ...device, permissions: ['notifications'] });
  await ctx.addInitScript(([p256, auth, stub, none]) => {
    try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {}
    if (none) { try { delete window.PushManager; } catch {} }
    if (stub) {
      // Headless Chromium reports notifications as "denied" whatever is granted; stand in for the permission prompt.
      const N = function Notification() {};
      N.permission = 'default';
      N.requestPermission = async () => { N.permission = 'granted'; return 'granted'; };
      Object.defineProperty(window, 'Notification', { value: N, configurable: true, writable: true });
    }
    if (stub && window.PushManager) {
      let current = null;
      const make = () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-' + Math.random().toString(36).slice(2),
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: p256, auth } }; },
        unsubscribe: async () => { current = null; return true; },
      });
      PushManager.prototype.subscribe = async function () { current = current || make(); return current; };
      PushManager.prototype.getSubscription = async function () { return current; };
    }
  }, [P256, AUTH, stubPush, noPush]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const calls = [];
  await page.route('**/api/public/notifications/**', async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postData();
    calls.push({ path: url.pathname, body: body ? JSON.parse(body) : null });
    if (url.pathname.endsWith('/key')) return route.fulfill({ json: { publicKey: PUBLIC_KEY } });
    if (url.pathname.endsWith('/subscribe')) return route.fulfill({ status: 201, json: { ok: true } });
    return route.fulfill({ json: { ok: true } });
  });
  return { ctx, page, errors, calls };
}

async function freshRecess(page) {
  await page.goto(BASE + '/help');
  await page.evaluate(([k, v]) => {
    localStorage.clear();
    localStorage.setItem(k, JSON.stringify(v));
    localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true }));
  }, [KEY, { v: 4, coins: 500, dogs: [], staff: [], recessDay: nyDay(), recessCoinsToday: 0, missionDay: nyDay() }]);
  await page.goto(BASE + '/recess', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
}
async function playRun(page) {
  await page.getByRole('button', { name: /Start run/ }).tap();
  await page.getByRole('button', { name: /^Run again|Share & challenge/ }).first().waitFor({ timeout: 90000 });
}
const card = (page) => page.getByText(QUESTION);

(async () => {
  const browser = await chromium.launch();
  // Warm-up: let the dev server finish any first-load dependency optimisation (it reloads open pages once).
  { const w = await browser.newPage(); for (const p of ['/', '/recess', '/privacy']) { await w.goto(BASE + p, { waitUntil: 'domcontentloaded' }).catch(() => {}); await w.waitForTimeout(1500); } await w.close(); }
  const A = await phone(browser, devices['Pixel 7']);
  const B = await phone(browser, devices['Pixel 7']);
  const C = await phone(browser, devices['iPhone 13'], { stubPush: false, noPush: true });

  // Three phones: A says "No thanks", B says "Notify me", C is an iPhone without the game installed.
  await Promise.all([freshRecess(A.page), freshRecess(B.page), freshRecess(C.page)]);
  check('no card when the game first opens', !(await card(A.page).isVisible()));
  // One run at a time, each page in front: the game pauses in a page that isn't visible.
  for (const p of [A, B, C]) { await p.page.bringToFront(); await playRun(p.page); }
  await Promise.all([A, B].map((p) => card(p.page).waitFor({ timeout: 8000 }).catch(() => {})));
  await C.page.getByText(/tap Share, then Add to Home Screen/).waitFor({ timeout: 8000 }).catch(() => {});

  // A: No thanks
  check('the card appears after a Recess Rush run', await card(A.page).isVisible());
  check('it says at most 2 a week', await A.page.getByText('At most 2 a week.').isVisible());
  await A.page.getByRole('button', { name: 'No thanks' }).tap();
  await A.page.waitForTimeout(300);
  check('"No thanks" hides it', !(await card(A.page).isVisible()));
  const prompt = await A.page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-notify-prompt') || 'null'));
  check('"No thanks" is remembered (so it waits 14 days)', prompt && prompt.declines === 1 && !prompt.accepted, JSON.stringify(prompt));
  check('no subscription was sent after "No thanks"', !A.calls.some((c) => c.path.endsWith('/subscribe')));

  // B: Notify me
  check('the card appears for the second phone too', await card(B.page).isVisible());
  await B.page.getByRole('button', { name: 'Notify me' }).tap();
  await B.page.waitForTimeout(1500);
  const sub = B.calls.find((c) => c.path.endsWith('/subscribe'));
  check('"Notify me" saves the subscription with its keys and device', !!sub && /^https:\/\/fcm\.googleapis\.com\//.test(sub.body.endpoint) && sub.body.keys.p256dh === P256 && sub.body.keys.auth === AUTH && /^[A-Za-z0-9-]{8,64}$/.test(sub.body.deviceId), JSON.stringify(sub && sub.body));
  check('the card closes after "Notify me"', !(await card(B.page).isVisible()));
  check('a background script is registered', await B.page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  await B.page.getByRole('button', { name: 'Settings' }).first().tap();
  const sw = B.page.getByRole('switch', { name: /Phone notifications/ });
  await sw.waitFor({ timeout: 5000 });
  await B.page.waitForTimeout(500);
  check('Settings shows phone notifications on', (await sw.getAttribute('aria-checked')) === 'true');
  await sw.tap();
  await B.page.waitForTimeout(800);
  check('turning them off in Settings unsubscribes', B.calls.some((c) => c.path.endsWith('/unsubscribe') && c.body && /^https:\/\/fcm/.test(c.body.endpoint)));
  check('the switch shows off', (await sw.getAttribute('aria-checked')) === 'false');

  // C: iPhone without the game on the Home Screen
  check('an iPhone gets the Add to Home Screen steps', await C.page.getByText(/tap Share, then Add to Home Screen/).isVisible());
  check('an iPhone in the browser gets no "Notify me" button', !(await C.page.getByRole('button', { name: 'Notify me' }).isVisible()));

  // Opening from a notification is counted
  await A.page.goto(BASE + '/?utm_source=notification&utm_medium=push&utm_campaign=1b2c3d4e-0000-4000-8000-000000000001', { waitUntil: 'domcontentloaded' });
  await A.page.waitForTimeout(1200);
  const opened = await A.page.evaluate(() => (window.__pawtasticEvents || []).find((e) => e.name === 'notify_open'));
  check('a notification tap records notify_open with its message', !!opened && opened.props.message === '1b2c3d4e-0000-4000-8000-000000000001' && opened.props.channel === 'push', JSON.stringify(opened));

  // Ad prep pages and files
  await A.page.goto(BASE + '/privacy', { waitUntil: 'domcontentloaded' });
  await A.page.waitForTimeout(800);
  check('the privacy page opens', await A.page.getByRole('heading', { name: 'Privacy', exact: true }).isVisible());
  const man = await A.page.request.get(BASE + '/manifest.webmanifest');
  const m = await man.json().catch(() => null);
  check('the manifest is served with the right fields', man.ok() && m && m.name === 'PAWtastic Games' && m.start_url === '/?utm_source=homescreen' && m.display === 'standalone');
  const swr = await A.page.request.get(BASE + '/sw.js');
  check('the background script is served as JavaScript', swr.ok() && /javascript/.test(swr.headers()['content-type'] || ''), swr.headers()['content-type']);

  const errs = [...A.errors, ...B.errors, ...C.errors];
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
