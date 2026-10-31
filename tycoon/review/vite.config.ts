import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const src = path.resolve(__dirname, "../src");
export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react(), tailwindcss()],
  define: { "import.meta.env.VITE_REVIEW_BUILD": JSON.stringify("1"), "process.env": "{}" },
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client.server", replacement: path.resolve(__dirname, "stubs/payments.ts") },
      { find: "@/integrations/supabase/client", replacement: path.resolve(__dirname, "stubs/supabase-client.ts") },
      { find: "@/integrations/lovable", replacement: path.resolve(__dirname, "stubs/lovable.ts") },
      { find: "@/lib/payments/payments.functions", replacement: path.resolve(__dirname, "stubs/payments.ts") },
      { find: "@", replacement: src },
    ],
  },
  build: { outDir: path.resolve(__dirname, "dist"), emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
