import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

// One-tap unsubscribe from the link in every email. Opening the page does nothing by itself (email security scanners
// open links); only pressing the button unsubscribes. No sign-in needed.
export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s) => z.object({ t: z.string().max(64).optional() }).parse(s),
  head: () => ({ meta: [{ title: "Unsubscribe | PAWtastic Games" }, { name: "robots", content: "noindex" }] }),
  component: UnsubscribePage,
});

export function UnsubscribeContent({ token }: { token: string | undefined }) {
  const [state, setState] = useState<"ask" | "busy" | "done" | "error">("ask");
  const go = async () => {
    setState("busy");
    try {
      const r = await fetch("/api/public/notifications/email-unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(r.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h1 className="font-display text-xl font-bold text-secondary">Unsubscribe from PAWtastic Games emails?</h1>
      {state === "done" ? (
        <p className="text-sm">You're unsubscribed. You won't get these emails again.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">You'll stop getting the weekly challenge and prize emails. You can still play.</p>
          <Button className="h-11 w-full" disabled={!token || state === "busy"} onClick={go}>
            Unsubscribe
          </Button>
          {state === "error" && <p className="text-sm text-destructive">Something went wrong. Please try again.</p>}
          {!token && <p className="text-sm text-muted-foreground">This link is incomplete. Use the link in your email.</p>}
        </>
      )}
    </section>
  );
}

function UnsubscribePage() {
  const { t } = Route.useSearch();
  return (
    <main className="px-3 pt-6 pb-6">
      <UnsubscribeContent token={t} />
    </main>
  );
}
