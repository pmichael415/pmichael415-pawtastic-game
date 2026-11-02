// Up to three clear next goals (Stage A, spec §3.6), below the daycare.
import { Progress } from "@/components/ui/progress";
import { nextGoals } from "@/tycoon/goals";
import type { TycoonState } from "@/tycoon/types";

export function GoalsStrip({ state }: { state: TycoonState }) {
  const goals = nextGoals(state);
  if (!goals.length) return null;
  return (
    <section aria-label="Next goals" className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <p className="eyebrow">Next goals</p>
      <ul className="mt-1 grid gap-2 sm:grid-cols-3">
        {goals.map((g) => (
          <li key={g.id} className="rounded-xl bg-muted p-2">
            <p className="text-sm font-bold text-secondary">{g.title}</p>
            <p className="text-xs text-muted-foreground">{g.detail}</p>
            {g.progress && <Progress value={Math.round((100 * g.progress[0]) / Math.max(1, g.progress[1]))} aria-label={`${g.title}: ${g.progress[0]} of ${g.progress[1]}`} className="mt-1 h-1.5" />}
          </li>
        ))}
      </ul>
    </section>
  );
}
