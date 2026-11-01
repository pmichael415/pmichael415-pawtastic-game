// @vitest-environment node
// Migration 0008: game_events accepts the 9 new Daycare Tycoon (preview) event names, and still rejects unknown ones.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { pgHelpers, setupDb } from "./pg";
import { EVENT_NAMES } from "@/lib/analytics";

const NEW = ["tycoon_build", "tycoon_land", "tycoon_level", "tycoon_guide", "tycoon_open", "tycoon_price", "tycoon_marketing", "tycoon_day", "tycoon_trophy"];
let db: PGlite;
let h: ReturnType<typeof pgHelpers>;
const insert = (name: string) =>
  h.as("service_role", null, () =>
    db.query(`INSERT INTO public.game_events(client_at, device_id, cohort_day, session_id, build, name) VALUES (now(),'abcdefgh','2026-11-01','abcdefgh','b',$1)`, [name]),
  );

beforeAll(async () => {
  db = await setupDb();
  h = pgHelpers(db);
}, 60_000);

describe("tycoon events", () => {
  it("the client sends exactly the names the database accepts", () => {
    for (const n of NEW) expect(EVENT_NAMES).toContain(n);
  });
  it("game_events accepts all 9 new names", async () => {
    for (const n of NEW) expect(await h.fails(insert(n))).toBeNull();
  });
  it("and every name the client can send", async () => {
    for (const n of EVENT_NAMES) expect(await h.fails(insert(n))).toBeNull();
  });
  it("still rejects unknown names", async () => {
    expect(await h.fails(insert("tycoon_cheat"))).toMatch(/game_events_name_check/);
  });
});
