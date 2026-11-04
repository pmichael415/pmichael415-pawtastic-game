// Choosing where a new room (or the yard) goes (combined-loop plan, task 4): one of up to three offered spots, shown
// in the 3D view as a ghost before you pay. Nothing is built until "Build here"; Cancel changes nothing.
import { Button } from "@/components/ui/button";
import { buyExpansion, expansionOptions, type ExpansionId, type ExpansionSpot } from "@/tycoon/expansion";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { TResult, TycoonState } from "@/tycoon/types";
import { boughtRoom } from "./ExpansionCard";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
const coins = (n: number) => n.toLocaleString("en-US");

export function ExpansionSpotBar({ state, act, id, spots, index, onIndex, onCancel, onBought }: { state: TycoonState; act: Act; id: ExpansionId; spots: ExpansionSpot[]; index: number; onIndex: (i: number) => void; onCancel: () => void; onBought: (room: string | null) => void }) {
  const o = expansionOptions(state).find((x) => x.id === id);
  const sp = spots[index];
  const n = spots.length;
  return (
    <section aria-label="Choose a spot" className="fixed inset-x-0 z-40 mx-auto max-w-xl px-2" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
      <div className="rounded-2xl border-2 border-primary bg-card p-3 shadow-soft">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{o?.title ?? "New room"} · where should it go?</p>
        {sp ? (
          <>
            <p className="text-sm font-semibold text-secondary">
              Spot {index + 1} of {n} — {sp.near}
            </p>
            <p className="text-xs text-muted-foreground">The outline in the daycare shows exactly where. {coins(sp.cost)} game coins here.</p>
          </>
        ) : (
          <p className="text-sm text-secondary">There's no free spot next to your rooms — buy more land or build by hand.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {n > 1 && (
            <Button variant="outline" className="h-11" aria-label="Previous spot" onClick={() => onIndex((index + n - 1) % n)}>
              ◀
            </Button>
          )}
          {n > 1 && (
            <Button variant="outline" className="h-11" aria-label="Next spot" onClick={() => onIndex((index + 1) % n)}>
              ▶
            </Button>
          )}
          {sp && (
            <Button
              className="h-11 flex-1"
              disabled={state.coins < sp.cost}
              onClick={() => {
                const r = act((s) => buyExpansion(s, id, { c: sp.c, r: sp.r }), { event: { name: "tycoon_build", props: { kind: "expansion", action: id } } });
                if (r.ok) onBought(boughtRoom(state, r.state));
              }}
            >
              Build here · {coins(sp.cost)}
            </Button>
          )}
          <Button variant="ghost" className="h-11" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {sp && state.coins < sp.cost && <p className="mt-1 text-xs text-muted-foreground">{coins(sp.cost - state.coins)} more coins needed.</p>}
      </div>
    </section>
  );
}
