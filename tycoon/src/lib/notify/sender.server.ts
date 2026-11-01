// Sends owner-approved notifications. All the rules that must never break live in the database functions
// (migration 0007): only approved messages, each subscription/email once, at most 2 distinct messages per person per
// New York week. This file adds quiet hours, encryption and bookkeeping. Never logs endpoints or addresses.
import { campaignUrl } from "./rules";
import { inQuietHours, nyWeekStart } from "./schedule";
import { b64url, generateVapidKeys, sendWebPush, type VapidKeys } from "./webpush";
import { emailContent, type EmailTransport } from "./email";

export type { EmailTransport } from "./email";
export type NotifyRpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export type RunSummary = {
  quiet: boolean;
  message: string | null;
  push: { sent: number; gone: number; failed: number };
  email: { sent: number; failed: number };
  done: boolean;
};
type Message = { id: string; title: string; body: string; path: string; channels: string[]; email_subject: string | null; email_body: string | null };

export const VAPID_SUBJECT = "mailto:info@pawtasticacademy.com";
const CONCURRENCY = 20;

async function call<T>(db: NotifyRpc, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`notifications: ${name} failed`);
  return data as T;
}

export async function getNotifyKeys(db: NotifyRpc): Promise<{ keys: VapidKeys; runSecret: string }> {
  const read = async () => (await call<{ vapid_public: string; vapid_private_jwk: JsonWebKey; run_secret: string }[]>(db, "notify_get_keys"))[0];
  let row = await read();
  if (!row) {
    const keys = await generateVapidKeys();
    const secret = b64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
    await call(db, "notify_init_keys", { _public: keys.publicKey, _private: keys.privateJwk, _secret: secret });
    row = await read(); // another run may have created them first: always use what's stored
  }
  if (!row) throw new Error("notifications: keys unavailable");
  return { keys: { publicKey: row.vapid_public, privateJwk: row.vapid_private_jwk }, runSecret: row.run_secret };
}

async function inChunks<T>(items: T[], fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
}

export async function runSender(d: {
  db: NotifyRpc;
  now: number;
  fetchImpl?: typeof fetch;
  email?: { transport: EmailTransport; mailingAddress: string; origin: string } | null;
  batch?: number;
}): Promise<RunSummary> {
  const sum: RunSummary = { quiet: false, message: null, push: { sent: 0, gone: 0, failed: 0 }, email: { sent: 0, failed: 0 }, done: false };
  if (inQuietHours(d.now)) return { ...sum, quiet: true };
  const nowIso = new Date(d.now).toISOString();
  const msg = (await call<Message[]>(d.db, "notify_start_next", { _now: nowIso }))[0];
  if (!msg) return sum;
  sum.message = msg.id;
  const week = nyWeekStart(d.now);
  const batch = d.batch ?? 500;
  const wantsPush = msg.channels.includes("push");
  const wantsEmail = msg.channels.includes("email") && !!d.email;
  let pushClaimed = 0;
  let emailClaimed = 0;

  if (wantsPush) {
    const { keys } = await getNotifyKeys(d.db);
    const targets = await call<{ subscription_id: string; endpoint: string; p256dh: string; auth: string }[]>(d.db, "notify_claim_push", {
      _message: msg.id,
      _week: week,
      _limit: batch,
    });
    pushClaimed = targets.length;
    const payload = { title: msg.title, body: msg.body, url: campaignUrl(msg.path, msg.id, "push"), tag: msg.id };
    await inChunks(targets, async (t) => {
      let code: number | null = null;
      try {
        code = await sendWebPush(t, payload, keys, VAPID_SUBJECT, d.fetchImpl);
      } catch {
        code = null;
      }
      const ok = code !== null && code >= 200 && code < 300;
      const gone = code === 404 || code === 410;
      await call(d.db, "notify_mark", {
        _message: msg.id,
        _channel: "push",
        _target: t.subscription_id,
        _status: ok ? "sent" : gone ? "gone" : "failed",
        _error: ok ? null : code === null ? "network" : `HTTP ${code}`,
      });
      await call(d.db, "notify_push_result", { _subscription: t.subscription_id, _ok: ok, _gone: gone });
      if (ok) sum.push.sent++;
      else if (gone) sum.push.gone++;
      else sum.push.failed++;
    });
  }

  if (wantsEmail && d.email && msg.email_subject && msg.email_body) {
    const e = d.email;
    const targets = await call<{ user_id: string; email: string; unsub_token: string }[]>(d.db, "notify_claim_email", {
      _message: msg.id,
      _week: week,
      _limit: batch,
    });
    emailClaimed = targets.length;
    await inChunks(targets, async (t) => {
      const c = emailContent({ id: msg.id, email_subject: msg.email_subject!, email_body: msg.email_body!, path: msg.path }, t.unsub_token, e.mailingAddress, e.origin);
      let ok = false;
      try {
        ok = (await e.transport({ to: t.email, ...c, idempotencyKey: `notify-${msg.id}-${t.user_id}` })) === "sent";
      } catch {
        ok = false;
      }
      await call(d.db, "notify_mark", { _message: msg.id, _channel: "email", _target: t.user_id, _status: ok ? "sent" : "failed", _error: ok ? null : "email not sent" });
      if (ok) sum.email.sent++;
      else sum.email.failed++;
    });
  }

  if ((!wantsPush || pushClaimed < batch) && (!wantsEmail || emailClaimed < batch)) {
    await call(d.db, "notify_finish", { _message: msg.id, _now: nowIso });
    sum.done = true;
  }
  return sum;
}
