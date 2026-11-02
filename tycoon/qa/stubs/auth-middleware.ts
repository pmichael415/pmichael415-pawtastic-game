// DEVELOPMENT-ONLY stand-in for @/integrations/supabase/auth-middleware (see qa/stubs/db.ts). The browser signs in
// against the stand-in in qa/e2e-purchases.cjs, whose tokens carry the user id as `sub`; this trusts that id
// (there is no real auth service in the test), and gives the request a client limited to that user's rows.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const header = getRequest()?.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer /, "");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Unauthorized: Invalid token");
  const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { sub?: string };
  if (!claims.sub) throw new Error("Unauthorized: No user ID found in token");
  const { makeClient } = await import("./supabase-admin");
  return next({ context: { supabase: makeClient(claims.sub) as never, userId: claims.sub, claims } });
});
