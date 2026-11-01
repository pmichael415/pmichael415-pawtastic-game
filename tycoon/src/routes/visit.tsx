import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, ExternalLink, MapPin, Navigation, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CUSTOMER_APP_URL, LOCATIONS, bookingUrl, directionsUrl } from "@/lib/locations";
import { GameHeader } from "@/components/game/GameHeader";
import { track } from "@/lib/analytics";
import { referredBy } from "@/lib/referral";
import { useEffect, useState } from "react";
import { peekSave } from "@/game/store";
import { GRAD_CAP_LOGO_URL } from "@/game/sprites";

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
  const ref = () => { const r = referredBy(); return r ? { ref: r } : {}; };
  return (
    <main className="space-y-3 px-3 pt-3 pb-6">
      <GameHeader title="Visit PAWtastic" subtitle="Hawthorne & Hillsdale" />
      <section className="rounded-2xl border border-border bg-card p-4 text-center shadow-soft">
        <img src={GRAD_CAP_LOGO_URL} alt="PAWtastic Academy, Hillsdale and Hawthorne, NJ" width={370} height={392} className="mx-auto h-40 w-auto" />
        <h2 className="mt-2 text-2xl font-bold leading-tight text-secondary">Bring your real pup!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dog daycare, boarding, baths and exit baths. Visit us, book a free evaluation, or get the PAWtastic app.
        </p>
      </section>
      {[...LOCATIONS].sort((a, b) => Number(b.id === team) - Number(a.id === team)).map((l) => (
        <article key={l.id} className={`rounded-2xl border bg-card p-4 shadow-soft ${l.id === team ? "border-primary" : "border-border"}`}>
          <h2 className="text-xl font-bold text-secondary">{l.name}{l.id === team ? " · your team" : ""}</h2>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden /> {l.address}</p>
          <div className="mt-3 grid gap-2">
            <Button size="lg" className="h-12 w-full text-base" asChild>
              <a href={bookingUrl(l)} target="_blank" rel="noopener noreferrer" onClick={() => track("booking_click", { location: l.id, ...ref() })}>
                <CalendarCheck /> Book free evaluation <ExternalLink />
              </a>
            </Button>
            <Button size="lg" variant="secondary" className="h-12 w-full text-base" asChild>
              <a href={directionsUrl(l)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to PAWtastic ${l.name}`} onClick={() => track("directions_click", { location: l.id })}>
                <Navigation /> Directions
              </a>
            </Button>
          </div>
        </article>
      ))}
      <section aria-label="Get the PAWtastic app" className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Smartphone className="h-6 w-6" strokeWidth={1.75} aria-hidden /></div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Already a PAWtastic family?</p>
            <h2 className="text-xl font-bold leading-tight text-secondary">Get the PAWtastic app</h2>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">PAWtastic customers use the PAWtastic app at app.pawtasticacademy.com for their bookings and account.</p>
        <Button size="lg" variant="secondary" className="mt-3 h-12 w-full text-base" asChild>
          <a href={CUSTOMER_APP_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("app_click", { from: "visit" })}>Open the PAWtastic app <ExternalLink /></a>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Tip: on iPhone, open it in Safari, tap Share, then “Add to Home Screen”.</p>
      </section>
      <p className="text-center text-[11px] font-medium text-muted-foreground">
        These links open PAWtastic Academy's own evaluation forms and app. The games are separate: game coins and scores have no cash value and aren't connected to PAWtastic customer accounts, rewards, discounts or credit.{" "}
        <Link to="/privacy" className="underline">Privacy</Link>
      </p>
    </main>
  );
}
