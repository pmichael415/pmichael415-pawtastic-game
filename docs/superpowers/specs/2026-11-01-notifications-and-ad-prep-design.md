# PAWtastic Games: notifications and ad prep. Design

Date: 1 Nov 2026 · Owner: Phil (PAWtastic Academy) · Status: awaiting owner review

## 1. Goal

**What the owner asked for:** notifications that bring players back to the games, and a way to start advertising.
The owner chose phone notifications plus opt-in email (1 Nov). He approved the design in chat: Monday
10 am New York time, at most 2 messages per person per week, and owner approval for every message.

**What success looks like (measured, never promised):**
- Ad traffic can be attributed. Every session and every booking, app and directions click records which campaign
  first brought that device.
- Players can opt in to phone notifications and email updates. Opt-ins, notification opens and returning players are
  counted as plain numbers.
- No message reaches anyone unless the owner approved it.

**Assumptions (to be corrected by the owner):** the hub (play.pawtasticacademy.com, today
paw-sitive-playhouse-rush.lovable.app) is the front door for ads and notifications. Graduation Day's own site keeps its
existing prize emails, and gets notifications later only if wanted.

**Starting point (1 Nov):** Graduation Day has 4 accounts and the hub has 2 accounts and 5 devices, mostly the owner and
testers. New players come first, so ad prep ships first.

## 2. Owner rules this design must keep

- Opt-in only. Every message is approved by the owner before it can be sent. Unapproved means it is never sent.
- No guilt, no streaks, no "you missed a day", no "your dogs are sad". Dogs are always safe when players leave.
- At most 2 messages per person per week (Monday to Sunday, New York time). Nothing between 8 pm and 9 am New York time.
- No invented numbers, no promised results, no posting or ad spending without the owner. Booking clicks are clicks,
  never bookings.
- Services named in messages are only daycare, boarding, baths and exit baths. Prices or promotions only if the owner has
  checked them. Game coins are never cash, discounts or daycare credit.
- No secret keys in chat, code, logs or screenshots.
- Customer-app data (app.pawtasticacademy.com) is never touched.

## 3. Milestones

| # | Milestone | Ships when |
|---|-----------|------------|
| M1 | Ad prep: campaign tags, privacy page, link previews, installable hub | Built and tested |
| M2 | Phone notifications | Built and tested. The first real send happens after the owner approves the first message |
| M3 | Email updates | Built behind a switch. The switch turns on only after the 3 owner gates in section 10 |
| M4 | Weekly routine: the Thursday check-in drafts Monday's message for approval | With M2 |

## 4. M1: ad prep

- **Campaign tags.** On every visit the hub reads `utm_source`, `utm_medium`, `utm_campaign` and `utm_content`.
  Values are cleaned to at most 60 characters of `[a-z0-9._-]`; anything else is dropped. The first tagged visit is
  saved on the device as *first touch* and never overwritten.
  `session_start` records this visit's tags and the first-touch source and campaign. `booking_click`, `app_click` and
  `directions_click` record the first-touch source and campaign. No names, emails or locations are added.
- **Privacy page** at `/privacy`, linked from Settings, the Account page and the Visit page. It covers:
  - what is recorded: a random device ID, game events, the account email when signed in, notification subscriptions
    and email opt-ins
  - what is not done: no ad trackers or pixels, nothing sold
  - how to turn things off, and how to ask for deletion (info@pawtasticacademy.com)

  The owner reviews the text before it is published.
- **Link previews.** Adds og:title, og:description, og:url and a 1200×630 og:image built from the two PAWtastic
  logos and real game art.
- **Installable hub.** Adds `manifest.webmanifest` (name "PAWtastic Games", start URL `/?utm_source=homescreen`,
  standalone display, the brand colours) with icons made from the sitting-dog logo: 192 px, 512 px and maskable. Also
  Apple home-screen meta tags. This is required for iPhone notifications.

## 5. M2: phone notifications

### What players see
- **No permission prompt on the first visit.** After a good moment, a small card appears: the end-of-day summary in
  Daycare Tycoon, or the end of a Recess Rush run. It says: "Want a heads-up when the new weekly challenge and prizes
  are out? At most 2 a week." The buttons are **Notify me** and **No thanks**.
  - After "No thanks", the card can come back once, at least 14 days later. After that it shows only in Settings.
  - The browser's own permission prompt appears only after the player taps **Notify me**.
- **iPhone, not installed:** the card instead shows the "Share → Add to Home Screen" steps. On iPhones notifications only
  work from the installed icon.
- **Unsupported browser or blocked permission:** Settings explains it plainly and offers email instead (M3).
- **Settings:** a "Phone notifications" switch shows on, off, blocked or install-first. Turning it off removes the
  subscription from the server.
- **Tapping a notification** opens the hub page in the message, for example `/` or `/recess`, with
  `utm_source=notification&utm_medium=push&utm_campaign=<message id>`.

### Messages
- Kinds:
  - `weekly`: the Monday "new week" message, covering the Team Hawthorne vs Team Hillsdale challenge and that week's
    approved Graduation Day prizes.
  - `announcement`: a one-off from the owner.
- Limits enforced in code:
  - a title of up to 50 characters and a body of up to 140
  - a link that must be a hub path starting with `/`
  - weekly cap of 2 per person, and quiet hours 20:00 to 09:00 New York time
- The cap counts distinct messages, not channels. A message that reaches someone by both phone and email (they opted
  into both) counts once.
  - A "person" is the signed-in account when there is one. Otherwise it is the device.
  - Each phone subscription and each email address gets a message at most once.
- A message that becomes due during quiet hours waits until 09:00.

### How it works

**Database (hub, new migration `0007_notifications`, all tables service-role only):**
- `push_subscriptions`
  - Columns: endpoint (unique), p256dh, auth, device_id, user_id (nullable), created_at, last_success_at,
    failure_count, disabled_at.
  - Accepted only if the endpoint is https on a known browser push service: `fcm.googleapis.com`,
    `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`. The server never posts to any
    other address.
  - At most 3 subscriptions per device.
- `notify_messages`
  - Columns: id, kind, title, body, path, send_at, channels (push and/or email), email_subject, email_body,
    approved_at, approved_by, status (`draft` → `scheduled` → `sending` → `sent`), created_at.
  - Length and path rules are enforced as database checks too.
  - Only rows with `approved_at` set can ever leave `draft`.
- `notify_deliveries`
  - Columns: message_id, channel, target_id, status, sent_at, error.
  - Primary key (message_id, channel, target_id), so nobody gets the same message twice.
  - Also used to count the weekly cap.
- `notify_keys` (single row)
  - The notification signing key pair (VAPID, P-256), created by the server on first use with WebCrypto. The private
    key never leaves the server; only the public key is served to browsers.
  - The scheduler's run secret.
- `game_events` checks gain: `notify_prompt`, `notify_optin` (with result granted, denied, dismissed, unsupported or
  needs_install), `notify_open` and `email_optin`.

**Server routes (hub):**
- `GET /api/public/notifications/key`: the public signing key.
- `POST /api/public/notifications/subscribe`: validates and stores a subscription, linked to the account if signed in.
- `POST /api/public/notifications/unsubscribe`: removes it.
- `POST /api/public/notifications/run`: the sender. It requires the run secret in a header, compared in constant time.

**Sending:**
- A database scheduler (`pg_cron` plus `pg_net`, both available on the hub database) calls `run` every 15 minutes.
- Each run:
  - picks approved messages that are due, outside quiet hours
  - sends in batches of up to 500 per run, and the next run continues
  - skips anyone at the weekly cap
  - records each delivery
- Push messages use the standard Web Push protocol with encrypted payloads (RFC 8291 aes128gcm, VAPID RFC 8292).
  This is a small WebCrypto module, because the hub runs on Cloudflare Workers, where the usual Node library does not
  run.
- Responses:
  - 404 or 410 from the push service disables that subscription.
  - Other errors raise failure_count, and a subscription is disabled after 5 failures in a row.
- **Fallback if `pg_cron` can't be enabled:** a hub visit triggers `run` at most once every 15 minutes. That is
  slower, but only approved messages are ever sent.

**Background script:** `/sw.js` handles only `push` (show the notification) and `notificationclick` (open the link
on the hub, record `notify_open`). It does not cache pages, so it can't serve an old version of the game.

## 6. M3: email updates (built behind a switch)

- **Opt-in:** for signed-in players, Account and Settings show "Email me the weekly challenge and prizes (at most 2 a
  week)". It is off by default, and ticking it also requires "I'm 18 or older".
  - The email address comes from the signed-in account, never typed in.
  - Stored in `email_optins`: user_id, email, opted_in_at, unsubscribed_at, unsubscribe token.
- **Every email** carries the owner-approved subject and body, a link back to the hub tagged
  `utm_source=email&utm_medium=email&utm_campaign=<message id>`, a one-tap unsubscribe link (`/unsubscribe?t=…`, which
  needs no sign-in), and the business name and mailing address in the footer.
- **Sending** uses the same `run` sender, `email` channel, cap and quiet hours. The planned sender is Lovable's managed
  email from notify.pawtasticacademy.com, as Graduation Day already uses, pending gate 1 in section 10.
- **Unsubscribing** takes effect immediately and is never undone automatically.

## 7. M4: weekly approval routine

- The existing Thursday check-in already asks the owner to approve next week's Graduation Day prizes. It will also draft
  Monday's `weekly` message (push text, plus the email text once M3 is on), using only approved prizes and real team
  results.
- **After the owner says yes:** the message is stored with `approved_at`, `approved_by` ("Phil (owner), approved in
  chat") and `send_at` Monday 10:00 New York time. The scheduler sends it.
- **If there's no yes:** nothing is sent that week.
- Announcements follow the same path: draft, the owner's yes, then scheduled.

## 8. Measurement (reported as counts only)

- Opt-ins: card shown, accepted, declined, blocked, needs install. Email opt-ins and unsubscribes.
- Per message: deliveries, opens (`notify_open`), and the visits and booking clicks that followed, which stay clicks.
- Per ad campaign: first sessions, returning devices and booking clicks by first-touch campaign.

## 9. Error handling and safety

- The sender is idempotent. Delivery rows are written before sending, so a crashed run never sends twice. A message
  stuck in `sending` for more than 30 minutes resumes where it stopped.
- Push services' errors are stored without endpoints in logs.
- The run endpoint rejects a missing or wrong secret (401) and changes nothing.
- Without an approved, due message the sender sends nothing, by design.
- The subscribe and unsubscribe routes reject unknown push hosts, oversize payloads and more than 3 subscriptions per
  device.
- No third-party trackers are added. Ads are measured with the hub's own events.

## 10. Owner actions and gates

1. **Email permission:** confirm, with Lovable or ChatGPT, that Lovable's managed email may send opt-in product-update
   emails, not only account emails. If it may not, pick an email service. That means a new account, so it's the
   owner's decision.
2. **Mailing address** for the email footer, required by US email law: which business address to show.
3. **Email set-up in the hub project** with the notify.pawtasticacademy.com sender, done in Lovable.
4. **Connect play.pawtasticacademy.com** in Lovable before ads run. The scheduler's address and the Stripe webhook URL
   are updated together when it changes.
5. **Review the privacy page text** before it's published.
6. **Approve each message** (section 7).

M3's switch stays off until gates 1–3 are done. M1, M2 and M4 need only gates 4–6.

## 11. Testing

- **Unit tests:**
  - campaign-tag cleaning and first touch
  - week boundaries and quiet hours in New York time, including the daylight-saving change
  - weekly cap
  - approval gate: never send without `approved_at`
  - path and length rules
  - push-host allowlist
  - VAPID token signing
  - payload encryption checked against the RFC 8291 Appendix A test vector
- **Sender integration test:** a local stand-in push service decrypts what the sender produces with the test
  subscription's keys and checks the title, body and link. Also covers 410 disables a subscription, a retry after a
  crash doesn't double-send, and the wrong run secret gets a 401.
- **Browser tests (Playwright, phone size):**
  - the card appears only after a good moment
  - Notify me grants permission and the subscription is saved
  - No thanks and the 14-day return
  - iPhone not installed shows the Add to Home Screen steps
  - the Settings switch turns notifications off and unsubscribes
  - a notification click opens the right page and records `notify_open`
  - the email checkbox needs the 18+ tick, and the unsubscribe link works without signing in
- **Regression:** the existing hub, daycare, teams, cloud and payment suites stay green. Type check and build pass in
  both repos.
- **Real-device check by the owner:** one Android or computer test, and one installed-iPhone test, with an owner-approved
  test message sent to the owner's own subscription only.

## 12. Out of scope (for now)

- Notifications on Graduation Day's own site.
- Text messages (SMS).
- Ad accounts, ad pixels and paid creative tools. Ads run in the owner's own accounts, and the owner sets the budget.
- Automated "we miss you" messages for lapsed players.
- Personalised or per-player message content.
