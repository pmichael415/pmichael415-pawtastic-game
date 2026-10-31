import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOCATIONS, bookingUrl } from "@/lib/locations";
import { GameHeader } from "@/components/game/GameHeader";
import { track } from "@/lib/analytics";
import { referredBy } from "@/lib/referral";
import { useEffect, useState } from "react";
import { peekSave } from "@/game/store";

export const Route = createFileRoute("/visit")({
  head: () => ({
    meta: [
      { title: "Visit PAWtastic Academy — Hawthorne & Hillsdale" },
      { name: "description", content: "Book a free evaluation at PAWtastic Academy in Hawthorne or Hillsdale for daycare, boarding and baths." },
      { property: "og:title", content: "Visit PAWtastic Academy — Hawthorne & Hillsdale" },
      { property: "og:description", content: "Book a free evaluation for daycare, boarding, baths and exit baths." },
    ],
  }),
  component: Visit,
});

function Visit() {
  const [team, setTeam] = useState<string | null>(null);
  useEffect(() => setTeam(peekSave().team), []);
  return (
    <main className="space-y-4 px-3 pt-3">
      <GameHeader title="Bring your real pup!" subtitle="Hawthorne & Hillsdale" />
      <p className="rounded-3xl bg-brand-gradient p-4 font-bold text-primary-foreground shadow-soft">
        PAWtastic Academy offers dog daycare, boarding, baths and exit baths. Start with a free evaluation at the location nearest you.
      </p>
      {[...LOCATIONS].sort((a, b) => Number(b.id === team) - Number(a.id === team)).map((l) => (
        <article key={l.id} className={`rounded-3xl bg-card p-4 shadow-soft ${l.id === team ? "ring-4 ring-primary" : ""}`}>
          <h2 className="font-display text-xl font-bold text-secondary">{l.name}{l.id === team ? " · your team" : ""}</h2>
          <p className="flex items-center gap-1 text-sm font-bold text-muted-foreground"><MapPin className="h-4 w-4" /> {l.address}</p>
          <Button size="lg" className="mt-3 h-14 w-full font-display text-base" asChild>
            <a href={bookingUrl(l)} target="_blank" rel="noopener noreferrer" onClick={() => { const ref = referredBy(); track("booking_click", { location: l.id, ...(ref ? { ref } : {}) }); }}>Book free evaluation <ExternalLink /></a>
          </Button>
        </article>
      ))}
      <p className="text-center text-[11px] font-bold text-muted-foreground">Opens PAWtastic Academy's existing evaluation form. Game coins and scores have no cash value and aren't connected to PAWtastic customer rewards, discounts or credit.</p>
    </main>
  );
}
