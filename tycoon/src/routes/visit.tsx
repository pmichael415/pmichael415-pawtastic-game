import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/game/sprites";
import { LOCATIONS, bookingUrl } from "@/lib/locations";

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
  return (
    <main className="space-y-4 px-3 pt-3">
      <header className="flex items-center gap-2">
        <Logo className="h-12 w-auto" />
        <h1 className="font-display text-2xl font-bold leading-tight text-secondary">Bring your real pup!</h1>
      </header>
      <p className="rounded-3xl bg-brand-gradient p-4 font-bold text-primary-foreground shadow-soft">
        PAWtastic Academy offers dog daycare, boarding, baths and exit baths. Start with a free evaluation at the location nearest you.
      </p>
      {LOCATIONS.map((l) => (
        <article key={l.id} className="rounded-3xl bg-card p-4 shadow-soft">
          <h2 className="font-display text-xl font-bold text-secondary">{l.name}</h2>
          <p className="flex items-center gap-1 text-sm font-bold text-muted-foreground"><MapPin className="h-4 w-4" /> {l.address}</p>
          <Button size="lg" className="mt-3 h-14 w-full font-display text-base" asChild>
            <a href={bookingUrl(l)} target="_blank" rel="noopener noreferrer">Book free evaluation <ExternalLink /></a>
          </Button>
        </article>
      ))}
      <p className="text-center text-[11px] font-bold text-muted-foreground">Game coins and scores have no cash value and aren't connected to PAWtastic customer rewards.</p>
    </main>
  );
}
