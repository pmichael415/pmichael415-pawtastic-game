// Today's Daycare: the Blue Ribbon pieces worn or bought from inside the game (spec: "Buying inside a game").
// Ownership comes only from server entitlements (useEntitlements); the switches are the player's preferences.
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BuySheet } from "@/components/purchases/BuySheet";
import { formatPrice, productById } from "@/lib/catalog";
import { PAID_ITEMS, type PaidItemId } from "@/lib/paidVisuals";

const PIECES = PAID_ITEMS.filter((i) => i.pack === "blue-ribbon-style");
type PieceId = "ribbon-collar" | "navy-star-bandana" | "sparkle-trail";

export function PupStyleSheet({
  open,
  onClose,
  owned,
  on,
  onToggle,
  go,
}: {
  open: boolean;
  onClose: () => void;
  owned: boolean;
  on: Record<PieceId, boolean>;
  onToggle: (id: PaidItemId, on: boolean) => void;
  go?: (url: string) => void;
}) {
  const pack = productById("blue-ribbon-style")!;
  const [buying, setBuying] = useState(false);
  return (
    <>
      <Sheet open={open && !buying} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Pup style</SheetTitle>
            <SheetDescription>Looks only. Every room, upgrade and location stays free to earn.</SheetDescription>
          </SheetHeader>
          <ul className="mt-2 divide-y divide-border">
            {PIECES.map((p) => {
              const worn = on[p.id as PieceId];
              return (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1 font-semibold text-secondary">{p.name}</span>
                  {owned && (
                    <button
                      type="button"
                      onClick={() => onToggle(p.id, !worn)}
                      aria-label={`${worn ? "Take off" : "Put on"} ${p.name}`}
                      className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-sm font-bold text-secondary"
                    >
                      {worn ? "Take off" : "Put on"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!owned && (
            <button
              type="button"
              onClick={() => setBuying(true)}
              aria-label={`Buy the ${pack.name}, ${formatPrice(pack)}`}
              className="mt-3 min-h-11 w-full rounded-xl bg-primary font-display font-bold text-primary-foreground"
            >
              {`${pack.name} · ${formatPrice(pack)}`}
            </button>
          )}
        </SheetContent>
      </Sheet>
      {buying && <BuySheet product={pack} returnTo="/daycare" open onClose={() => setBuying(false)} {...(go ? { go } : {})} />}
    </>
  );
}
