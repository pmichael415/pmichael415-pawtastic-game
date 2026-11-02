// Why reputation moved, what families wrote, and how recent pickups went (service design, "Reputation").
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { reviewFactor } from "@/tycoon/reputation";
import { outcomeLine } from "@/tycoon/run";
import { fmtTime } from "@/tycoon/visit";
import type { Facility } from "@/tycoon/types";

export function ReputationSheet({ f, onClose }: { f: Facility; onClose: () => void }) {
  const log = [...(f.repLog ?? [])].reverse().slice(0, 12);
  const reviews = [...(f.reviews ?? [])].reverse().slice(0, 8);
  const pickups = [...(f.outcomes ?? [])].reverse().slice(0, 8);
  const factor = reviewFactor(f);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-2xl" aria-label={`Reputation ${Math.round(f.reputation)}`}>
        <SheetHeader>
          <SheetTitle>Reputation {Math.round(f.reputation)}</SheetTitle>
          <SheetDescription>Earned by how visits go: care, cleanliness, waiting, the services families booked, safe grouping, and how you put problems right.</SheetDescription>
        </SheetHeader>
        <h3 className="mt-3 text-sm font-bold text-secondary">Why it moved</h3>
        {log.length ? (
          <ul className="mt-1 space-y-1 text-sm">
            {log.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className={`w-10 shrink-0 text-right font-bold tabular-nums ${e.delta > 0 ? "text-primary" : "text-destructive"}`}>{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
                <span className="text-secondary">{e.reason} <span className="text-xs text-muted-foreground">· day {e.day} {fmtTime(e.min)}</span></span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No changes yet — it moves when families pick up their pups.</p>
        )}
        <h3 className="mt-4 text-sm font-bold text-secondary">Reviews {reviews.length ? `· drop-offs ×${factor.toFixed(2)}` : ""}</h3>
        {reviews.length ? (
          <ul className="mt-1 space-y-2 text-sm">
            {reviews.map((r, i) => (
              <li key={i}>
                <span aria-label={`${r.stars} stars`} className="text-accent-foreground">{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span> “{r.text}” <span className="text-xs text-muted-foreground">— {r.owner}, day {r.day}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No reviews yet.</p>
        )}
        <h3 className="mt-4 text-sm font-bold text-secondary">Recent pickups</h3>
        <ul className="mt-1 space-y-1 text-sm text-secondary">
          {pickups.map((o, i) => (
            <li key={i}>{outcomeLine(o)} <span className="text-xs text-muted-foreground">· {o.total >= 0 ? `+${o.total}` : o.total}</span></li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
