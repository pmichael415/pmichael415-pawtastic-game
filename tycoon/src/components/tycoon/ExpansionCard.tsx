// Ways to grow (staff design §5; combined-loop plan, task 4): five real options in four groups, each with its cost in
// game coins, what it adds, the staffing it needs, the daily upkeep, what it makes possible and why you might want it —
// or keep saving. A new room goes where you choose (Choose a spot); an improvement is bought here at once.
import { Button } from "@/components/ui/button";
import { EXPANSION_GROUPS, buyExpansion, expansionOptions, type ExpansionId } from "@/tycoon/expansion";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { TResult, TycoonState } from "@/tycoon/types";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
const coins = (n: number) => n.toLocaleString("en-US");

/** What a purchase changed: the new room, else the room the new or improved thing is in (to show it afterwards). */
export function boughtRoom(before: TycoonState, after: TycoonState): string | null {
  const a = before.facilities[before.active]!;
  const g = after.facilities[after.active]!;
  const rooms = new Set(a.rooms.map((r) => r.uid));
  const items = new Set(a.items.map((i) => i.uid));
  return g.rooms.find((x) => !rooms.has(x.uid))?.uid ?? g.items.find((i) => !items.has(i.uid))?.room ?? null;
}

export function ExpansionCard({ state, act, onSave, onBought, onChooseSpot }: { state: TycoonState; act: Act; onSave: () => void; onBought?: (room: string | null) => void; onChooseSpot?: (id: ExpansionId) => void }) {
  const opts = expansionOptions(state);
  return (
    <section aria-label="Expand your daycare" className="rounded-2xl border border-primary/40 bg-card p-3 shadow-soft">
      <h3 className="text-sm font-bold text-secondary">Expand your daycare</h3>
      <p className="text-xs text-muted-foreground">Five ways to grow — more families, new services, comfort or your team. Each shows what it costs, what it adds and why you might want it. Prices are game coins.</p>
      {EXPANSION_GROUPS.map((g) => {
        const here = opts.filter((o) => o.group === g.id);
        if (!here.length) return null;
        return (
          <div key={g.id} className="mt-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-primary">{g.label}</h4>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {here.map((o) => (
                <article key={o.id} aria-label={o.title} className="flex flex-col rounded-xl border border-border bg-background p-3">
                  <h5 className="font-semibold text-secondary">{o.title}{o.mode === "improve" ? " · improve" : ""}</h5>
                  <p className="text-xs italic text-secondary">{o.goodIf}</p>
                  <dl className="mt-1 space-y-0.5 text-xs">
                    <div><dt className="inline font-semibold text-secondary">Cost: </dt><dd className="inline tabular-nums">{o.cost ? `${coins(o.cost)} game coins` : "—"}</dd></div>
                    <div><dt className="inline font-semibold text-secondary">Adds: </dt><dd className="inline">{o.capacity}</dd></div>
                    <div><dt className="inline font-semibold text-secondary">Upkeep: </dt><dd className="inline tabular-nums">{o.upkeep ? `+${coins(o.upkeep)} a day` : "—"}</dd></div>
                    <div><dt className="inline font-semibold text-secondary">Staffing: </dt><dd className="inline">{o.staffing}</dd></div>
                    <div><dt className="inline font-semibold text-secondary">Makes possible: </dt><dd className="inline">{o.unlocks}</dd></div>
                  </dl>
                  <div className="mt-auto pt-2">
                    {o.mode === "new" ? (
                      <Button className="h-11 w-full" disabled={!o.available} onClick={() => onChooseSpot?.(o.id)}>
                        Choose a spot · {coins(o.cost)}
                      </Button>
                    ) : (
                      <Button
                        className="h-11 w-full"
                        disabled={!o.available}
                        onClick={() => {
                          const r = act((s) => buyExpansion(s, o.id), { event: { name: "tycoon_build", props: { kind: "expansion", action: o.id } } });
                          if (r.ok) onBought?.(boughtRoom(state, r.state)); // else the card stays, with the reason
                        }}
                      >
                        Improve · {coins(o.cost)}
                      </Button>
                    )}
                    {o.why && <p className="mt-1 text-xs text-muted-foreground">{o.why}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}
      <Button variant="ghost" className="mt-2 h-11" onClick={onSave}>
        Save for now
      </Button>
    </section>
  );
}
