// @vitest-environment node
// The sender against the real notification SQL functions (PGlite) and fake push services that decrypt what they get.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import * as ece from "http_ece";
import type { PGlite } from "@electric-sql/pglite";
import { pgHelpers, pgRpc as basePgRpc, setupDb } from "@/test/pg";
import { b64url } from "./webpush";
import { getNotifyKeys, runSender, type NotifyRpc } from "./sender.server";

const U1 = "00000000-0000-0000-0000-000000000001";
let db: PGlite;
let h: ReturnType<typeof pgHelpers>;
const pgRpc = (fail?: (name: string) => boolean): NotifyRpc => basePgRpc(db, fail);

type Phone = { endpoint: string; ecdh: ReturnType<typeof createECDH>; auth: Buffer; id: string };
async function phone(name: string, user: string | null = null): Promise<Phone> {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const endpoint = `https://fcm.googleapis.com/fcm/send/${name}`;
  const r = await h.as("service_role", null, () =>
    h.one<{ id: string }>(`SELECT public.notify_subscribe($1, $2, $3, $4, $5::uuid) AS id`, [
      endpoint,
      b64url(new Uint8Array(ecdh.getPublicKey())),
      b64url(new Uint8Array(auth)),
      `dev-${name}`.padEnd(8, "x"),
      user,
    ]),
  );
  return { endpoint, ecdh, auth, id: r.id };
}

/** Fake push services: record every request, answer with a chosen status (or throw). */
function pushServices(answer: (endpoint: string) => number | "throw" = () => 201) {
  const calls: { endpoint: string; body: Uint8Array }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ endpoint: url, body: init.body as Uint8Array });
    const a = answer(url);
    if (a === "throw") throw new Error("network down");
    return new Response(null, { status: a });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const decrypt = (p: Phone, body: Uint8Array) =>
  JSON.parse(ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: p.ecdh, authSecret: p.auth }).toString());

async function message(o: { sendAt: string; approved?: boolean; path?: string; channels?: string } ) {
  const approved = o.approved ?? true;
  const r = await h.as("service_role", null, () =>
    h.one<{ id: string }>(
      `INSERT INTO public.notify_messages(kind, title, body, path, channels, email_subject, email_body, send_at, approved_at, approved_by, status)
       VALUES ('weekly', 'New week, new prizes!', 'Team Hawthorne vs Team Hillsdale starts now.', $1, $2::text[], 'New week', 'Play now',
               $3::timestamptz, CASE WHEN $4 THEN now() ELSE NULL END, CASE WHEN $4 THEN 'Phil (owner), approved in chat' ELSE NULL END,
               CASE WHEN $4 THEN 'scheduled' ELSE 'draft' END) RETURNING id`,
      [o.path ?? "/", o.channels ?? "{push}", o.sendAt, approved],
    ),
  );
  return r.id;
}
const status = async (id: string) =>
  (await h.as("service_role", null, () => h.one<{ status: string }>(`SELECT status FROM public.notify_messages WHERE id = $1`, [id]))).status;
const at = (iso: string) => Date.parse(iso);
const MON_10 = "2026-11-09T15:00:00Z"; // Monday 10:00 EST

beforeAll(async () => {
  db = await setupDb();
  h = pgHelpers(db);
}, 60_000);

beforeEach(async () => {
  await h.as("service_role", null, async () => {
    await db.exec(`UPDATE public.notify_messages SET status = 'cancelled' WHERE status <> 'sent'`);
    await db.exec(`UPDATE public.push_subscriptions SET disabled_at = now() WHERE disabled_at IS NULL`);
    await db.exec(`DELETE FROM public.notify_deliveries`);
    await db.exec(`DELETE FROM public.email_optins`);
  });
});

describe("notification keys", () => {
  it("are created once on first use and reused after that", async () => {
    const a = await getNotifyKeys(pgRpc());
    const b = await getNotifyKeys(pgRpc());
    expect(a.keys.publicKey).toBe(b.keys.publicKey);
    expect(a.runSecret).toBe(b.runSecret);
    expect(a.runSecret.length).toBeGreaterThanOrEqual(43);
  });
});

describe("only approved, due messages are sent", () => {
  it("a draft due in the past sends nothing", async () => {
    await phone("draft1");
    await message({ sendAt: "2026-11-09T14:00:00Z", approved: false });
    const s = pushServices();
    const r = await runSender({ db: pgRpc(), now: at(MON_10), fetchImpl: s.fetchImpl });
    expect(s.calls).toHaveLength(0);
    expect(r.message).toBeNull();
  });

  it("an approved message reaches every active phone once, with its text and a tagged link", async () => {
    const p1 = await phone("send1");
    const p2 = await phone("send2");
    const id = await message({ sendAt: "2026-11-09T14:30:00Z", path: "/recess" });
    const s = pushServices();
    const r = await runSender({ db: pgRpc(), now: at(MON_10), fetchImpl: s.fetchImpl });
    expect(r).toMatchObject({ quiet: false, message: id, push: { sent: 2, gone: 0, failed: 0 }, done: true });
    expect(s.calls.map((c) => c.endpoint).sort()).toEqual([p1.endpoint, p2.endpoint].sort());
    const got = decrypt(p1, s.calls.find((c) => c.endpoint === p1.endpoint)!.body);
    expect(got).toEqual({
      title: "New week, new prizes!",
      body: "Team Hawthorne vs Team Hillsdale starts now.",
      url: `/recess?utm_source=notification&utm_medium=push&utm_campaign=${id}`,
      tag: id,
    });
    expect(await status(id)).toBe("sent");
    const again = pushServices();
    await runSender({ db: pgRpc(), now: at(MON_10) + 15 * 60_000, fetchImpl: again.fetchImpl });
    expect(again.calls).toHaveLength(0);
  });
});

describe("quiet hours", () => {
  it("nothing is sent at 8:30 pm New York time", async () => {
    await phone("quiet1");
    await message({ sendAt: "2026-11-09T14:30:00Z" });
    const s = pushServices();
    const r = await runSender({ db: pgRpc(), now: at("2026-11-10T01:30:00Z"), fetchImpl: s.fetchImpl });
    expect(r.quiet).toBe(true);
    expect(s.calls).toHaveLength(0);
  });

  it("a message due at 8:30 am waits until 9:00 and is then sent once", async () => {
    await phone("early1");
    const id = await message({ sendAt: "2026-11-09T13:30:00Z" }); // 08:30 EST
    const s = pushServices();
    await runSender({ db: pgRpc(), now: at("2026-11-09T13:45:00Z"), fetchImpl: s.fetchImpl }); // 08:45
    expect(s.calls).toHaveLength(0);
    await runSender({ db: pgRpc(), now: at("2026-11-09T14:00:00Z"), fetchImpl: s.fetchImpl }); // 09:00
    expect(s.calls).toHaveLength(1);
    await runSender({ db: pgRpc(), now: at("2026-11-09T14:15:00Z"), fetchImpl: s.fetchImpl });
    expect(s.calls).toHaveLength(1);
    expect(await status(id)).toBe("sent");
  });
});

describe("push service answers", () => {
  it("a 410 (gone) disables the phone's subscription", async () => {
    const p = await phone("gone1");
    await message({ sendAt: "2026-11-09T14:30:00Z" });
    const r = await runSender({ db: pgRpc(), now: at(MON_10), fetchImpl: pushServices(() => 410).fetchImpl });
    expect(r.push.gone).toBe(1);
    const row = await h.as("service_role", null, () =>
      h.one<{ off: boolean }>(`SELECT disabled_at IS NOT NULL AS off FROM public.push_subscriptions WHERE id = $1`, [p.id]),
    );
    expect(row.off).toBe(true);
  });

  it("5 failures in a row disable a subscription; failed tries don't use up the weekly cap", async () => {
    const p = await phone("fail1");
    for (let i = 0; i < 5; i++) {
      await message({ sendAt: "2026-11-09T14:30:00Z" });
      const r = await runSender({ db: pgRpc(), now: at(MON_10) + i * 60_000, fetchImpl: pushServices(() => 500).fetchImpl });
      expect(r.push.failed).toBe(1);
    }
    const row = await h.as("service_role", null, () =>
      h.one<{ off: boolean; n: number }>(`SELECT disabled_at IS NOT NULL AS off, failure_count AS n FROM public.push_subscriptions WHERE id = $1`, [p.id]),
    );
    expect(row).toEqual({ off: true, n: 5 });
  });
});

describe("never twice", () => {
  it("a run that stops part-way never resends to anyone it already tried", async () => {
    await phone("crash1");
    await phone("crash2");
    await phone("crash3");
    const id = await message({ sendAt: "2026-11-09T14:30:00Z" });
    const s = pushServices();
    let marks = 0;
    const flaky = pgRpc((name) => name === "notify_mark" && ++marks === 2); // the database fails after the 2nd send
    await expect(runSender({ db: flaky, now: at(MON_10), fetchImpl: s.fetchImpl, batch: 500 })).rejects.toThrow();
    const before = s.calls.length;
    await runSender({ db: pgRpc(), now: at(MON_10) + 15 * 60_000, fetchImpl: s.fetchImpl });
    const perEndpoint = new Map<string, number>();
    for (const c of s.calls) perEndpoint.set(c.endpoint, (perEndpoint.get(c.endpoint) ?? 0) + 1);
    expect([...perEndpoint.values()].every((n) => n === 1)).toBe(true);
    expect(s.calls.length).toBeGreaterThanOrEqual(before);
    expect(await status(id)).toBe("sent");
  });

  it("two overlapping runs send each phone the message exactly once", async () => {
    const phones = await Promise.all(["lap1", "lap2", "lap3", "lap4"].map((n) => phone(n)));
    await message({ sendAt: "2026-11-09T14:30:00Z" });
    const s = pushServices();
    await Promise.all([
      runSender({ db: pgRpc(), now: at(MON_10), fetchImpl: s.fetchImpl }),
      runSender({ db: pgRpc(), now: at(MON_10), fetchImpl: s.fetchImpl }),
    ]);
    expect(s.calls.map((c) => c.endpoint).sort()).toEqual(phones.map((p) => p.endpoint).sort());
  });
});

describe("email channel", () => {
  it("is skipped while email updates are off; the message still finishes", async () => {
    await h.as("service_role", null, () => db.query(`SELECT public.notify_set_email_optin($1::uuid, 'u1@example.com', true, true)`, [U1]));
    const id = await message({ sendAt: "2026-11-09T14:30:00Z", channels: "{push,email}" });
    const r = await runSender({ db: pgRpc(), now: at(MON_10), fetchImpl: pushServices().fetchImpl, email: null });
    expect(r.email).toEqual({ sent: 0, failed: 0 });
    expect(await status(id)).toBe("sent");
  });

  it("when on, each opted-in player gets the approved email with their own unsubscribe link", async () => {
    await h.as("service_role", null, () => db.query(`SELECT public.notify_set_email_optin($1::uuid, 'u1@example.com', true, true)`, [U1]));
    const tok = await h.as("service_role", null, () => h.one<{ t: string }>(`SELECT unsub_token::text AS t FROM public.email_optins WHERE user_id = $1`, [U1]));
    const id = await message({ sendAt: "2026-11-09T14:30:00Z", channels: "{push,email}" });
    const sent: Parameters<import("./email").EmailTransport>[0][] = [];
    const r = await runSender({
      db: pgRpc(),
      now: at(MON_10),
      fetchImpl: pushServices().fetchImpl,
      email: { transport: async (m) => (sent.push(m), "sent"), mailingAddress: "123 Example St, Hawthorne, NJ", origin: "https://play.example.com" },
    });
    expect(r.email).toEqual({ sent: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "u1@example.com", subject: "New week", unsubscribeUrl: `https://play.example.com/unsubscribe?t=${tok.t}` });
    expect(sent[0]!.idempotencyKey).toContain(id);
  });
});
