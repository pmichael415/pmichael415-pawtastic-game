// The first expansion decision (staff design §5): two real options side by side, with the cost in game coins, the
// capacity added, the staffing it needs, the daily upkeep and what it makes possible — or keep saving.
import { Button } from "@/components/ui/button";
import { buyExpansion, expansionOptions } from "@/tycoon/expansion";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { TResult, TycoonState } from "@/tycoon/types";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
const coins = (n: number) => n.toLocaleString("en-US");

export function ExpansionCard({ state, act, onSave }: { state: TycoonState; act: Act; onSave: () => void }) {
  const opts = expansionOptions(state);
  return (
    <section aria-label="Expand your daycare" className="rounded-2xl border border-primary/40 bg-card p-3 shadow-soft">
      <h3 className="text-sm font-bold text-secondary">Expand your daycare</h3>
      <p className="text-xs text-muted-foreground">Hire, expand or save? Each option shows what it costs and what it needs. Prices are game coins.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {opts.map((o) => (
          <article key={o.id} aria-label={o.title} className="flex flex-col rounded-xl border border-border bg-background p-3">
            <h4 className="font-semibold text-secondary">{o.title}{o.mode === "improve" ? " · improve" : ""}</h4>
            <dl className="mt-1 space-y-0.5 text-xs">
              <div><dt className="inline font-semibold text-secondary">Cost: </dt><dd className="inline tabular-nums">{o.cost ? `${coins(o.cost)} game coins` : "—"}</dd></div>
              <div><dt className="inline font-semibold text-secondary">Adds: </dt><dd className="inline">{o.capacity}</dd></div>
              <div><dt className="inline font-semibold text-secondary">Upkeep: </dt><dd className="inline tabular-nums">{o.upkeep ? `+${coins(o.upkeep)} a day` : "—"}</dd></div>
              <div><dt className="inline font-semibold text-secondary">Staffing: </dt><dd className="inline">{o.staffing}</dd></div>
              <div><dt className="inline font-semibold text-secondary">Makes possible: </dt><dd className="inline">{o.unlocks}</dd></div>
            </dl>
            <div className="mt-auto pt-2">
              <Button className="h-11 w-full" disabled={!o.available} onClick={() => act((s) => buyExpansion(s, o.id), { event: { name: "tycoon_build", props: { kind: "expansion", action: o.id } } })}>
                {o.mode === "improve" ? "Improve" : "Build"} · {coins(o.cost)}
              </Button>
              {o.why && <p className="mt-1 text-xs text-muted-foreground">{o.why}</p>}
            </div>
          </article>
        ))}
      </div>
      <Button variant="ghost" className="mt-2 h-11" onClick={onSave}>
        Save for now
      </Button>
    </section>
  );
}
