// Always one clear next objective and one longer-term goal (staff design §7).
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EXPANSION_LEVEL } from "@/tycoon/expansion";
import { objectives, type Objective, type ObjectiveAction } from "@/tycoon/objectives";
import { level } from "@/tycoon/progress";
import type { TycoonState } from "@/tycoon/types";

const ACTION_LABEL: Record<ObjectiveAction, string> = { team: "Open Team", expand: "See options", finances: "Finances", build: "Start building" };
const pct = (o: Objective) => (o.progress ? Math.round((100 * o.progress[0]) / Math.max(1, o.progress[1])) : null);

export function ObjectiveBar({ state, onAction }: { state: TycoonState; onAction: (a: ObjectiveAction) => void }) {
  const { next, long } = objectives(state);
  return (
    <section aria-label="Objectives" className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Next</p>
          <p data-testid="objective-next" className="font-semibold text-secondary">{next.title}</p>
          <p className="text-xs text-muted-foreground">{next.detail}</p>
          {pct(next) !== null && <Progress value={pct(next)!} className="mt-1 h-1.5" aria-label={`${next.title}: ${pct(next)}%`} />}
        </div>
        {next.action && (
          <Button variant="outline" className="h-11 shrink-0" onClick={() => onAction(next.action!)}>
            {ACTION_LABEL[next.action]}
          </Button>
        )}
      </div>
      <div className="border-t border-border pt-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Goal</p>
        <p data-testid="objective-long" className="text-sm font-semibold text-secondary">{long.title}</p>
        <p className="text-xs text-muted-foreground">{long.detail}</p>
        {pct(long) !== null && <Progress value={pct(long)!} className="mt-1 h-1.5" aria-label={`${long.title}: ${pct(long)}%`} />}
        {next.action !== "expand" && level(state) >= EXPANSION_LEVEL && (
          <Button variant="ghost" className="mt-1 h-11 px-2 text-xs" onClick={() => onAction("expand")}>
            Expansion options
          </Button>
        )}
      </div>
    </section>
  );
}
