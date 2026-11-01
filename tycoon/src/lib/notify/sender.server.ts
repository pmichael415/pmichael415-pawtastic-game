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
  bookkeepingErrors: number;
};
type Message = { id: string; title: string; body: string; path: string; channels: string[]; email_subject: string | null; email_body: string | null };

export const VAPID_SUBJECT = "mailto:info@pawtasticacademy.com";
const SLICE = 20; // people claimed and sent to at a time
// Outgoing requests one run may make (Cloudflare caps them per request: 50 on the free plan). Raise with
// NOTIFY_MAX_SUBREQUESTS once the hosting plan's limit is known.
const DEFAULT_MAX_REQUESTS = 40;

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

/**
 * One sender run. People are claimed a slice at a time (claiming is at-most-once), so a run that dies strands at most
 * one slice and never resends to it. Bookkeeping failures are counted, not fatal. A run stops within its request
 * budget (Cloudflare limits outgoing requests per request) and its time budget; the next run carries on. A message
 * finishes only when a claim finds nobody eligible left.
 */
export async function runSender(d: {
  db: NotifyRpc;
  now: number;
  fetchImpl?: typeof fetch;
  email?: { transport: EmailTransport; mailingAddress: string; origin: string } | null;
  slice?: number;
  maxRequests?: number;
  budgetMs?: number;
}): Promise<RunSummary> {
  const sum: RunSummary = {
    quiet: false,
    message: null,
    push: { sent: 0, gone: 0, failed: 0 },
    email: { sent: 0, failed: 0 },
    done: false,
    bookkeepingErrors: 0,
  };
  if (inQuietHours(d.now)) return { ...sum, quiet: true };
  const slice = d.slice ?? SLICE;
  const maxRequests = d.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const deadline = Date.now() + (d.budgetMs ?? 25_000);
  let used = 0;
  const rpc = <T>(name: string, args: Record<string, unknown> = {}) => {
    used += 1;
    return call<T>(d.db, name, args);
  };
  const room = () => used + slice + 2 <= maxRequests && Date.now() < deadline; // claim + sends + record

  const nowIso = new Date(d.now).toISOString();
  const msg = (await rpc<Message[]>("notify_start_next", { _now: nowIso }))[0];
  if (!msg) return sum;
  sum.message = msg.id;
  const week = nyWeekStart(d.now);
  const record = async (channel: "push" | "email", results: { target: string; status: string; error: string | null }[]) => {
    if (!results.length) return;
    try {
      await rpc("notify_record_results", { _message: msg.id, _channel: channel, _results: results });
    } catch {
      sum.bookkeepingErrors += 1; // those people were still sent to once; they're never sent to again
    }
  };

  let pushLeft = msg.channels.includes("push");
  if (pushLeft) {
    used += 1;
    const { keys } = await getNotifyKeys(d.db);
    const payload = { title: msg.title, body: msg.body, url: campaignUrl(msg.path, msg.id, "push"), tag: msg.id };
    while (pushLeft && room()) {
      const targets = await rpc<{ subscription_id: string; endpoint: string; p256dh: string; auth: string }[]>("notify_claim_push", {
        _message: msg.id,
        _week: week,
        _limit: slice,
      });
      if (!targets.length) {
        pushLeft = false;
        break;
      }
      used += targets.length;
      const results = await Promise.all(
        targets.map(async (t) => {
          let code: number | null = null;
          try {
            code = await sendWebPush(t, payload, keys, VAPID_SUBJECT, d.fetchImpl);
          } catch {
            code = null;
          }
          const ok = code !== null && code >= 200 && code < 300;
          const gone = code === 404 || code === 410;
          if (ok) sum.push.sent++;
          else if (gone) sum.push.gone++;
          else sum.push.failed++;
          return { target: t.subscription_id, status: ok ? "sent" : gone ? "gone" : "failed", error: ok ? null : code === null ? "network" : `HTTP ${code}` };
        }),
      );
      await record("push", results);
    }
  }

  let emailLeft = msg.channels.includes("email") && !!d.email && !!msg.email_subject && !!msg.email_body;
  if (emailLeft && d.email) {
    const e = d.email;
    while (emailLeft && room()) {
      const targets = await rpc<{ user_id: string; email: string; unsub_token: string }[]>("notify_claim_email", {
        _message: msg.id,
        _week: week,
        _limit: slice,
      });
      if (!targets.length) {
        emailLeft = false;
        break;
      }
      used += targets.length;
      const results = await Promise.all(
        targets.map(async (t) => {
          const c = emailContent({ id: msg.id, email_subject: msg.email_subject!, email_body: msg.email_body!, path: msg.path }, t.unsub_token, e.mailingAddress, e.origin);
          let ok = false;
          try {
            ok = (await e.transport({ to: t.email, ...c, idempotencyKey: `notify-${msg.id}-${t.user_id}` })) === "sent";
          } catch {
            ok = false;
          }
          if (ok) sum.email.sent++;
          else sum.email.failed++;
          return { target: t.user_id, status: ok ? "sent" : "failed", error: ok ? null : "email not sent" };
        }),
      );
      await record("email", results);
    }
  }

  if (!pushLeft && !emailLeft) {
    await rpc("notify_finish", { _message: msg.id, _now: nowIso });
    sum.done = true;
  }
  return sum;
}
