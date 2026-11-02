// "What's blocking income" (service design, "Stalls"): the cause and a fix the player can do through play.
import type { Blocker } from "@/tycoon/blockers";

export function BlockersCard({ blockers }: { blockers: Blocker[] }) {
  if (!blockers.length) return null;
  return (
    <section aria-label="What's blocking income" className="rounded-2xl border border-accent bg-card p-3 shadow-soft">
      <h3 className="text-sm font-bold text-secondary">What's blocking income</h3>
      <ul className="mt-1 space-y-2">
        {blockers.slice(0, 2).map((b) => (
          <li key={b.id}>
            <p className="text-sm font-semibold text-secondary">{b.title}</p>
            <p className="text-xs text-muted-foreground">{b.fix}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
