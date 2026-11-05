// Always one clear next objective and one longer-term goal (staff design §7).
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EXPANSION_LEVEL } from "@/tycoon/expansion";
import { objectives, savingFor, type Objective, type ObjectiveAction } from "@/tycoon/objectives";
import { level } from "@/tycoon/progress";
import { facilityStage } from "@/tycoon/stages";
import { fac } from "@/tycoon/state";
import type { TycoonState } from "@/tycoon/types";

const ACTION_LABEL: Record<ObjectiveAction, string> = { team: "Open Team", expand: "See options", finances: "Finances", build: "Start building", marketing: "Open Marketing" };
const pct = (o: Objective) => (o.progress ? Math.round((100 * o.progress[0]) / Math.max(1, o.progress[1])) : null);

export function ObjectiveBar({ state, onAction }: { state: TycoonState; onAction: (a: ObjectiveAction) => void }) {
  const { next, long } = objectives(state);
  const f = fac(state);
  // the expansion options are worked out spot by spot, so only when something they depend on changes (performance)
  const save = useMemo(() => savingFor(state, next), [state.coins, state.xp, f.rooms, f.items, f.land, f.asked, f.staff, f.prices, next.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = facilityStage(fac(state));
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
      {(() => {
        // always in view: the next expansion's price and how close you are (owner brief: earn, reinvest, expand)
        if (!save || (next.action === "expand" && next.progress)) return null; // Next already shows it
        const pctSaved = Math.min(100, Math.round((100 * save.have) / Math.max(1, save.cost)));
        const n = (x: number) => x.toLocaleString("en-US");
        return (
          <div className="border-t border-border pt-2">
            <p data-testid="saving-for" className="text-xs text-secondary">
              💰 {save.have >= save.cost ? "You can afford" : "Saving for"} <b>{save.title}</b> · {n(Math.min(save.have, save.cost))} of {n(save.cost)} coins
            </p>
            <Progress value={pctSaved} className="mt-1 h-1.5" aria-label={`Saving for ${save.title}: ${pctSaved}%`} />
            <p data-testid="saving-why" className="mt-0.5 text-[11px] text-muted-foreground">{save.purpose}</p>
          </div>
        );
      })()}
      <div className="border-t border-border pt-2">
        <p className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <span>Goal</span>
          <span data-testid="facility-stage" className="rounded-full bg-accent/40 px-2 py-0.5 normal-case tracking-normal text-secondary">
            {stage.name} · stage {stage.index + 1} of 4
          </span>
        </p>
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
