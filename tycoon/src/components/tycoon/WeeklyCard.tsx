// This week's challenge in the new Daycare: one goal, progress, and the game-coin reward. Missing a week costs nothing.
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { nyDateKey } from "@/game/engine";
import { claimWeekly, weeklyStatus } from "@/tycoon/weekly";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { TResult, TycoonState } from "@/tycoon/types";

/** Days until the New York week ends (Sunday night). */
export function daysLeftInWeek(ms = Date.now()) {
  const [y, m, d] = nyDateKey(ms).split("-").map(Number) as [number, number, number];
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon = 0
  return 7 - dow;
}

export function WeeklyCard({ state, act }: { state: TycoonState; act: (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult }) {
  const st = weeklyStatus(state);
  if (!st) return null;
  const left = daysLeftInWeek();
  return (
    <section aria-label="Weekly challenge" className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="flex items-baseline gap-2">
        <p className="eyebrow">Weekly challenge · {left === 1 ? "ends tonight" : `${left} days left`}</p>
        <p className="ml-auto text-xs font-bold text-primary">+{st.goal.reward} coins</p>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <h2 className="font-semibold text-secondary">{st.goal.label}</h2>
        <span className="ml-auto text-sm font-semibold tabular-nums text-secondary">
          {st.progress}/{st.target}
        </span>
      </div>
      <Progress value={(st.progress / st.target) * 100} aria-label={`${st.goal.label}: ${st.progress} of ${st.target}`} className="mt-1 h-2" />
      {st.goal.id === "profit_day" && <p className="mt-1 text-[11px] text-muted-foreground">Counts finished game days; building doesn't count against a day.</p>}
      {st.claimed ? (
        <p className="mt-2 text-sm text-muted-foreground">Claimed — a new challenge starts Monday.</p>
      ) : st.done ? (
        <Button className="mt-2 h-11 w-full" onClick={() => act(claimWeekly, { event: { name: "tycoon_weekly", props: { goal: st.goal.id } } })}>
          Claim +{st.goal.reward} coins
        </Button>
      ) : null}
    </section>
  );
}
