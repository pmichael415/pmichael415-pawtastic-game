// Runs only the Stripe test-mode harness (qa/stripe-test/*.harness.ts), started by qa/stripe-test/harness.mjs.
// The hub's server code talks to a local throwaway database (qa/stubs) instead of the real one.
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["qa/stripe-test/**/*.harness.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client.server", replacement: path.join(root, "qa/stubs/supabase-admin.ts") },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
});
