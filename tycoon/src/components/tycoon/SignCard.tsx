// The PAWtastic Academy sign on your lot: the real daycare behind the game. Links are just links — a click is counted
// as a click, never as a booking.
import { ExternalLink, MapPin } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { track } from "@/lib/analytics";
import { CUSTOMER_APP_URL, LOCATIONS, bookingUrl, directionsUrl } from "@/lib/locations";

export function SignCard({ open, onClose, onEdit }: { open: boolean; onClose: () => void; onEdit?: () => void }) {
  const from = "tycoon-sign";
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>PAWtastic Academy</SheetTitle>
          <SheetDescription>
            This game is made by PAWtastic Academy, a real dog daycare in Hawthorne and Hillsdale, NJ: daycare, boarding, baths and exit baths. The daycare in the game is fictional.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 space-y-2">
          {LOCATIONS.map((l) => (
            <div key={l.id} className="flex gap-2">
              <a
                href={bookingUrl(l)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Book a free evaluation in ${l.name}`}
                onClick={() => track("booking_click", { location: l.id, from })}
                className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
              >
                Book a free evaluation · {l.name} <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
              <a
                href={directionsUrl(l)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Directions to PAWtastic ${l.name}`}
                onClick={() => track("directions_click", { location: l.id, from })}
                className="grid min-h-11 w-11 place-items-center rounded-xl border border-border text-secondary"
              >
                <MapPin className="h-5 w-5" aria-hidden />
              </a>
            </div>
          ))}
          <a
            href={CUSTOMER_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("app_click", { from })}
            className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border px-3 text-sm font-semibold text-secondary"
          >
            Open the PAWtastic app
          </a>
          <p className="text-[11px] text-muted-foreground">Game coins and items aren't connected to real services, prices or rewards.</p>
          {onEdit && (
            <button type="button" className="min-h-11 w-full text-sm font-semibold text-primary underline-offset-2 hover:underline" onClick={onEdit}>
              Move or sell the sign
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
