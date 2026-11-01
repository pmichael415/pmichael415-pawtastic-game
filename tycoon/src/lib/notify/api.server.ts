// Request handlers for the notification routes (kept framework-free so they can be tested on a real database).
import { isAllowedPushEndpoint } from "./rules";
import { fromB64url } from "./webpush";
import { getNotifyKeys, runSender, type EmailTransport, type NotifyRpc } from "./sender.server";

const MAX_BODY = 4096;
const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

function parse(raw: string): Record<string, unknown> | null {
  if (raw.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function bytes(v: unknown): Uint8Array | null {
  if (typeof v !== "string" || v.length > 200 || !/^[A-Za-z0-9_-]+$/.test(v)) return null;
  try {
    return fromB64url(v);
  } catch {
    return null;
  }
}

export async function handleSubscribe(raw: string, db: NotifyRpc, userId: string | null): Promise<Response> {
  const b = parse(raw);
  const endpoint = b?.["endpoint"];
  const k = (b?.["keys"] ?? {}) as Record<string, unknown>;
  const deviceId = b?.["deviceId"];
  const p256dh = bytes(k["p256dh"]);
  const auth = bytes(k["auth"]);
  if (
    typeof endpoint !== "string" ||
    endpoint.length > 1000 ||
    !isAllowedPushEndpoint(endpoint) ||
    !p256dh ||
    p256dh.length !== 65 ||
    p256dh[0] !== 4 ||
    !auth ||
    auth.length !== 16 ||
    typeof deviceId !== "string" ||
    !/^[A-Za-z0-9-]{8,64}$/.test(deviceId)
  )
    return json(400, { error: "invalid subscription" });
  const { error } = await db.rpc("notify_subscribe", { _endpoint: endpoint, _p256dh: k["p256dh"], _auth: k["auth"], _device: deviceId, _user: userId });
  if (error) return json(500, { error: "could not save" });
  return json(201, { ok: true });
}

export async function handleUnsubscribe(raw: string, db: NotifyRpc): Promise<Response> {
  const endpoint = parse(raw)?.["endpoint"];
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !isAllowedPushEndpoint(endpoint)) return json(400, { error: "invalid" });
  const { error } = await db.rpc("notify_unsubscribe", { _endpoint: endpoint });
  if (error) return json(500, { error: "could not save" });
  return json(200, { ok: true });
}

export async function handleKey(db: NotifyRpc): Promise<Response> {
  const { keys } = await getNotifyKeys(db);
  return json(200, { publicKey: keys.publicKey }, { "Cache-Control": "public, max-age=3600" });
}

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function handleRun(
  req: Request,
  db: NotifyRpc,
  now: number,
  email: { transport: EmailTransport; mailingAddress: string; origin: string } | null,
  maxRequests?: number,
): Promise<Response> {
  const given = req.headers.get("x-notify-run") ?? "";
  const { runSecret } = await getNotifyKeys(db);
  if (!given || !sameSecret(given, runSecret)) return json(401, { error: "unauthorized" });
  const summary = await runSender({ db, now, email, ...(maxRequests ? { maxRequests } : {}) });
  return json(200, summary);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The unsubscribe button. Same answer for unknown or malformed tokens; 503 only when saving failed, so the page never
 *  confirms an unsubscribe that didn't happen. */
export async function handleEmailUnsubscribe(raw: string, db: NotifyRpc): Promise<Response> {
  const token = parse(raw.slice(0, 512))?.["token"];
  if (typeof token !== "string" || !UUID_RE.test(token)) return json(200, { ok: true });
  const { error } = await db.rpc("notify_email_unsubscribe", { _token: token });
  if (error) return json(503, { error: "try again" });
  return json(200, { ok: true });
}
