// @vitest-environment node
// Runs the real migration files on an in-process Postgres (PGlite) with Supabase-style roles,
// then exercises purchases, duplicate webhooks, refunds, failures, RLS isolation and measurement views.
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { setupDb } from "./pg";

const dir = path.resolve(__dirname, "../../drizzle/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const U1 = "00000000-0000-0000-0000-000000000001";
const U2 = "00000000-0000-0000-0000-000000000002";
let db: PGlite;

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0]!;
async function as<T>(
  role: "anon" | "authenticated" | "service_role",
  uid: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(`SET ROLE ${role}`);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}
const fails = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

beforeAll(async () => {
  db = await setupDb();
  await db.exec(`
    INSERT INTO public.checkout_sessions(id, user_id, product_id, amount, currency) VALUES
      ('cs_1', '${U1}', 'blue-ribbon-style', 299, 'usd'),
      ('cs_2', '${U2}', 'deluxe-daycare-decor', 699, 'usd'),
      ('cs_3', '${U2}', 'blue-ribbon-style', 299, 'usd');
  `);
}, 60_000);

describe("migrations", () => {
  it("apply in order on a clean database", () => {
    expect(files).toEqual([
      "0000_accounts_saves_entitlements.sql",
      "0001_save_revisions.sql",
      "0002_game_measurement.sql",
      "0003_payment_refunds_hardening.sql",
      "0004_referrals.sql",
      "0005_teams.sql",
      "0006_game_saves.sql",
      "0007_notifications.sql",
      "0008_tycoon_events.sql",
    ]);
  });
});

describe("purchase fulfilment (service role only)", () => {
  it("grants once; duplicate webhook deliveries are acknowledged without double-granting", async () => {
    const g = (evt: string) =>
      as("service_role", null, () =>
        one<{ r: string }>(
          `SELECT public.grant_entitlement($1,'cs_1',$2,'blue-ribbon-style',299,'usd','pi_1') r`,
          [evt, U1],
        ),
      );
    expect((await g("evt_1")).r).toBe("granted");
    expect((await g("evt_1")).r).toBe("duplicate");
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int n FROM public.entitlements WHERE user_id = $1`,
          [U1],
        )
      ).n,
    ).toBe(1);
  });

  it("rejects wrong amount, wrong buyer and unknown sessions, granting nothing", async () => {
    const bad = (sql: string) => fails(as("service_role", null, () => db.query(sql)));
    expect(
      await bad(
        `SELECT public.grant_entitlement('evt_a','cs_2','${U2}','deluxe-daycare-decor',1,'usd')`,
      ),
    ).toMatch(/mismatch/);
    expect(
      await bad(
        `SELECT public.grant_entitlement('evt_b','cs_2','${U1}','deluxe-daycare-decor',699,'usd')`,
      ),
    ).toMatch(/mismatch/);
    expect(
      await bad(
        `SELECT public.grant_entitlement('evt_c','cs_nope','${U2}','deluxe-daycare-decor',699,'usd')`,
      ),
    ).toMatch(/unknown session/);
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int n FROM public.entitlements WHERE user_id = $1`,
          [U2],
        )
      ).n,
    ).toBe(0);
  });

  it("players can't grant themselves anything or write purchase tables", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      expect(
        await fails(
          as(role, U2, () =>
            db.query(
              `SELECT public.grant_entitlement('evt_x','cs_2','${U2}','deluxe-daycare-decor',699,'usd')`,
            ),
          ),
        ),
      ).toMatch(/permission denied/);
      expect(
        await fails(
          as(role, U2, () =>
            db.query(
              `INSERT INTO public.entitlements(user_id, product_id, source_event_id, checkout_session_id) VALUES ('${U2}','deluxe-daycare-decor','e','cs_2')`,
            ),
          ),
        ),
      ).toMatch(/permission denied/);
      expect(
        await fails(
          as(role, U2, () => db.query(`UPDATE public.checkout_sessions SET status = 'paid'`)),
        ),
      ).toMatch(/permission denied/);
      expect(
        await fails(
          as(role, U2, () => db.query(`SELECT public.revoke_entitlement_for_refund('e','pi_1')`)),
        ),
      ).toMatch(/permission denied/);
    }
  });

  it("restore reads only the signed-in player's own active purchases", async () => {
    const mine = await as("authenticated", U1, () =>
      db.query(`SELECT product_id FROM public.entitlements`),
    );
    expect(mine.rows).toEqual([{ product_id: "blue-ribbon-style" }]);
    const theirs = await as("authenticated", U2, () =>
      db.query(`SELECT product_id FROM public.entitlements`),
    );
    expect(theirs.rows).toEqual([]);
    expect(
      await fails(as("anon", null, () => db.query(`SELECT * FROM public.entitlements`))),
    ).toMatch(/permission denied/);
  });
});

describe("refunds and failed payments", () => {
  it("a refund revokes the pack once; the player no longer sees it", async () => {
    const r = (evt: string, pi: string) =>
      as("service_role", null, () =>
        one<{ r: string }>(`SELECT public.revoke_entitlement_for_refund($1, $2) r`, [evt, pi]),
      );
    expect((await r("evt_r1", "pi_1")).r).toBe("revoked");
    expect((await r("evt_r1", "pi_1")).r).toBe("duplicate");
    expect((await r("evt_r2", "pi_unknown")).r).toBe("unknown");
    const mine = await as("authenticated", U1, () =>
      db.query(`SELECT product_id FROM public.entitlements`),
    );
    expect(mine.rows).toEqual([]);
    expect(
      (
        await one<{ status: string }>(
          `SELECT status FROM public.checkout_sessions WHERE id = 'cs_1'`,
        )
      ).status,
    ).toBe("refunded");
  });

  it("a late duplicate of the original grant event can't resurrect a refunded purchase", async () => {
    const r = await as("service_role", null, () =>
      one<{ r: string }>(
        `SELECT public.grant_entitlement('evt_1','cs_1','${U1}','blue-ribbon-style',299,'usd','pi_1') r`,
      ),
    );
    expect(r.r).toBe("duplicate");
    expect(
      await fails(
        as("service_role", null, () =>
          db.query(
            `SELECT public.grant_entitlement('evt_1b','cs_1','${U1}','blue-ribbon-style',299,'usd','pi_1')`,
          ),
        ),
      ),
    ).toMatch(/refunded/);
  });

  it("buying again after a refund (new checkout) restores the pack", async () => {
    await db.exec(
      `INSERT INTO public.checkout_sessions(id, user_id, product_id, amount, currency) VALUES ('cs_4', '${U1}', 'blue-ribbon-style', 299, 'usd')`,
    );
    const r = await as("service_role", null, () =>
      one<{ r: string }>(
        `SELECT public.grant_entitlement('evt_4','cs_4','${U1}','blue-ribbon-style',299,'usd','pi_4') r`,
      ),
    );
    expect(r.r).toBe("granted");
    const mine = await as("authenticated", U1, () =>
      db.query(`SELECT product_id FROM public.entitlements`),
    );
    expect(mine.rows).toEqual([{ product_id: "blue-ribbon-style" }]);
  });

  it("failed or expired checkouts are recorded once and never grant", async () => {
    const c = (evt: string, id: string, st: string) =>
      as("service_role", null, () =>
        one<{ r: string }>(`SELECT public.mark_checkout_closed($1, $2, $3) r`, [evt, id, st]),
      );
    expect((await c("evt_f1", "cs_3", "failed")).r).toBe("failed");
    expect((await c("evt_f1", "cs_3", "failed")).r).toBe("duplicate");
    expect(
      (
        await one<{ status: string }>(
          `SELECT status FROM public.checkout_sessions WHERE id = 'cs_3'`,
        )
      ).status,
    ).toBe("failed");
    expect((await c("evt_f2", "cs_4", "expired")).r).toBe("ignored");
    expect(
      (
        await one<{ status: string }>(
          `SELECT status FROM public.checkout_sessions WHERE id = 'cs_4'`,
        )
      ).status,
    ).toBe("paid"); // a paid session is never downgraded
    expect(
      await fails(
        as("service_role", null, () =>
          db.query(`SELECT public.mark_checkout_closed('evt_f3','cs_3','paid')`),
        ),
      ),
    ).toMatch(/bad status/);
  });
});

describe("cloud saves still work after hardening", () => {
  it("owner-only, conditional on revision; stale devices get a conflict", async () => {
    const save = (uid: string, coins: number, rev: number) =>
      as("authenticated", uid, () =>
        one<{ r: number }>(`SELECT public.save_player_progress($1::jsonb, $2) r`, [
          JSON.stringify({ v: 4, coins }),
          rev,
        ]),
      );
    expect(Number((await save(U1, 10, 0)).r)).toBe(1);
    expect(Number((await save(U1, 20, 1)).r)).toBe(2);
    expect(await fails(save(U1, 5, 1))).toMatch(/save conflict/);
    const other = await as("authenticated", U2, () =>
      db.query(`SELECT * FROM public.player_saves`),
    );
    expect(other.rows).toEqual([]);
    expect(
      await fails(as("anon", null, () => db.query(`SELECT * FROM public.player_saves`))),
    ).toMatch(/permission denied/);
  });
});

describe("measurement", () => {
  it("events are private: API roles can't read or write them", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      expect(await fails(as(role, U1, () => db.query(`SELECT * FROM public.game_events`)))).toMatch(
        /permission denied/,
      );
      expect(
        await fails(
          as(role, U1, () =>
            db.query(
              `INSERT INTO public.game_events(client_at, device_id, cohort_day, session_id, build, name) VALUES (now(),'abcdefgh','2026-10-31','abcdefgh','b','hub_open')`,
            ),
          ),
        ),
      ).toMatch(/permission denied/);
      expect(
        await fails(as(role, U1, () => db.query(`SELECT * FROM public.game_retention`))),
      ).toMatch(/permission denied/);
    }
  });

  it("unknown event names are rejected by the table", async () => {
    expect(
      await fails(
        db.query(
          `INSERT INTO public.game_events(client_at, device_id, cohort_day, session_id, build, name) VALUES (now(),'abcdefgh','2026-10-31','abcdefgh','b','purchase_completed')`,
        ),
      ),
    ).toMatch(/check constraint/);
  });

  it("return rates by cohort and booking-link clicks by location are computed from real rows", async () => {
    const ins = (dev: string, cohort: string, at: string, name: string, props = "{}") =>
      db.query(
        `INSERT INTO public.game_events(received_at, client_at, device_id, cohort_day, session_id, build, name, props) VALUES ($3::timestamptz, $3::timestamptz, $1, $2::date, 'session01', 'build-a', $4, $5::jsonb)`,
        [dev, cohort, at, name, props],
      );
    await ins(
      "device-aaaa",
      "2026-11-01",
      "2026-11-01T15:00:00Z",
      "session_start",
      '{"first_visit":true}',
    );
    await ins("device-aaaa", "2026-11-01", "2026-11-02T15:00:00Z", "session_start");
    await ins(
      "device-bbbb",
      "2026-11-01",
      "2026-11-01T16:00:00Z",
      "session_start",
      '{"first_visit":true}',
    );
    await ins(
      "device-bbbb",
      "2026-11-01",
      "2026-11-01T16:05:00Z",
      "booking_click",
      '{"location":"hillsdale"}',
    );
    await ins(
      "device-aaaa",
      "2026-11-01",
      "2026-11-01T15:10:00Z",
      "booking_click",
      '{"location":"hawthorne"}',
    );
    await ins("device-bbbb", "2026-11-01", "2026-11-01T16:06:00Z", "app_click", '{"from":"visit"}');
    await ins("device-aaaa", "2026-11-01", "2026-11-01T15:11:00Z", "directions_click", '{"location":"hawthorne"}');
    const ret = await as("service_role", null, () =>
      one<{ players: number; returned_next_day: number }>(
        `SELECT players::int, returned_next_day::int FROM public.game_retention WHERE cohort_day = '2026-11-01'`,
      ),
    );
    expect(ret).toEqual({ players: 2, returned_next_day: 1 });
    const f = await as("service_role", null, () =>
      one<{ h: number; s: number; first: number; app: number; dir: number }>(
        `SELECT booking_link_clicks_hawthorne::int h, booking_link_clicks_hillsdale::int s, first_time_players::int first, customer_app_link_clicks::int app, directions_clicks::int dir FROM public.game_daily_funnel WHERE day = '2026-11-01'`,
      ),
    );
    expect(f).toEqual({ h: 1, s: 1, first: 2, app: 1, dir: 1 });
  });

  it("referral counts: only first-time players from the link, never the inviter's own device", async () => {
    const ins = (dev: string, name: string, props: string) =>
      db.query(
        `INSERT INTO public.game_events(client_at, device_id, cohort_day, session_id, build, name, props) VALUES (now(), $1, '2026-11-01', 'session01', 'b', $2, $3::jsonb)`,
        [dev, name, props],
      );
    await ins("friend-0001", "session_start", '{"ref":"ABCDEFGH","first_visit":true}');
    await ins("friend-0001", "tutorial_complete", "{}");
    await ins("friend-0002", "session_start", '{"ref":"ABCDEFGH","first_visit":true}');
    await ins("oldplayer01", "session_start", '{"ref":"ABCDEFGH","first_visit":false}'); // already a player
    await ins("inviter0001", "session_start", '{"ref":"ABCDEFGH","first_visit":true}'); // own device
    await ins("inviter0001", "tutorial_complete", "{}");
    await ins("friend-0003", "session_start", '{"ref":"ZZZZZZZZ","first_visit":true}'); // someone else's code
    const r = await as("service_role", null, () =>
      one<{ joined: number; completed: number }>(`SELECT * FROM public.referral_stats('ABCDEFGH', 'inviter0001')`),
    );
    expect(r).toEqual({ joined: 2, completed: 1 });
    for (const role of ["anon", "authenticated"] as const) {
      expect(await fails(as(role, U1, () => db.query(`SELECT * FROM public.referral_stats('ABCDEFGH', '')`)))).toMatch(/permission denied/);
    }
    const f = await as("service_role", null, () =>
      one<{ n: number }>(`SELECT sum(first_time_players_from_referrals)::int n FROM public.game_daily_funnel`),
    );
    expect(f.n).toBeGreaterThanOrEqual(3);
  });

  it("team totals: per-device daily cap, only valid points, this week vs last week", async () => {
    const ins = (dev: string, team: string, points: string, at: string) =>
      db.query(
        `INSERT INTO public.game_events(received_at, client_at, device_id, cohort_day, session_id, build, name, props) VALUES ($4::timestamptz, now(), $1, '2026-11-01', 'session01', 'b', 'team_points', jsonb_build_object('team', $2::text, 'points', $3::text))`,
        [dev, team, points, at],
      );
    const now = (await one<{ t: string }>(`SELECT (now() AT TIME ZONE 'UTC')::text t`)).t;
    const nowIso = new Date(now.replace(" ", "T") + "Z").toISOString();
    for (let i = 0; i < 9; i++) await ins("teamdev-001", "hillsdale", "10", nowIso); // 90 in one day → capped at 60
    await ins("teamdev-002", "hillsdale", "5", nowIso);
    await ins("teamdev-003", "hawthorne", "7", nowIso);
    await ins("teamdev-004", "hawthorne", "500", nowIso); // invalid: over 10
    await ins("teamdev-005", "moon", "5", nowIso); // invalid team
    await ins("teamdev-006", "hawthorne", "9", new Date(Date.parse(nowIso) - 8 * 86400000).toISOString()); // last week or earlier
    const rows = await as("service_role", null, async () => (await db.query<{ team: string; points: number; players: number }>(`SELECT * FROM public.team_standings(0)`)).rows);
    expect(rows).toEqual([
      { team: "hawthorne", points: 7, players: 1 },
      { team: "hillsdale", points: 65, players: 2 },
    ]);
    // a week with no points at all must read 0 for both teams (not the cap)
    const empty = await as("service_role", null, async () => (await db.query<{ team: string; points: number; players: number }>(`SELECT * FROM public.team_standings(20)`)).rows);
    expect(empty).toEqual([
      { team: "hawthorne", points: 0, players: 0 },
      { team: "hillsdale", points: 0, players: 0 },
    ]);
    for (const role of ["anon", "authenticated"] as const) {
      expect(await fails(as(role, U1, () => db.query(`SELECT * FROM public.team_standings(0)`)))).toMatch(/permission denied/);
    }
  });
});

describe("per-game cloud saves (Daycare Tycoon, Recess Rush, Graduation Day)", () => {
  const save = (uid: string | null, game: string, data: unknown, rev: number, role: "authenticated" | "anon" = "authenticated") =>
    as(role, uid, () =>
      one<{ r: number }>(`SELECT public.save_game_progress($1, $2::jsonb, $3) r`, [game, JSON.stringify(data), rev]),
    );

  it("each game has its own save and its own revision; a stale device conflicts only in that game", async () => {
    expect(Number((await save(U1, "daycare", { v: 4, coins: 10 }, 0)).r)).toBe(1);
    expect(Number((await save(U1, "recess", { best: 420 }, 0)).r)).toBe(1);
    expect(Number((await save(U1, "graduation", { version: 1, progress: { levels: {} } }, 0)).r)).toBe(1);
    expect(Number((await save(U1, "daycare", { v: 4, coins: 20 }, 1)).r)).toBe(2);
    expect(await fails(save(U1, "daycare", { v: 4, coins: 5 }, 1))).toMatch(/save conflict/);
    expect(await fails(save(U1, "recess", { best: 1 }, 0))).toMatch(/save conflict/); // first-save race
    const rows = await as("authenticated", U1, () =>
      db.query<{ game: string; revision: number; data: { coins?: number; best?: number } }>(
        `SELECT game, revision::int, data FROM public.game_saves ORDER BY game`,
      ),
    );
    expect(rows.rows.map((r) => [r.game, r.revision])).toEqual([["daycare", 2], ["graduation", 1], ["recess", 1]]);
    expect(rows.rows[0]!.data.coins).toBe(20);
    expect(rows.rows[2]!.data.best).toBe(420);
  });

  it("only the owner can read their saves; other players and signed-out visitors can't", async () => {
    const other = await as("authenticated", U2, () => db.query(`SELECT * FROM public.game_saves`));
    expect(other.rows).toEqual([]);
    expect(await fails(as("anon", null, () => db.query(`SELECT * FROM public.game_saves`)))).toMatch(/permission denied/);
    expect(await fails(save(null, "daycare", { v: 4 }, 0, "anon"))).toMatch(/permission denied|not signed in/);
  });

  it("only the three games, only objects, and no oversized saves", async () => {
    expect(await fails(save(U2, "casino", { v: 1 }, 0))).toMatch(/unknown game/);
    expect(await fails(save(U2, "daycare", [1, 2, 3], 0))).toMatch(/invalid save/);
    expect(await fails(save(U2, "graduation", { blob: "x".repeat(150_000) }, 0))).toMatch(/invalid save/);
    const n = await as("authenticated", U2, () => one<{ n: number }>(`SELECT count(*)::int n FROM public.game_saves`));
    expect(n.n).toBe(0);
  });

  it("players can't write the table directly — only through the revision-checked save", async () => {
    expect(
      await fails(as("authenticated", U2, () => db.query(`INSERT INTO public.game_saves(user_id, game, data) VALUES ('${U2}', 'daycare', '{}')`))),
    ).toMatch(/permission denied/);
    expect(
      await fails(as("authenticated", U1, () => db.query(`UPDATE public.game_saves SET revision = 99 WHERE user_id = '${U1}'`))),
    ).toMatch(/permission denied/);
  });
});
