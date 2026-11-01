// Land for sale: each parcel's price and the level it needs.
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PARCELS } from "@/tycoon/catalog";
import { buyLand } from "@/tycoon/build";
import { level } from "@/tycoon/progress";
import { fac } from "@/tycoon/state";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { TResult, TycoonState } from "@/tycoon/types";

export function LandSheet({ open, state, act, onClose }: { open: boolean; state: TycoonState; act: (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult; onClose: () => void }) {
  const f = fac(state);
  const lv = level(state);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[75svh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Land</SheetTitle>
          <SheetDescription>More land means more rooms and bigger play yards. It's yours for good once bought.</SheetDescription>
        </SheetHeader>
        <ul className="mt-2 divide-y divide-border">
          {PARCELS.map((p) => {
            const owned = f.land.includes(p.id);
            return (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-secondary">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.c1 - p.c0} × {p.r1 - p.r0} squares{owned ? " · yours" : ` · ${p.price.toLocaleString()} coins`}
                  </p>
                </div>
                {owned ? (
                  <span className="text-xs font-semibold text-primary">Owned</span>
                ) : p.level > lv ? (
                  <span className="text-xs font-semibold text-muted-foreground">Unlocks at level {p.level}</span>
                ) : (
                  <Button
                    size="sm"
                    className="h-10"
                    aria-label={`Buy ${p.name} for ${p.price.toLocaleString()} coins`}
                    onClick={() => act((s) => buyLand(s, p.id), { event: { name: "tycoon_land", props: { parcel: p.id } } })}
                  >
                    Buy · {p.price.toLocaleString()}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
