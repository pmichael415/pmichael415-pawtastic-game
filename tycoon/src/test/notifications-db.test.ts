// @vitest-environment node
// Notifications database (migration 0007): privacy, the approval gate, once-only claims, the weekly cap of
// 2 distinct messages per person, audience-limited test messages, and opt-outs that stick.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { pgHelpers, setupDb } from "./pg";

const U1 = "00000000-0000-0000-0000-000000000001";
const U2 = "00000000-0000-0000-0000-000000000002";
const W = "2026-11-02";
const P256 = "B" + "A".repeat(86); // 87 chars like a real base64url P-256 key
const AUTH = "A".repeat(22);
let db: PGlite;
let h: ReturnType<typeof pgHelpers>;

const svc = <T>(fn: () => Promise<T>) => h.as("service_role", null, fn);
const sub = (endpoint: string, device: string, user: string | null = null) =>
  svc(() => h.one<{ id: string }>(`SELECT public.notify_subscribe($1, $2, $3, $4, $5::uuid) AS id`, [endpoint, P256, AUTH, device, user]));
let n = 0;
async function msg(o: { status?: string; path?: string; channels?: string; audience?: string | null; approved?: boolean } = {}) {
  n += 1;
  const approved = o.approved ?? true;
  return svc(() =>
    h.one<{ id: string }>(
      `INSERT INTO public.notify_messages(kind, title, body, path, channels, email_subject, email_body, audience_user, send_at, approved_at, approved_by, status)
       VALUES ('weekly', $1, 'New week!', $2, $3::text[], 'New week', 'Play now', $4::uuid, now() - interval '1 minute',
               CASE WHEN $5 THEN now() ELSE NULL END, CASE WHEN $5 THEN 'test' ELSE NULL END, $6) RETURNING id`,
      [`Message ${n}`, o.path ?? "/", o.channels ?? "{push}", o.audience ?? null, approved, o.status ?? (approved ? "scheduled" : "draft")],
    ),
  ).then((r) => r.id);
}
const start = () => svc(() => h.rows<{ id: string }>(`SELECT id FROM public.notify_start_next(now())`));
const claimPush = (m: string, week = W, limit = 500) =>
  svc(() => h.rows<{ subscription_id: string; endpoint: string }>(`SELECT * FROM public.notify_claim_push($1::uuid, $2::date, $3)`, [m, week, limit]));
const claimEmail = (m: string, week = W, limit = 500) =>
  svc(() => h.rows<{ user_id: string; email: string; unsub_token: string }>(`SELECT * FROM public.notify_claim_email($1::uuid, $2::date, $3)`, [m, week, limit]));
const mark = (m: string, ch: string, target: string, status = "sent") =>
  svc(() => db.query(`SELECT public.notify_mark($1::uuid, $2, $3, $4, NULL)`, [m, ch, target, status]));
const sendAll = async (m: string, week = W) => {
  // simulate a full send: start, claim, mark sent
  await svc(() => db.query(`UPDATE public.notify_messages SET status = 'sending' WHERE id = $1`, [m]));
  for (const c of await claimPush(m, week)) await mark(m, "push", c.subscription_id);
};

beforeAll(async () => {
  db = await setupDb();
  h = pgHelpers(db);
}, 60_000);

describe("notifications database is private", () => {
  const tables = ["push_subscriptions", "email_optins", "notify_messages", "notify_deliveries", "notify_keys", "notify_config"];
  it("players and visitors can't read or write any notification table", async () => {
    for (const role of ["anon", "authenticated"] as const)
      for (const t of tables) expect(await h.fails(h.as(role, U1, () => db.query(`SELECT * FROM public.${t}`)))).toMatch(/permission denied/);
  });
  it("players can't run the sender's functions", async () => {
    expect(await h.fails(h.as("authenticated", U1, () => db.query(`SELECT * FROM public.notify_start_next(now())`)))).toMatch(/permission denied/);
    expect(await h.fails(h.as("anon", null, () => db.query(`SELECT * FROM public.notify_get_keys()`)))).toMatch(/permission denied/);
  });
});

describe("messages need the owner's approval and follow the rules", () => {
  it("an unapproved message can't be scheduled", async () => {
    expect(await h.fails(msg({ approved: false, status: "scheduled" }))).toMatch(/check/);
  });
  it("links must be plain hub paths", async () => {
    for (const p of ["//evil.com", "https://x", "/Recess", "/a b", "recess"]) expect(await h.fails(msg({ path: p }))).toMatch(/check/);
    expect(await h.fails(msg({ path: "/recess" }))).toBeNull();
  });
  it("titles over 50 and bodies over 140 characters are refused", async () => {
    expect(
      await h.fails(svc(() => db.query(`INSERT INTO public.notify_messages(kind,title,body,path,channels,send_at) VALUES ('weekly',$1,'b','/','{push}',now())`, ["x".repeat(51)]))),
    ).toMatch(/check/);
    expect(
      await h.fails(svc(() => db.query(`INSERT INTO public.notify_messages(kind,title,body,path,channels,send_at) VALUES ('weekly','t',$1,'/','{push}',now())`, ["x".repeat(141)]))),
    ).toMatch(/check/);
  });
  it("a draft is never picked up by the sender", async () => {
    await svc(() => db.query(`UPDATE public.notify_messages SET status = 'sent'`));
    await msg({ approved: false });
    expect(await start()).toHaveLength(0);
  });
});

describe("subscriptions", () => {
  it("subscribing twice with the same endpoint keeps one row", async () => {
    await sub("https://fcm.googleapis.com/fcm/send/TWICE", "devtwice1");
    await sub("https://fcm.googleapis.com/fcm/send/TWICE", "devtwice1");
    expect((await svc(() => h.one<{ n: number }>(`SELECT count(*)::int AS n FROM public.push_subscriptions WHERE endpoint LIKE '%TWICE'`))).n).toBe(1);
  });
  it("a device keeps at most 3 active subscriptions (the newest)", async () => {
    for (const k of [1, 2, 3, 4]) await sub(`https://fcm.googleapis.com/fcm/send/CAP${k}`, "devcap001");
    const active = await svc(() =>
      h.rows<{ endpoint: string }>(`SELECT endpoint FROM public.push_subscriptions WHERE device_id = 'devcap001' AND disabled_at IS NULL ORDER BY endpoint`),
    );
    expect(active.map((r) => r.endpoint.slice(-4))).toEqual(["CAP2", "CAP3", "CAP4"]);
  });
  it("unsubscribing disables the subscription", async () => {
    await sub("https://fcm.googleapis.com/fcm/send/GONE", "devgone01");
    expect((await svc(() => h.one<{ ok: boolean }>(`SELECT public.notify_unsubscribe($1) AS ok`, ["https://fcm.googleapis.com/fcm/send/GONE"]))).ok).toBe(true);
    const r = await svc(() => h.one<{ off: boolean }>(`SELECT disabled_at IS NOT NULL AS off FROM public.push_subscriptions WHERE endpoint LIKE '%GONE'`));
    expect(r.off).toBe(true);
  });
});

describe("claiming deliveries", () => {
  it("each subscription gets a message once, even if two sender runs overlap", async () => {
    await svc(() => db.query(`UPDATE public.push_subscriptions SET disabled_at = now()`));
    for (const k of [1, 2, 3]) await sub(`https://fcm.googleapis.com/fcm/send/ONCE${k}`, `devonce0${k}`);
    const m = await msg();
    expect((await start()).map((r) => r.id)).toEqual([m]);
    const [a, b] = await Promise.all([claimPush(m), claimPush(m)]);
    const ids = [...a, ...b].map((r) => r.subscription_id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(await claimPush(m)).toHaveLength(0);
  });

  it("nobody gets more than 2 different messages a week, but one message by push and email counts once", async () => {
    await svc(() => db.query(`UPDATE public.push_subscriptions SET disabled_at = now()`));
    await svc(() => db.query(`UPDATE public.notify_messages SET status = 'cancelled' WHERE status IN ('draft', 'scheduled', 'sending')`));
    await sub("https://fcm.googleapis.com/fcm/send/CAPU1", "devcapu01", U1);
    await svc(() => db.query(`SELECT public.notify_set_email_optin($1::uuid, 'u1@example.com', true, true)`, [U1]));
    const m1 = await msg({ channels: "{push,email}" });
    await svc(() => db.query(`UPDATE public.notify_messages SET status = 'sending' WHERE id = $1`, [m1]));
    const e1 = await claimEmail(m1, "2026-11-09");
    expect(e1).toHaveLength(1);
    await mark(m1, "email", U1);
    const p1 = await claimPush(m1, "2026-11-09");
    expect(p1).toHaveLength(1); // same message on the second channel still allowed
    await mark(m1, "push", p1[0]!.subscription_id);
    const m2 = await msg();
    await sendAll(m2, "2026-11-09"); // second distinct message: allowed
    const m3 = await msg();
    await svc(() => db.query(`UPDATE public.notify_messages SET status = 'sending' WHERE id = $1`, [m3]));
    expect(await claimPush(m3, "2026-11-09")).toHaveLength(0); // third distinct message this week: capped
    expect(await claimPush(m3, "2026-11-16")).toHaveLength(1); // next week: allowed again
  });

  it("a test message reaches only its audience", async () => {
    await svc(() => db.query(`UPDATE public.push_subscriptions SET disabled_at = now()`));
    await sub("https://fcm.googleapis.com/fcm/send/AUD1", "devaud001", U1);
    await sub("https://fcm.googleapis.com/fcm/send/AUD2", "devaud002", U2);
    const m = await msg({ audience: U2 });
    await svc(() => db.query(`UPDATE public.notify_messages SET status = 'sending' WHERE id = $1`, [m]));
    const c = await claimPush(m, "2026-11-23");
    expect(c.map((r) => r.endpoint.slice(-4))).toEqual(["AUD2"]);
  });

  it("disabled subscriptions and unsubscribed emails are never claimed", async () => {
    await svc(() => db.query(`UPDATE public.push_subscriptions SET disabled_at = now()`));
    const tok = await svc(() =>
      h.one<{ t: string }>(`SELECT unsub_token::text AS t FROM public.email_optins WHERE user_id = $1`, [U1]),
    );
    expect((await svc(() => h.one<{ ok: boolean }>(`SELECT public.notify_email_unsubscribe($1::uuid) AS ok`, [tok.t]))).ok).toBe(true);
    expect((await svc(() => h.one<{ ok: boolean }>(`SELECT public.notify_email_unsubscribe($1::uuid) AS ok`, [tok.t]))).ok).toBe(true);
    const m = await msg({ channels: "{push,email}" });
    await svc(() => db.query(`UPDATE public.notify_messages SET status = 'sending' WHERE id = $1`, [m]));
    expect(await claimPush(m, "2026-11-30")).toHaveLength(0);
    expect(await claimEmail(m, "2026-11-30")).toHaveLength(0);
  });

  it("email opt-in needs the 18+ confirmation", async () => {
    expect(await h.fails(svc(() => db.query(`SELECT public.notify_set_email_optin($1::uuid, 'u2@example.com', true, false)`, [U2])))).toMatch(/18|adult|check/i);
  });
});

describe("sender bookkeeping", () => {
  it("a gone subscription is disabled; 5 failures in a row disable it; a success resets the count", async () => {
    const g = await sub("https://fcm.googleapis.com/fcm/send/BOOK1", "devbook01");
    await svc(() => db.query(`SELECT public.notify_push_result($1::uuid, false, true)`, [g.id]));
    expect((await svc(() => h.one<{ off: boolean }>(`SELECT disabled_at IS NOT NULL AS off FROM public.push_subscriptions WHERE id = $1`, [g.id]))).off).toBe(true);
    const f = await sub("https://fcm.googleapis.com/fcm/send/BOOK2", "devbook02");
    for (let i = 0; i < 4; i++) await svc(() => db.query(`SELECT public.notify_push_result($1::uuid, false, false)`, [f.id]));
    await svc(() => db.query(`SELECT public.notify_push_result($1::uuid, true, false)`, [f.id]));
    for (let i = 0; i < 4; i++) await svc(() => db.query(`SELECT public.notify_push_result($1::uuid, false, false)`, [f.id]));
    expect((await svc(() => h.one<{ off: boolean }>(`SELECT disabled_at IS NOT NULL AS off FROM public.push_subscriptions WHERE id = $1`, [f.id]))).off).toBe(false);
    await svc(() => db.query(`SELECT public.notify_push_result($1::uuid, false, false)`, [f.id]));
    expect((await svc(() => h.one<{ off: boolean }>(`SELECT disabled_at IS NOT NULL AS off FROM public.push_subscriptions WHERE id = $1`, [f.id]))).off).toBe(true);
  });
  it("keys are created once and never replaced", async () => {
    await svc(() => db.query(`SELECT public.notify_init_keys('pub1', '{"k":1}'::jsonb, 'secret1')`));
    await svc(() => db.query(`SELECT public.notify_init_keys('pub2', '{"k":2}'::jsonb, 'secret2')`));
    const k = await svc(() => h.one<{ vapid_public: string; run_secret: string }>(`SELECT * FROM public.notify_get_keys()`));
    expect(k).toMatchObject({ vapid_public: "pub1", run_secret: "secret1" });
  });
  it("game events accept the new notification event names", async () => {
    for (const name of ["notify_prompt", "notify_optin", "notify_open", "email_optin"])
      expect(
        await h.fails(
          svc(() =>
            db.query(
              `INSERT INTO public.game_events(client_at, device_id, cohort_day, session_id, build, name) VALUES (now(),'abcdefgh','2026-11-01','abcdefgh','b',$1)`,
              [name],
            ),
          ),
        ),
      ).toBeNull();
  });
});
