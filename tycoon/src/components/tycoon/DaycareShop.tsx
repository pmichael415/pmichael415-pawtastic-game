// The new Daycare's in-game shop (spec: "Buying inside a game"). Phase 1: coins and the Deluxe Daycare Decor looks;
// phase 2 adds Boosts and more items. Every item opens the shared buy sheet and returns to this game.
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BuySheet } from "@/components/purchases/BuySheet";
import { PAID_PRODUCTS, formatPrice, type PaidProduct } from "@/lib/catalog";

const mine = PAID_PRODUCTS.filter((p) => p.game === "daycare-next");
const coins = mine.filter((p) => p.kind === "consumable");
const looks = mine.filter((p) => p.kind === "looks");

function Row({ p, owned, onPick }: { p: PaidProduct; owned: boolean; onPick: (p: PaidProduct) => void }) {
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-secondary">{p.name}</p>
        <p className="text-xs text-muted-foreground">{p.blurb}</p>
      </div>
      {owned ? (
        <span className="shrink-0 rounded-full bg-accent px-2 py-1 text-xs font-bold text-accent-foreground">Owned</span>
      ) : (
        <button
          type="button"
          onClick={() => onPick(p)}
          aria-label={`${p.name}, ${formatPrice(p)}`}
          className="min-h-11 shrink-0 rounded-xl bg-primary px-3 font-display font-bold text-primary-foreground"
        >
          {formatPrice(p)}
        </button>
      )}
    </li>
  );
}

export function DaycareShop({ open, onClose, owned }: { open: boolean; onClose: () => void; owned: ReadonlySet<string> }) {
  const [picked, setPicked] = useState<PaidProduct | null>(null);
  return (
    <>
      <Sheet open={open && !picked} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="mx-auto max-h-[85svh] max-w-md overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Daycare Shop</SheetTitle>
            <SheetDescription>Coins go straight into your daycare. Prices are real money, charged by Stripe.</SheetDescription>
          </SheetHeader>
          <section aria-label="Coins" className="mt-2">
            <h3 className="font-display text-base font-bold text-secondary">Coins</h3>
            <ul className="divide-y divide-border">
              {coins.map((p) => (
                <Row key={p.id} p={p} owned={false} onPick={setPicked} />
              ))}
            </ul>
          </section>
          <section aria-label="Items & themes" className="mt-3">
            <h3 className="font-display text-base font-bold text-secondary">Items & themes</h3>
            <ul className="divide-y divide-border">
              {looks.map((p) => (
                <Row key={p.id} p={p} owned={owned.has(p.id)} onPick={setPicked} />
              ))}
            </ul>
          </section>
        </SheetContent>
      </Sheet>
      {picked && <BuySheet product={picked} returnTo="/daycare-next" open onClose={() => setPicked(null)} />}
    </>
  );
}
