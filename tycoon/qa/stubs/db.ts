// DEVELOPMENT-ONLY stand-in database for qa/e2e-purchases.cjs: an in-process Postgres (PGlite) with every migration
// applied, so the real SQL functions run. Only reachable when vite.config.ts's e2e plugin is on
// (PAWTASTIC_E2E_STUB=1 and `vite dev`); never part of a production build.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// One database per dev server process, shared by the server code and vite.config.ts's /__stub/sql check endpoint.
const g = globalThis as { __pawtasticStubDb?: Promise<PGlite> };
export function stubDb(): Promise<PGlite> {
  g.__pawtasticStubDb ??= (async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    const dir = path.resolve(process.cwd(), "drizzle/migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(path.join(dir, f), "utf8"));
    return db;
  })();
  return g.__pawtasticStubDb;
}
