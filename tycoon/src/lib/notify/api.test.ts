// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { pgHelpers, pgRpc, setupDb } from "@/test/pg";
import { b64url } from "./webpush";
import { getNotifyKeys } from "./sender.server";
import { handleEmailUnsubscribe, handleKey, handleRun, handleSubscribe, handleUnsubscribe } from "./api.server";

const U1 = "00000000-0000-0000-0000-000000000001";
let db: PGlite;
let h: ReturnType<typeof pgHelpers>;

function keys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: b64url(new Uint8Array(ecdh.getPublicKey())), auth: b64url(new Uint8Array(randomBytes(16))) };
}
const body = (o: Record<string, unknown>) => JSON.stringify(o);
const good = (endpoint = "https://fcm.googleapis.com/fcm/send/api-1") => ({ endpoint, keys: keys(), deviceId: "3f2b9c1e-0000-4000-8000-000000000001" });
const count = async (like: string) =>
  (await h.as("service_role", null, () => h.one<{ n: number }>(`SELECT count(*)::int AS n FROM public.push_subscriptions WHERE endpoint LIKE $1`, [like]))).n;

beforeAll(async () => {
  db = await setupDb();
  h = pgHelpers(db);
}, 60_000);

describe("subscribe", () => {
  it("stores a valid subscription and links it to the signed-in player", async () => {
    const r = await handleSubscribe(body(good()), pgRpc(db), U1);
    expect(r.status).toBe(201);
    const row = await h.as("service_role", null, () =>
      h.one<{ user_id: string }>(`SELECT user_id::text FROM public.push_subscriptions WHERE endpoint LIKE '%api-1'`),
    );
    expect(row.user_id).toBe(U1);
  });

  it("subscribing twice keeps one subscription", async () => {
    const b = good("https://fcm.googleapis.com/fcm/send/api-twice");
    expect((await handleSubscribe(body(b), pgRpc(db), null)).status).toBe(201);
    expect((await handleSubscribe(body(b), pgRpc(db), null)).status).toBe(201);
    expect(await count("%api-twice")).toBe(1);
  });

  it("refuses anything that isn't a real browser subscription, and stores nothing", async () => {
    const bad: [string, string][] = [
      ["evil host", body({ ...good(), endpoint: "https://evil.com/api-bad" })],
      ["short p256dh", body({ ...good("https://fcm.googleapis.com/fcm/send/api-bad1"), keys: { ...keys(), p256dh: b64url(new Uint8Array(33)) } })],
      ["not a point", body({ ...good("https://fcm.googleapis.com/fcm/send/api-bad2"), keys: { ...keys(), p256dh: b64url(new Uint8Array(65).fill(7)) } })],
      ["short auth", body({ ...good("https://fcm.googleapis.com/fcm/send/api-bad3"), keys: { ...keys(), auth: b64url(new Uint8Array(8)) } })],
      ["bad device", body({ ...good("https://fcm.googleapis.com/fcm/send/api-bad4"), deviceId: "x" })],
      ["not json", "{nope"],
      ["too big", body({ ...good("https://fcm.googleapis.com/fcm/send/api-bad5"), pad: "x".repeat(5000) })],
    ];
    for (const [why, raw] of bad) expect((await handleSubscribe(raw, pgRpc(db), null)).status, why).toBe(400);
    expect(await count("%api-bad%")).toBe(0);
  });
});

describe("unsubscribe", () => {
  it("turns the subscription off", async () => {
    const b = good("https://fcm.googleapis.com/fcm/send/api-off");
    await handleSubscribe(body(b), pgRpc(db), null);
    expect((await handleUnsubscribe(body({ endpoint: b.endpoint }), pgRpc(db))).status).toBe(200);
    const row = await h.as("service_role", null, () =>
      h.one<{ off: boolean }>(`SELECT disabled_at IS NOT NULL AS off FROM public.push_subscriptions WHERE endpoint LIKE '%api-off'`),
    );
    expect(row.off).toBe(true);
  });
});

describe("public key", () => {
  it("serves the public signing key, never the private one", async () => {
    const r = await handleKey(pgRpc(db));
    const j = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(j)).toEqual(["publicKey"]);
    expect(j["publicKey"]).toBe((await getNotifyKeys(pgRpc(db))).keys.publicKey);
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });
});

describe("run (the scheduler's call)", () => {
  const req = (secret?: string) => new Request("https://hub.example/api/public/notifications/run", { method: "POST", headers: secret ? { "x-notify-run": secret } : {} });
  it("refuses a missing or wrong secret and changes nothing", async () => {
    const id = await h.as("service_role", null, () =>
      h.one<{ id: string }>(
        `INSERT INTO public.notify_messages(kind,title,body,path,channels,send_at,approved_at,approved_by,status)
         VALUES ('weekly','t','b','/','{push}', now() - interval '1 hour', now(), 'test', 'scheduled') RETURNING id`,
      ),
    );
    expect((await handleRun(req(), pgRpc(db), Date.parse("2026-11-09T15:00:00Z"), null)).status).toBe(401);
    expect((await handleRun(req("wrong-secret"), pgRpc(db), Date.parse("2026-11-09T15:00:00Z"), null)).status).toBe(401);
    const st = await h.as("service_role", null, () => h.one<{ status: string }>(`SELECT status FROM public.notify_messages WHERE id = $1`, [id.id]));
    expect(st.status).toBe("scheduled");
  });
  it("with the right secret, runs the sender and reports what it did", async () => {
    const { runSecret } = await getNotifyKeys(pgRpc(db));
    const r = await handleRun(req(runSecret), pgRpc(db), Date.parse("2026-11-10T01:30:00Z"), null); // 20:30 EST
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ quiet: true, message: null });
  });
});

describe("email unsubscribe", () => {
  const TOKEN = "6f1d2c3b-0000-4000-8000-000000000009";
  it("confirms only when the unsubscribe was saved", async () => {
    const down = { rpc: async () => ({ data: null, error: new Error("db down") }) };
    expect((await handleEmailUnsubscribe(JSON.stringify({ token: TOKEN }), down)).status).toBe(503);
    const up = { rpc: async () => ({ data: false, error: null }) };
    expect((await handleEmailUnsubscribe(JSON.stringify({ token: TOKEN }), up)).status).toBe(200); // unknown token: same answer
  });
  it("ignores malformed tokens without touching the database", async () => {
    let calls = 0;
    const db = { rpc: async () => ((calls += 1), { data: true, error: null }) };
    for (const raw of ["{nope", JSON.stringify({ token: "x" }), JSON.stringify({})]) expect((await handleEmailUnsubscribe(raw, db)).status).toBe(200);
    expect(calls).toBe(0);
  });
  it("really unsubscribes on the real database", async () => {
    await h.as("service_role", null, () => db.query(`SELECT public.notify_set_email_optin($1::uuid, 'u1@example.com', true, true)`, [U1]));
    const t = await h.as("service_role", null, () => h.one<{ t: string }>(`SELECT unsub_token::text AS t FROM public.email_optins WHERE user_id = $1`, [U1]));
    expect((await handleEmailUnsubscribe(JSON.stringify({ token: t.t }), pgRpc(db))).status).toBe(200);
    const row = await h.as("service_role", null, () => h.one<{ off: boolean }>(`SELECT unsubscribed_at IS NOT NULL AS off FROM public.email_optins WHERE user_id = $1`, [U1]));
    expect(row.off).toBe(true);
  });
});
