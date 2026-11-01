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
