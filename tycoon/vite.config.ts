// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Browser checks of purchases (qa/e2e-purchases.cjs) swap the server's database client and sign-in check for local
// stand-ins (qa/stubs). Only with PAWTASTIC_E2E_STUB=1 and only under `vite dev`: production builds never see them.
// The checks read the stand-in database through POST /__stub/sql ({ sql, params } → rows).
type StubServer = {
  middlewares: { use: (path: string, fn: (req: NodeJS.ReadableStream & { method?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }) => void) => void };
  ssrLoadModule: (id: string) => Promise<Record<string, unknown>>;
};
const E2E_STUBS: Record<string, string> = {
  [path.resolve("src/integrations/supabase/client.server.ts")]: path.resolve("qa/stubs/supabase-admin.ts"),
  [path.resolve("src/integrations/supabase/auth-middleware.ts")]: path.resolve("qa/stubs/auth-middleware.ts"),
};
const e2eStub = {
  name: "pawtastic-e2e-stub",
  enforce: "pre" as const,
  apply: (_config: unknown, env: { command: string }) => process.env["PAWTASTIC_E2E_STUB"] === "1" && env.command === "serve",
  // Swapped by resolved file (imports arrive already alias-resolved), and only in the server environment.
  load(this: { environment?: { config?: { consumer?: string } } }, id: string, opts?: { ssr?: boolean }) {
    if (!opts?.ssr && this.environment?.config?.consumer !== "server") return null;
    const stub = E2E_STUBS[path.normalize(id.split("?")[0]!)];
    return stub ? `export * from ${JSON.stringify(stub)};` : null;
  },
  configureServer(server: StubServer) {
    server.middlewares.use("/__stub/sql", (req, res) => {
      let raw = "";
      req.on("data", (c: Buffer) => (raw += c));
      req.on("end", async () => {
        res.setHeader("content-type", "application/json");
        try {
          if (req.method !== "POST") throw new Error("POST only");
          const { sql, params = [] } = JSON.parse(raw) as { sql: string; params?: unknown[] };
          const g = globalThis as { __pawtasticStubDb?: Promise<{ query: (q: string, p: unknown[]) => Promise<{ rows: unknown[] }> }> };
          const db = await (g.__pawtasticStubDb ?? ((await server.ssrLoadModule(path.resolve("qa/stubs/db.ts")))["stubDb"] as () => NonNullable<typeof g.__pawtasticStubDb>)());
          res.end(JSON.stringify({ rows: (await db.query(sql, params)).rows }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    });
  },
};

export default defineConfig({
  vite: { plugins: [e2eStub] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
