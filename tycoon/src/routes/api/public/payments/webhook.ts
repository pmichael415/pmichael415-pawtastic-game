import { createFileRoute } from "@tanstack/react-router";

// Signed payment webhook. The logic (mode, signature, grant, refund) lives in src/lib/payments/webhook.server.ts.
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { processWebhook } = await import("@/lib/payments/webhook.server");
        return processWebhook(request);
      },
    },
  },
});
