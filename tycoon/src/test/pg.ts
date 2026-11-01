// Shared PGlite test database: Supabase-style roles, auth.uid() from a settable claim, and every migration in order.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle/migrations");
export const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

export async function setupDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    -- Supabase's defaults: API roles get everything on new public objects; RLS + revokes do the protecting.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  `);
  for (const f of migrationFiles()) await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
  return db;
}

export type Role = "anon" | "authenticated" | "service_role";

/** Query helpers bound to one database. */
export function pgHelpers(db: PGlite) {
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows[0]!;
  const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows;
  async function as<T>(role: Role, uid: string | null, fn: () => Promise<T>): Promise<T> {
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
  return { one, rows, as, fails };
}

const SETOF = new Set(["notify_start_next", "notify_claim_push", "notify_claim_email", "notify_get_keys"]);

/** A supabase-js-like `rpc` over PGlite, run as the service role (scalar functions return their value, set-returning ones their rows). */
export function pgRpc(db: PGlite, fail?: (name: string) => boolean) {
  const h = pgHelpers(db);
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      if (fail?.(name)) return { data: null, error: new Error(`simulated failure in ${name}`) };
      const keys = Object.keys(args);
      const vals = keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      const sql = `SELECT * FROM public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
      try {
        const r = await h.as("service_role", null, () => db.query<Record<string, unknown>>(sql, vals));
        const data = SETOF.has(name) ? r.rows : (Object.values(r.rows[0] ?? {})[0] ?? null);
        return { data, error: null };
      } catch (e) {
        return { data: null, error: e };
      }
    },
  };
}
