# Notifications and Ad Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ad traffic measurable, and let players opt in to owner-approved phone notifications. Build email
updates behind a switch.

**Architecture:**
- **Hub code:** everything lives in the hub (`tycoon/`, TanStack Start on Cloudflare Workers, Lovable Cloud Postgres).
- **Database logic:** all delivery logic (approval gate, weekly cap, de-duplication, claiming) is in SQL functions in
  migration `0007`. They are tested with PGlite.
- **Sender:** a thin TypeScript sender calls those functions through `rpc`, sends Web Push with a WebCrypto module, and
  is triggered every 15 minutes by `pg_cron`.
- **Browser:** a background script (`public/sw.js`) only shows notifications and opens links.

**Tech Stack:** TypeScript, React 19, TanStack Start, Supabase JS, Postgres (PGlite in tests), WebCrypto, Vitest,
Playwright (`require('playwright')`), bun for dependency changes.

**Spec:** `docs/superpowers/specs/2026-11-01-notifications-and-ad-prep-design.md` (owner-approved 1 Nov 2026)

All paths below are relative to `tycoon/` unless they start with `docs/`.

## Global Constraints

- Opt-in only. A message is sent only if `approved_at` is set. Unapproved means it is never sent.
- Weekly cap: **2 distinct messages per person per week** (Monday to Sunday, `America/New_York`). The same message on
  push and email counts once. A person is `u:<user_id>` when signed in, otherwise `d:<device_id>`.
- Quiet hours: **20:00 to 09:00 America/New_York**. Nothing is sent then. Due messages wait.
- Message limits: title **≤ 50** characters, body **≤ 140**, link is a hub path matching `^/[a-z0-9/_-]{0,60}$`
  without `//`.
- Monday weekly message: **10:00 America/New_York**.
- No guilt or streak copy, no "you missed a day", no "your dogs are sad". Services named: daycare, boarding, baths and
  exit baths only.
- No secrets in code, logs, chat or screenshots. The VAPID private key and run secret live only in the database
  (`notify_keys`, service-role only).
- No ad trackers or pixels. Attribution uses the hub's own `game_events` only.
- Every new table: RLS on, and `REVOKE ALL … FROM PUBLIC, anon, authenticated`. Every new function: `REVOKE EXECUTE … FROM
  PUBLIC, anon, authenticated` and `GRANT EXECUTE … TO service_role`. The PGlite test setup grants all new functions to
  API roles by default, so this must be explicit.
- Booking, app and directions clicks are reported as clicks, never as bookings.
- VAPID subject: `mailto:info@pawtasticacademy.com`. Public origin today:
  `https://paw-sitive-playhouse-rush.lovable.app`.
- Commit trailer on every commit:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_019f4PwZn7y5xuGatgGz23Wo`.
- Don't publish, apply migrations to the live database, or send any message without the steps in Task 12.

## Review Focus

1. **Today is a daylight-saving change** (Sunday 1 Nov 2026). Week and quiet-hour maths must use New York local time
   across the change, not a fixed UTC offset. Tests are in Task 4.
2. **A player taps "Notify me" twice, or the browser re-subscribes** with the same endpoint. There must be one stored
   subscription, not two. Tests are in Tasks 3 and 7.
3. **Two scheduler runs overlap** (slow run, or a retry). Each subscription must get the message exactly once. Tests are
   in Tasks 3 and 6.
4. **Email security scanners open unsubscribe links.** Loading `/unsubscribe?t=…` must not unsubscribe; only the button
   press does. Test is in Task 9.
5. **A message approved late Sunday evening, or due at 08:30 Monday**, waits until 09:00 and is then sent once. Test is
   in Task 6.

---

### Task 1: Campaign tags and first-touch attribution

**Files:**
- Create: `src/lib/campaign.ts`, `src/lib/campaign.test.ts`
- Modify: `src/lib/analytics.ts` (`startSession` props at about line 136; `track` at about line 77)

**Interfaces:**
- Produces:
  - `type Campaign = { source: string | null; medium: string | null; campaign: string | null; content: string | null }`
  - `cleanTag(v: string | null | undefined): string | null`
  - `readCampaign(search: string): Campaign | null`
  - `captureFirstTouch(search: string): Campaign | null`, which returns this visit's campaign
  - `firstTouch(): Campaign | null`
  - `attributionProps(): { ft_source?: string; ft_campaign?: string }`
  - `FIRST_TOUCH_KEY = "pawtastic-first-touch"`

- [ ] **Step 1: Write the failing tests** in `src/lib/campaign.test.ts`:

```ts
expect(cleanTag("Facebook")).toBe("facebook");
expect(cleanTag("  fall promo ")).toBe("fall-promo");
expect(cleanTag("<script>")).toBeNull();
expect(cleanTag("a".repeat(61))).toBeNull();
expect(cleanTag("")).toBeNull();
expect(readCampaign("?utm_source=facebook&utm_medium=paid&utm_campaign=hawthorne-fall&utm_content=video1"))
  .toEqual({ source: "facebook", medium: "paid", campaign: "hawthorne-fall", content: "video1" });
expect(readCampaign("?ref=ABCDEFGH")).toBeNull();
// first touch is kept
captureFirstTouch("?utm_source=facebook&utm_campaign=a");
captureFirstTouch("?utm_source=google&utm_campaign=b");
expect(firstTouch()?.source).toBe("facebook");
expect(attributionProps()).toEqual({ ft_source: "facebook", ft_campaign: "a" });
```

Add an analytics test, using `window.__pawtasticEvents` after `startSession("home")` with
`location.search = "?utm_source=facebook&utm_campaign=a"`:
- `session_start` props include `utm_source: "facebook"`, `utm_campaign: "a"`, `ft_source: "facebook"` and
  `ft_campaign: "a"`.
- `track("booking_click", { location: "hillsdale" })` props include `ft_source: "facebook"`.

- [ ] **Step 2: Run** `npx vitest run src/lib/campaign.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `campaign.ts`.**
  - `cleanTag`: trim, lowercase, collapse whitespace runs to `-`, then keep only if it fully matches
    `^[a-z0-9._-]{1,60}$`; otherwise return `null`.
  - Storage failures are ignored, as in `referral.ts`.
- [ ] **Step 4: Wire it into `analytics.ts`.**
  - In `startSession`, call `captureFirstTouch(location.search)`. Add `utm_source`, `utm_medium`, `utm_campaign` and
    `utm_content` (only non-null values), plus `...attributionProps()`, to `session_start`.
  - In `track`, merge `attributionProps()` into props for `booking_click`, `app_click` and `directions_click`.
  - Keep the 12-prop cap in `clean()`.
- [ ] **Step 5: Run** `npx vitest run`. Expected: all pass.
- [ ] **Step 6: Commit** `src/lib/campaign.ts src/lib/campaign.test.ts src/lib/analytics.ts` with the message
  "Ad prep: record campaign tags and first touch on sessions and booking clicks".

### Task 2: Privacy page, link previews, installable hub

**Files:**
- Create:
  - `src/routes/privacy.tsx`
  - `src/lib/site.ts`
  - `public/manifest.webmanifest`
  - `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`
  - `public/brand/og-image.png`
  - `scripts/make-share-images.cjs`
  - `src/test/site-meta.test.ts`
- Modify:
  - `src/routes/__root.tsx` (`head()` at about lines 67–83)
  - `src/components/game/GameHeader.tsx` (`SettingsSheet`)
  - `src/routes/account.tsx`
  - `src/routes/visit.tsx`
  - `src/routeTree.gen.ts`, regenerated by the build

**Interfaces:**
- Produces: `PUBLIC_ORIGIN = "https://paw-sitive-playhouse-rush.lovable.app"` in `src/lib/site.ts`. It is the single
  place to change when play.pawtasticacademy.com is connected.

- [ ] **Step 1: Write the failing tests** in `src/test/site-meta.test.ts`:
  - Parse `public/manifest.webmanifest` and expect:
    - `name: "PAWtastic Games"`, `start_url: "/?utm_source=homescreen"`, `display: "standalone"`
    - `background_color: "#FAF8F5"`
    - icons: `192x192` and `512x512` (`purpose` "any"), plus `512x512` with `purpose: "maskable"`
  - Every icon file exists.
  - Render the root `head()` and expect:
    - `og:title` "PAWtastic Games"
    - `og:image` === `${PUBLIC_ORIGIN}/brand/og-image.png`, `og:url` === `PUBLIC_ORIGIN`
    - a `<link rel="manifest" href="/manifest.webmanifest">`
    - `apple-mobile-web-app-capable` "yes" and `apple-mobile-web-app-title` "PAWtastic"
  - Add a route test, following `src/test/app-routing.test.tsx`: `/privacy` renders a heading "Privacy".
- [ ] **Step 2: Run** `npx vitest run src/test/site-meta.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `scripts/make-share-images.cjs`.**
  - It uses Playwright to screenshot small HTML pages built from `src/assets/brand/` (the sitting-dog logo, on
    `#FAF8F5`).
  - Icons: 192 and 512 px. The maskable icon has the logo within the centre 80%.
  - Preview image: `og-image.png` at 1200×630, with both logos and a real game screenshot from `qa/out/`.
  - Run it with `node scripts/make-share-images.cjs`, and commit the generated PNGs.
- [ ] **Step 4: Create the manifest, `site.ts` and the head tags.**
  - Head tags: `og:title`, `og:description` ("Free dog games from PAWtastic Academy: Daycare Tycoon, Recess Rush and
    Graduation Day."), `og:image`, `og:url`, `twitter:image`, the manifest link, the Apple meta tags, and
    `apple-touch-icon` → `/icons/icon-192.png`.
- [ ] **Step 5: Create `privacy.tsx`** in the same layout as `help.tsx`. It has 3 short sections:
  - **What we record:** a random device ID, game events, your account email when you sign in, phone-notification
    subscriptions and email choices.
  - **What we don't do:** no ad trackers or pixels, nothing sold, game coins aren't money.
  - **Your choices:** turn notifications off in Settings, unsubscribe from any email, ask for deletion at
    info@pawtasticacademy.com.

  Link to `/privacy` from `SettingsSheet`, the Account page and the Visit page. **Mark the page for owner review in
  STATUS.md**, because it isn't published until he OKs the text.
- [ ] **Step 6: Run** `npx vite build` (this regenerates `routeTree.gen.ts`), then `npx vitest run` and
  `npx tsc --noEmit -p .`. Expected: all pass.
- [ ] **Step 7: Commit** with the message "Ad prep: privacy page, link previews, installable hub (manifest + icons)".

### Task 3: Notifications database (migration 0007)

**Files:**
- Create:
  - `drizzle/migrations/0007_notifications.sql`
  - `drizzle/migrations/meta/0007_snapshot.json`: copy 0006's stub, give it a new `id`, and set
    `prevId: "a5ae383f-aa7f-4aec-b23b-d350a1b3259b"`
  - `src/test/pg.ts`
  - `src/test/notifications-db.test.ts`
- Modify:
  - `drizzle/migrations/meta/_journal.json`: add `{ idx: 7, version: "7", when: 1793600000000, tag: "0007_notifications", breakpoints: true }`
  - `src/test/migrations.test.ts`: import its setup from `pg.ts`
  - `src/lib/analytics.ts` `EVENT_NAMES`
  - `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces:
  - Test helpers in `src/test/pg.ts`: `setupDb(): Promise<PGlite>` (roles, `auth.uid()`, every migration in order);
    `as(db, role, uid, fn)`; `one(db, sql, params)`; `fails(promise)`. These are moved from `migrations.test.ts`.
  - The SQL functions below, all service-role only.

| Function | Returns | Rule |
|---|---|---|
| `notify_subscribe(_endpoint text, _p256dh text, _auth text, _device text, _user uuid)` | `uuid` | Upsert on `endpoint` (re-enable, update keys, device and user). Afterwards, disable the oldest active rows so a device keeps at most 3 |
| `notify_unsubscribe(_endpoint text)` | `boolean` | Sets `disabled_at` |
| `notify_start_next(_now timestamptz)` | `SETOF notify_messages` (0 or 1 row) | Oldest row with `status IN ('scheduled','sending') AND send_at <= _now`, `FOR UPDATE SKIP LOCKED`. Sets `status='sending'` and `sending_started_at = coalesce(sending_started_at,_now)` |
| `notify_claim_push(_message uuid, _week date, _limit int)` | `TABLE(subscription_id uuid, endpoint text, p256dh text, auth text)` | Active subscriptions with no `push` delivery for this message, matching `audience_user` when set, and whose person has `< 2` distinct *other* messages this week (status `pending` or `sent`). Inserts `pending` deliveries `ON CONFLICT DO NOTHING` and returns only the rows this call inserted |
| `notify_claim_email(_message uuid, _week date, _limit int)` | `TABLE(user_id uuid, email text, unsub_token uuid)` | The same rules over opt-ins with `unsubscribed_at IS NULL`. Person is `u:<user_id>` |
| `notify_mark(_message uuid, _channel text, _target text, _status text, _error text)` | `void` | Status is `sent`, `failed` or `gone`. Sets `sent_at` when sent. Error is truncated to 200 characters |
| `notify_push_result(_subscription uuid, _ok boolean, _gone boolean)` | `void` | ok: `last_success_at=now()`, `failure_count=0`. gone: `disabled_at=now()`. Otherwise `failure_count+1`, disabled at 5 |
| `notify_finish(_message uuid, _now timestamptz)` | `void` | `status='sent'`, `sent_at=_now` |
| `notify_get_keys()` | `TABLE(vapid_public text, vapid_private_jwk jsonb, run_secret text)` | |
| `notify_init_keys(_public text, _private jsonb, _secret text)` | `void` | Insert id 1, `ON CONFLICT DO NOTHING` |
| `notify_set_email_optin(_user uuid, _email text, _on boolean, _adult boolean)` | `void` | on requires `_adult`. Off sets `unsubscribed_at`. On re-subscribing, clears `unsubscribed_at` and keeps the token |
| `notify_email_unsubscribe(_token uuid)` | `boolean` | Idempotent |

- [ ] **Step 1: Extract `src/test/pg.ts`** from `migrations.test.ts`, without changing behaviour. Run
  `npx vitest run src/test/migrations.test.ts`. Expected: PASS.
- [ ] **Step 2: Write the failing tests** in `src/test/notifications-db.test.ts` (`// @vitest-environment node`):

```ts
// privacy: API roles can't touch anything
for (const t of ["push_subscriptions","email_optins","notify_messages","notify_deliveries","notify_keys","notify_config"])
  expect(await fails(as(db,"anon",null,()=>db.query(`select * from public.${t}`)))).toMatch(/permission denied/);
expect(await fails(as(db,"authenticated",U1,()=>db.query(`select public.notify_start_next(now())`)))).toMatch(/permission denied/);
// approval gate
expect(await fails(db.query(`insert into notify_messages(kind,title,body,path,channels,send_at,status) values ('weekly','t','b','/', '{push}', now(), 'scheduled')`))).toMatch(/check/);
// path rule
for (const p of ["//evil.com","https://x","/Recess","/a b"]) expect(await fails(insertMsg({ path: p }))).toMatch(/check/);
// Review focus 2: subscribing twice keeps one row
await sub("https://fcm.googleapis.com/fcm/send/A", "d1"); await sub("https://fcm.googleapis.com/fcm/send/A", "d1");
expect((await one(db,`select count(*)::int n from push_subscriptions`)).n).toBe(1);
// 4th endpoint on one device disables the oldest
// claims: once per subscription per message
const m = await approvedMsg(); const c1 = await claimPush(m, "2026-11-02"); const c2 = await claimPush(m, "2026-11-02");
expect(c1.length).toBe(activeSubs); expect(c2.length).toBe(0);
// Review focus 3: overlapping claims are disjoint
const [a, b] = await Promise.all([claimPush(m2, W, 500), claimPush(m2, W, 500)]);
expect(new Set([...a, ...b].map(r => r.subscription_id)).size).toBe(a.length + b.length);
// weekly cap: 2 distinct messages; same message by email + push counts once
// audience_user limits a test message to that user's subscriptions
// disabled subscriptions and unsubscribed emails are never claimed
// game_events accepts notify_open
```

- [ ] **Step 3: Run** `npx vitest run src/test/notifications-db.test.ts`. Expected: FAIL (tables missing).
- [ ] **Step 4: Write `0007_notifications.sql`.** Tables:
  - **`push_subscriptions`**
    - `id uuid pk default gen_random_uuid()`
    - `endpoint text unique` (https, ≤ 1000 characters)
    - `p256dh text` (80–100 characters), `auth text` (16–32 characters)
    - `device_id text` (8–64 characters), `user_id uuid null`
    - `created_at`, `last_success_at`, `failure_count int default 0`, `disabled_at`
  - **`email_optins`**
    - `user_id uuid pk`, `email text` (contains `@`, ≤ 254 characters)
    - `adult_confirmed boolean CHECK (adult_confirmed)`
    - `opted_in_at`, `unsubscribed_at`, `unsub_token uuid unique default gen_random_uuid()`
  - **`notify_messages`**
    - `id`, `kind` in `weekly`, `announcement` or `test`
    - `title` (1–50 characters), `body` (1–140 characters), `path` (the rule above)
    - `channels text[]` (a non-empty subset of `{push,email}`)
    - `email_subject` (≤ 80 characters), `email_body` (≤ 2000 characters), both required when `email` is a channel
    - `audience_user uuid null`, `send_at`, `approved_at`, `approved_by`
    - `status` in `draft`, `scheduled`, `sending`, `sent` or `cancelled`, with `CHECK (status IN
      ('draft','cancelled') OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))`
    - `created_at`, `sending_started_at`, `sent_at`
  - **`notify_deliveries`**
    - `message_id` (foreign key), `channel`, `target_id text`, `person text`, `week date`
    - `status` in `pending`, `sent`, `failed` or `gone`
    - `created_at`, `sent_at`, `error`
    - PK (`message_id`, `channel`, `target_id`), index (`person`, `week`)
  - **`notify_keys`**: `id int pk CHECK (id = 1)`, plus the three key columns.
  - **`notify_config`**: `id int pk CHECK (id = 1)`, `origin text not null`. Seed it with the public origin.

  Also replace the `game_events.name` CHECK, adding `notify_prompt`, `notify_optin`, `notify_open` and `email_optin`.
  Add the functions from the table above, with the grants and revokes from Global Constraints.
- [ ] **Step 5: Add the 4 names to `EVENT_NAMES`.** Add the tables and functions to `types.ts`, following the
  `game_saves` and `save_game_progress` entries.
- [ ] **Step 6: Run** `npx vitest run`. Expected: all pass, including `migrations.test.ts`.
- [ ] **Step 7: Commit** with the message "Notifications: database (subscriptions, approved messages, deliveries,
  weekly cap)".

### Task 4: Schedule and rule helpers

**Files:**
- Create: `src/lib/notify/schedule.ts`, `src/lib/notify/rules.ts`, `src/lib/notify/schedule.test.ts`,
  `src/lib/notify/rules.test.ts`

**Interfaces:**
- Produces:
  - `NY_TZ = "America/New_York"`
  - `nyWeekStart(ms: number): string` (`YYYY-MM-DD` of that Monday)
  - `inQuietHours(ms: number): boolean`
  - `MESSAGE_LIMITS = { title: 50, body: 140 }`
  - `validateMessage(m: { title: string; body: string; path: string }): string[]`
  - `isAllowedPushEndpoint(url: string): boolean`
  - `campaignUrl(path: string, messageId: string, channel: "push" | "email"): string`

- [ ] **Step 1: Write the failing tests.**

```ts
// Review focus 1: DST ends today, 1 Nov 2026
expect(nyWeekStart(Date.parse("2026-11-01T12:00:00Z"))).toBe("2026-10-26");
expect(nyWeekStart(Date.parse("2026-11-02T04:30:00Z"))).toBe("2026-10-26"); // Sun 23:30 EST
expect(nyWeekStart(Date.parse("2026-11-02T05:30:00Z"))).toBe("2026-11-02"); // Mon 00:30 EST
expect(nyWeekStart(Date.parse("2026-03-09T04:30:00Z"))).toBe("2026-03-09"); // Mon 00:30 EDT
expect(inQuietHours(Date.parse("2026-11-02T15:00:00Z"))).toBe(false); // 10:00 EST
expect(inQuietHours(Date.parse("2026-11-02T13:59:00Z"))).toBe(true);  // 08:59 EST
expect(inQuietHours(Date.parse("2026-11-03T01:00:00Z"))).toBe(true);  // 20:00 EST
expect(inQuietHours(Date.parse("2026-07-06T13:00:00Z"))).toBe(false); // 09:00 EDT
for (const ok of ["https://fcm.googleapis.com/fcm/send/abc","https://updates.push.services.mozilla.com/wpush/v2/x",
  "https://web.push.apple.com/QW","https://wns2-par02p.notify.windows.com/w/?token=x"]) expect(isAllowedPushEndpoint(ok)).toBe(true);
for (const bad of ["http://fcm.googleapis.com/x","https://evil.com/fcm.googleapis.com","https://fcm.googleapis.com.evil.com/x",
  "https://user@fcm.googleapis.com/x","https://fcm.googleapis.com:8443/x","https://localhost/x","https://notify.windows.com.evil.com/x"])
  expect(isAllowedPushEndpoint(bad)).toBe(false);
expect(validateMessage({ title: "x".repeat(51), body: "ok", path: "/" })).toContain("title");
expect(validateMessage({ title: "ok", body: "ok", path: "//evil.com" })).toContain("path");
expect(campaignUrl("/recess", "1b2c", "push")).toBe("/recess?utm_source=notification&utm_medium=push&utm_campaign=1b2c");
expect(campaignUrl("/", "1b2c", "email")).toBe("/?utm_source=email&utm_medium=email&utm_campaign=1b2c");
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Get New York local parts with `Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, hourCycle: "h23", … })`.
  - Week start: the local date minus `(weekday + 6) % 7` days, with date arithmetic on the local Y-M-D.
  - Allowed hosts: exactly `fcm.googleapis.com`, `updates.push.services.mozilla.com` and `web.push.apple.com`, or a
    suffix `.push.apple.com` or `.notify.windows.com`. https only, no port, no userinfo.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Notifications: New York week, quiet hours, message and endpoint rules".

### Task 5: Web Push module (VAPID + aes128gcm, WebCrypto)

**Files:**
- Create: `src/lib/notify/webpush.ts`, `src/lib/notify/webpush.test.ts` (`// @vitest-environment node`),
  `src/test/http_ece.d.ts`
- Modify: `package.json` and `bun.lock`, via `bun add -d http_ece@1.2.1`. This is an independent reference
  implementation, used in tests only.

**Interfaces:**
- Produces:
  - `b64url(b: Uint8Array): string`, `fromB64url(s: string): Uint8Array`
  - `type VapidKeys = { publicKey: string; privateJwk: JsonWebKey }`
  - `generateVapidKeys(): Promise<VapidKeys>` (the public key is the 65-byte uncompressed point, base64url)
  - `vapidHeader(endpoint: string, keys: VapidKeys, subject: string, nowSec: number): Promise<string>`
  - `encryptPayload(plain: Uint8Array, sub: { p256dh: string; auth: string }, opts?: { salt?: Uint8Array; asKeys?: CryptoKeyPair }): Promise<Uint8Array>`
  - `type PushMessage = { title: string; body: string; url: string; tag: string }`
  - `sendWebPush(sub: { endpoint: string; p256dh: string; auth: string }, msg: PushMessage, keys: VapidKeys, subject: string, fetchImpl?: typeof fetch): Promise<number>` (the HTTP status)

- [ ] **Step 1: Write the failing tests.**
  - **Round trip against the reference:** a user-agent key from `crypto.createECDH("prime256v1")` and a random 16-byte
    auth secret. Encrypt `'{"title":"Hi"}'` with `encryptPayload`, then decrypt with
    `require("http_ece").decrypt(body, { version: "aes128gcm", privateKey: ecdh, authSecret })` and get the same text.
  - **Layout:** `body.subarray(16,20)` equals `[0,0,16,0]`, `body[20] === 65`, and
    `body.length === 16 + 4 + 1 + 65 + plain.length + 1 + 16`.
  - **Randomness:** two encryptions of the same text differ.
  - **VAPID header:** matches `/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/`. The JWT header is
    `{"typ":"JWT","alg":"ES256"}`. Claims: `aud === "https://fcm.googleapis.com"`, `exp === now + 43200` and
    `sub === "mailto:info@pawtasticacademy.com"`. The signature verifies with Node
    `crypto.verify("sha256", …, { key: publicKeyFromJwk, dsaEncoding: "ieee-p1363" }, sig)`.
  - **`sendWebPush` with a fake fetch:** POST to the endpoint with headers `TTL: "86400"`,
    `Content-Encoding: "aes128gcm"`, `Content-Type: "application/octet-stream"`, `Urgency: "normal"`, and
    `Authorization` starting with `vapid t=`. It returns the fake status.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement with WebCrypto only** (no Node imports, because it runs on Workers). Key derivation (RFC
  8291):

```
ecdh   = ECDH(as_priv, ua_pub)
prkKey = HMAC(auth, ecdh)
ikm    = HMAC(prkKey, "WebPush: info\0" || ua_pub || as_pub || 0x01)
prk    = HMAC(salt, ikm)
cek    = HMAC(prk, "Content-Encoding: aes128gcm\0" || 0x01)[0..16]
nonce  = HMAC(prk, "Content-Encoding: nonce\0" || 0x01)[0..12]
body   = salt(16) || uint32be(4096) || 65 || as_pub || AES-GCM(cek, nonce, plain || 0x02)
```

  - The JWT is signed with ECDSA P-256 SHA-256, and the raw 64-byte signature is base64url-encoded.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Notifications: Web Push encryption and VAPID signing (checked against
  http_ece)".

### Task 6: Keys and sender

**Files:**
- Create: `src/lib/notify/sender.server.ts`, `src/lib/notify/sender.test.ts` (`// @vitest-environment node`)

**Interfaces:**
- Consumes: Task 3's SQL functions, Task 4's `nyWeekStart`, `inQuietHours` and `campaignUrl`, and Task 5's
  `generateVapidKeys`, `sendWebPush` and `b64url`.
- Produces:
  - `type NotifyRpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: unknown }> }`
  - `VAPID_SUBJECT = "mailto:info@pawtasticacademy.com"`
  - `getNotifyKeys(db: NotifyRpc): Promise<{ keys: VapidKeys; runSecret: string }>`: reads them, or creates them with
    `notify_init_keys` (a 32-byte random run secret, base64url) and reads again.
  - `type EmailTransport = (m: { to: string; subject: string; text: string; html: string; unsubscribeUrl: string; idempotencyKey: string }) => Promise<"sent" | "suppressed">`
  - `runSender(d: { db: NotifyRpc; now: number; fetchImpl?: typeof fetch; email?: { transport: EmailTransport; mailingAddress: string; origin: string } | null; batch?: number }): Promise<RunSummary>`
  - `type RunSummary = { quiet: boolean; message: string | null; push: { sent: number; gone: number; failed: number }; email: { sent: number; failed: number }; done: boolean }`

- [ ] **Step 1: Write the failing tests.** Use PGlite from `setupDb()`, with an `rpc` shim that runs
  `select * from public.<name>(<arg> => $n, …)` as `service_role`. Use a fake fetch that records requests, and fake
  subscriptions whose user-agent keys the test holds.
  - A draft message due in the past → 0 fetch calls.
  - An approved, due message at Monday 2026-11-02T15:00Z sends 1 request per active subscription. The decrypted
    payload equals
    `{ title, body, url: "/recess?utm_source=notification&utm_medium=push&utm_campaign=<id>", tag: <id> }`. The
    message status becomes `sent`, and `done` is true.
  - At `2026-11-03T01:30:00Z` (20:30 EST), `quiet` is true and there are 0 fetch calls.
  - **Review focus 5:** with `send_at` at 08:30 EST, the run at 08:45 sends nothing, the run at 09:00 sends once, and a
    later run sends nothing.
  - A 410 response leaves the subscription with `disabled_at` set and the delivery `gone`.
  - 5 consecutive 500 responses (over 5 messages) disable the subscription.
  - If fetch throws on the second subscription, a second run does not resend to the first or second endpoint. Each
    endpoint is fetched at most once.
  - **Review focus 3:** `Promise.all([runSender(…), runSender(…)])` fetches each endpoint exactly once.
  - Email channel with `email: null` → no email claims; the message still finishes.
  - Email channel with a stub transport → one call per opt-in, with `unsubscribeUrl` containing that user's token.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `runSender`.**
  1. Return `quiet` during quiet hours.
  2. `notify_start_next`.
  3. Week is `nyWeekStart(now)`.
  4. For push: claim up to `batch` (default 500) with `notify_claim_push`, send each, then call `notify_mark` and
     `notify_push_result`. 2xx is `sent`, 404 or 410 is `gone`, anything else is `failed` with `"HTTP <status>"`, and
     exceptions are `failed` with `"network"`. Never log endpoints.
  5. For email, when `d.email` is set: claim, then use `emailContent` (Task 9) and the transport, then call
     `notify_mark`.
  6. If every enabled channel claimed fewer than `batch`, call `notify_finish`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Notifications: sender with approval gate, cap, quiet hours and once-only
  delivery".

> Task 9's `emailContent` is consumed here. If Task 9 isn't done yet, build Task 9's `email.ts` first (Steps 1–4 of
> Task 9 only), then return here.

### Task 7: API routes

**Files:**
- Create:
  - `src/lib/notify/api.server.ts`
  - `src/lib/notify/api.test.ts` (`// @vitest-environment node`)
  - `src/routes/api/public/notifications/key.ts`, `subscribe.ts`, `unsubscribe.ts` and `run.ts`
  - `src/lib/notify/email-transport.server.ts`
- Modify: `src/routeTree.gen.ts` (regenerated by the build)

**Interfaces:**
- Consumes: `getNotifyKeys`, `runSender`, `isAllowedPushEndpoint` and `fromB64url`.
- Produces:
  - `handleSubscribe(body: unknown, db: NotifyRpc, userId: string | null): Promise<Response>`
  - `handleUnsubscribe(body: unknown, db: NotifyRpc): Promise<Response>`
  - `handleRun(req: Request, db: NotifyRpc, now: number, email: Parameters<typeof runSender>[0]["email"]): Promise<Response>`
  - `getEmailTransport(): EmailTransport | null`, which returns `null` until owner gate 3
  - Routes:
    - `GET /api/public/notifications/key` → `{ publicKey }`
    - `POST …/subscribe` with body `{ endpoint, keys: { p256dh, auth }, deviceId }` and an optional
      `Authorization: Bearer <access token>`
    - `POST …/unsubscribe` with body `{ endpoint }`
    - `POST …/run` with the header `x-notify-run`

- [ ] **Step 1: Write the failing tests.**
  - **Subscribe is rejected (400) and nothing is stored** for:
    - an evil host
    - `p256dh` that isn't a 65-byte point starting `0x04`
    - `auth` that isn't 16 bytes
    - a bad `deviceId` (not 8–64 of `[A-Za-z0-9-]`)
    - a body over 4 KB
  - **A valid subscribe returns 201.** Subscribing twice gives 1 row (review focus 2).
  - **Run:**
    - without the header → 401
    - with the wrong header → 401, and the message rows are unchanged
    - with the right header → 200, and the JSON matches `RunSummary`
  - **Unsubscribe** sets `disabled_at`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the handlers.**
  - The run secret is compared in constant time (an XOR over equal-length bytes).
  - Routes follow the pattern in `src/routes/api/public/events.ts`, importing `supabaseAdmin` dynamically.
  - `subscribe.ts` resolves the user with `supabaseAdmin.auth.getUser(token)` when there's a bearer token; an invalid
    token is treated as signed out.
  - `key.ts` sets `Cache-Control: public, max-age=3600`.
- [ ] **Step 4: Run** `npx vite build`, then `npx vitest run` and `npx tsc --noEmit -p .`. Expected: all pass.
- [ ] **Step 5: Commit** with the message "Notifications: key, subscribe, unsubscribe and protected run routes".

### Task 8: Background script, opt-in card and Settings switch

**Files:**
- Create:
  - `public/sw.js`
  - `src/lib/notify/prompt.ts`, `src/lib/notify/prompt.test.ts`
  - `src/lib/notify/client.ts`, `src/lib/notify/client.test.ts`
  - `src/components/game/NotifyCard.tsx`, `src/components/game/NotifyCard.test.tsx`
- Modify:
  - `src/routes/__root.tsx`: render `<NotifyCard />` once
  - `src/routes/daycare.tsx`: the wrap-up dialog's `onOpenChange(false)` at about line 1213 calls `goodMoment()`
  - `src/routes/recess.tsx`: after a non-rejected run at about line 92, call `goodMoment()`
  - `src/components/game/GameHeader.tsx`: add a "Phone notifications" row to `SettingsSheet`
  - `src/lib/analytics.ts`: in `startSession`, when this visit's `utm_source` is `notification` or `email`, call
    `track("notify_open", { channel: medium, message: campaign })`

**Interfaces:**
- Produces:
  - `PROMPT_KEY = "pawtastic-notify-prompt"`
  - `type PromptState = { declines: number; lastDeclineAt: number | null; accepted: boolean }`
  - `shouldOffer(s: PromptState, now: number): boolean`, `recordDecline(s, now): PromptState`,
    `recordAccept(s): PromptState`
  - `goodMoment(): void`, which raises the card through a tiny store with `useSyncExternalStore`, as `settings.ts`
    does
  - `type PushSupport = "supported" | "needs_install" | "unsupported" | "blocked"`
  - `pushSupport(env?: { navigator: Navigator; window: Window }): PushSupport`
  - `enablePush(): Promise<"on" | "denied" | "error">`, `disablePush(): Promise<void>`,
    `pushIsOn(): Promise<boolean>`

- [ ] **Step 1: Write the failing tests.**
  - **`shouldOffer`:**
    - true when the state is new
    - false when accepted
    - after 1 decline: false at day 13, true at day 14
    - false after 2 declines
  - **`pushSupport`:**
    - iPhone Safari, not standalone → `needs_install`
    - iPhone standalone with `PushManager` → `supported`
    - Android Chrome → `supported`
    - permission `denied` → `blocked`
    - no `serviceWorker` → `unsupported`
  - **`NotifyCard`:**
    - hidden on load, shown after `goodMoment()`
    - shows the exact copy "Want a heads-up when the new weekly challenge and prizes are out?" and "At most 2 a week."
      with the buttons "Notify me" and "No thanks"
    - "No thanks" hides it, stores a decline, and tracks `notify_optin {result:"dismissed"}`
    - when support is `needs_install`, it shows the Add to Home Screen steps instead of "Notify me"
    - when support is `unsupported` or `blocked`, `goodMoment()` shows nothing
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`sw.js`:**
    - `push`: parse `event.data.json()`. On failure, fall back to `{title:"PAWtastic Games", body:"Something new is
      waiting in the games.", url:"/"}`, because iOS requires a notification. Show it with
      `{ body, icon: "/icons/icon-192.png", tag, data: { url } }`.
    - `notificationclick`: the URL must start with `/`, otherwise use `/`. Focus and navigate an open hub tab, or
      `clients.openWindow(url)`.
    - No `fetch` handler.
  - **`enablePush`:** register `/sw.js`, call `Notification.requestPermission()`, `GET` the key, then
    `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. POST the subscription with `device().id`
    and the Supabase access token when signed in. Track `notify_optin` with `granted`, `denied` or `error`. Track
    `notify_prompt` when the card shows.
  - **Card copy for iPhone:** "On iPhone: tap Share, then Add to Home Screen. Open PAWtastic Games from your home
    screen, then tap Notify me."
  - **Settings row:** a switch for on/off. Text by state:
    - blocked: "Notifications are blocked in this browser's settings."
    - needs install: "On iPhone, add PAWtastic Games to your Home Screen first."
    - unsupported: "This browser can't show notifications." When `getEmailOptIn().available` is true, add "You can
      get email updates instead." with a link to the email checkbox.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .`. Expected: all pass.
- [ ] **Step 5: Commit** with the message "Notifications: opt-in card after good moments, Settings switch, background
  script".

### Task 9: Email updates (behind the switch)

**Files:**
- Create:
  - `src/lib/notify/email.ts`, `src/lib/notify/email.test.ts`
  - `src/lib/notify/email.functions.ts`
  - `src/routes/unsubscribe.tsx`, `src/routes/unsubscribe.test.tsx`
  - `src/routes/api/public/notifications/email-unsubscribe.ts`
- Modify:
  - `src/routes/account.tsx` and `GameHeader.tsx` `SettingsSheet`: the email checkbox, shown only when `available`
  - `src/routes/api/public/notifications/run.ts`: pass `email` only when `emailUpdatesEnabled(...)`

**Interfaces:**
- Produces:
  - `emailUpdatesEnabled(env: { NOTIFY_EMAIL_ENABLED?: string; NOTIFY_MAILING_ADDRESS?: string }, transport: EmailTransport | null): boolean`.
    This is true only if the flag is `"true"`, the address is non-empty and the transport isn't null.
  - `emailContent(m: { id: string; email_subject: string; email_body: string; path: string }, token: string, mailingAddress: string, origin: string): { subject: string; text: string; html: string; unsubscribeUrl: string }`
  - Server functions:
    - `getEmailOptIn` (GET, auth) → `{ available: boolean; on: boolean; email: string | null }`
    - `setEmailOptIn` (POST, auth, `{ on: boolean; adult: boolean }`) → `{ ok: true } | { ok: false; error: string }`
  - Route `POST /api/public/notifications/email-unsubscribe` with body `{ token }` always returns 200
    `{ ok: true }`, so it doesn't reveal whether a token exists.

- [ ] **Step 1: Write the failing tests.**
  - **`emailContent`:**
    - escapes `<script>` in the body
    - the link is `origin + campaignUrl(path, id, "email")`
    - the footer contains "PAWtastic Academy · " + mailingAddress, the unsubscribe URL `origin + "/unsubscribe?t=" +
      token`, and "You're getting this because you asked for weekly challenge emails in PAWtastic Games."
  - **`emailUpdatesEnabled`** is false without the flag, the address or the transport.
  - **`setEmailOptIn`** with `on && !adult` → `{ ok:false }`. The email comes from `context.claims.email`, never from
    input.
  - **Review focus 4:** rendering `/unsubscribe?t=<uuid>` makes **no** request. Clicking "Unsubscribe" POSTs once and
    shows "You're unsubscribed. You won't get these emails again."
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Checkbox copy:** "Email me the weekly challenge and prizes (at most 2 a week)", plus a required "I'm 18 or
    older". Track `email_optin { on }`.
  - **Unsubscribe page:** heading "Unsubscribe from PAWtastic Games emails?" and an "Unsubscribe" button.
- [ ] **Step 4: Run** `npx vite build`, then `npx vitest run` and `npx tsc --noEmit -p .`. Expected: all pass.
- [ ] **Step 5: Commit** with the message "Email updates: opt-in (18+), unsubscribe page, sender channel; off until
  owner gates".

### Task 10: Browser end-to-end checks

**Files:**
- Create: `qa/e2e-notify.cjs`. It follows `qa/e2e-hub.cjs`'s `check()` pattern and uses a phone-size Chromium context
  with `permissions: ["notifications"]`.

- [ ] **Step 1: Write the script.**
  - Stub `PushManager.prototype.subscribe` with `addInitScript` (headless Chromium has no push service). Intercept
    `/api/public/notifications/*` with `page.route`, and record the request bodies.
  - Checks:
    - no card on first load of `/`
    - the card appears after a Recess Rush run
    - "No thanks" hides it, and it doesn't return on the next run
    - "Notify me" POSTs a subscribe body with `endpoint`, `keys.p256dh`, `keys.auth` and `deviceId`
    - Settings shows the switch on, and turning it off POSTs unsubscribe
    - with an iPhone 13 context, after deleting `PushManager`, the card shows the Add to Home Screen steps
    - opening `/?utm_source=notification&utm_medium=push&utm_campaign=<uuid>` records `notify_open` with that message
      in `window.__pawtasticEvents`
    - `/privacy` renders
    - `/manifest.webmanifest` serves the right fields
    - `/sw.js` is served as JavaScript
    - no page errors
- [ ] **Step 2: Run it** against the dev server: start it with
  `exec npx vite --host 127.0.0.1 --port 5173 --strictPort` (in the background), then
  `node qa/e2e-notify.cjs`. Expected: all PASS, 0 failed.
- [ ] **Step 3: Run the existing suites:** `qa/e2e-hub.cjs`, `qa/e2e-daycare.cjs`, `qa/e2e-teams.cjs` and
  `qa/e2e-cloud.cjs`. Expected: all pass.
- [ ] **Step 4: Commit** with the message "QA: notifications end-to-end checks".

### Task 11: Weekly approval routine and docs

**Files:**
- Create: `drizzle/manual/notify_schedule.sql`. It is outside `migrations/` so PGlite tests don't load it.
- Modify: `AGENTS.md`, `STATUS.md`, `SYNC-TO-LOVABLE.md`

- [ ] **Step 1: Write `notify_schedule.sql`.**

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.unschedule('pawtastic-notify') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pawtastic-notify');
SELECT cron.schedule('pawtastic-notify', '*/15 * * * *', $$
  SELECT net.http_post(
    url := (SELECT origin FROM public.notify_config WHERE id = 1) || '/api/public/notifications/run',
    headers := jsonb_build_object('Content-Type','application/json','x-notify-run',(SELECT run_secret FROM public.notify_keys WHERE id = 1)),
    body := '{}'::jsonb)
$$);
```

- [ ] **Step 2: Document the approval step in `AGENTS.md`.**
  - A message is inserted as `draft`. After the owner's explicit yes in chat, run:

```sql
UPDATE notify_messages SET approved_at = now(), approved_by = 'Phil (owner), approved in chat', status = 'scheduled'
WHERE id = '<id>';
```

  - The weekly `send_at` is
    `(date_trunc('week', now() AT TIME ZONE 'America/New_York') + interval '7 days 10 hours') AT TIME ZONE 'America/New_York'`.
  - When the custom domain changes, update `notify_config.origin`, `src/lib/site.ts`, `APP_ORIGIN` and the Stripe
    webhook URL together.
- [ ] **Step 3: Update `STATUS.md`** with what was built and the owner gates (spec §10). Update `SYNC-TO-LOVABLE.md`
  to say the migration must be applied before publishing, because the new event names fail the old database check.
- [ ] **Step 4: Commit** with the message "Notifications: scheduler SQL, approval routine and docs".
- [ ] **Step 5: Update the Thursday check-in** (`trig_01HwrXne5di4cZ28ib3UxCFg`, with `update_trigger`) so it also
  drafts Monday's `weekly` message: title ≤ 50, body ≤ 140, a path, only approved prizes and real team results. It
  presents the draft with the prize lineup, and only after the owner's yes inserts and approves the row as in Step 2.

### Task 12: Release

- [ ] **Step 1: Run the full verification in `tycoon/`:** `npx tsc --noEmit -p .`, `npx vitest run`,
  `npx vite build`, and all `qa/e2e-*.cjs` suites. Expected: all green. Paste the summary lines into the release note.
- [ ] **Step 2: Apply `0007` to the Daycare database** with `mcp__Lovable__query_database`, inside
  `BEGIN … COMMIT`. In the same transaction, record
  `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256 of 0007_notifications.sql>', 1793600000000)`.
  - Verify: 8 recorded migrations.
  - Verify: `notify_*` tables exist with RLS on.
  - Verify: `has_function_privilege('anon','public.notify_start_next(timestamptz)','execute')` is false.
- [ ] **Step 3: Sync to `/home/user/pawtastic-daycare-tycoon`.**
  1. Run `bash scripts/make-sync-manifest.sh`, copy the files, and verify their sha256.
  2. Run `diff -rq`. The only expected differences are README, favicon.png, daycare-room.jpg, textarea.tsx and
     SYNC-MANIFEST.txt.
  3. With node_modules symlinked: tsc, vitest and build.
  4. Clean up, commit and push `main`.
- [ ] **Step 4: Ask the owner to publish.** This is a release decision. After publishing, apply
  `drizzle/manual/notify_schedule.sql` with `query_database`.
  - Verify the job with `SELECT jobname, schedule FROM cron.job`.
  - Verify that a manual `SELECT net.http_post(...)` gets 200 with a `RunSummary` (a quiet or empty run).
  - **Only if `pg_cron` or `pg_net` can't be enabled,** build the spec §5 fallback (TDD, same pattern as Task 7):
    - Add `last_visit_run_at timestamptz` to `notify_config` (migration `0008`). Add a function
      `notify_visit_due(_now timestamptz) RETURNS boolean`: an atomic `UPDATE … WHERE last_visit_run_at IS NULL OR
      last_visit_run_at < _now - interval '15 minutes' RETURNING true`.
    - `POST /api/public/notifications/visit` runs `runSender` only when `notify_visit_due` returns true. It returns 202
      otherwise.
    - `startSession` POSTs it fire-and-forget.
    - Tests: two calls within 15 minutes run the sender once, and the route never sends an unapproved message.
- [ ] **Step 5: Owner device test.**
  1. The owner turns on notifications on his phone (Android or computer, plus an installed iPhone if he has one).
  2. Draft a `test` message with `audience_user` set to his user ID and the path `/`.
  3. After his yes in chat, approve it with `send_at = now()`.
  4. Confirm the deliveries are `sent` within 15 minutes, outside quiet hours, and that his tap records `notify_open`.
- [ ] **Step 6: Report to the owner** what is live, the test result, and the remaining gates (email permission,
  mailing address, email set-up, domain, privacy text). Mark task #21 complete.
