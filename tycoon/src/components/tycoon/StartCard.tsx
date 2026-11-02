// How a brand-new daycare starts (Stage A, spec §3.1): a small working daycare, or an empty lot. Both stay viable.
import { Hammer, Sparkles } from "lucide-react";

export function StartCard({ onPick }: { onPick: (mode: "quick" | "scratch") => void }) {
  return (
    <section aria-label="Start your daycare" className="rounded-2xl border border-primary/40 bg-card p-4 shadow-pop">
      <p className="eyebrow">New daycare</p>
      <h2 className="font-display text-xl font-bold text-secondary">Start your daycare</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => onPick("quick")} className="min-h-11 rounded-2xl bg-primary p-3 text-left text-primary-foreground shadow-soft">
          <span className="flex items-center gap-2 font-display text-lg font-bold">
            <Sparkles className="h-5 w-5" aria-hidden /> Quick start
          </span>
          <span className="mt-1 block text-sm opacity-90">A small working daycare, ready for your first pup.</span>
        </button>
        <button type="button" onClick={() => onPick("scratch")} className="min-h-11 rounded-2xl border border-border bg-background p-3 text-left text-secondary">
          <span className="flex items-center gap-2 font-display text-lg font-bold">
            <Hammer className="h-5 w-5" aria-hidden /> Build from scratch
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">An empty lot and the building guide.</span>
        </button>
      </div>
    </section>
  );
}
