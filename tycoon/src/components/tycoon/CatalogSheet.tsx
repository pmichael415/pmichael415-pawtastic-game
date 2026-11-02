// The build catalog in a bottom sheet: price, size, what it does and where it goes; locked entries say when.
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FURNITURE, OUTDOOR, ROOM_TYPE_NAMES } from "@/tycoon/catalog";
import type { ThingKind } from "@/tycoon/types";
import type { PaidItemId } from "@/lib/paidVisuals";

type Entry = { id: ThingKind; name: string; price: number; size: string; does: string; where: string; unlock: number; paid?: PaidItemId };

const FURNITURE_ENTRIES: Entry[] = FURNITURE.map((f) => ({
  id: f.id,
  name: f.name,
  price: f.price,
  size: `${f.w}×${f.d}`,
  does: [f.required ? "required" : "", f.spots ? `+${f.spots} dog spot` : "", f.waiting ? `+${f.waiting} waiting spots` : "", f.boarder ? "+1 boarder" : "", f.tub ? (f.tub === "deluxe" ? "baths, +10 bath pay" : "enables baths") : "", f.staffBoost ? "staff rest +50%" : "", f.fun ? `Fun +${f.fun}` : "", f.appeal ? `Appeal +${f.appeal}` : ""].filter(Boolean).join(" · "),
  where: f.allowed === "any" ? "any room" : f.allowed.map((t) => ROOM_TYPE_NAMES[t]).join(", "),
  unlock: f.unlock,
  ...(f.paid ? { paid: f.paid } : {}),
}));
const OUTDOOR_ENTRIES: Entry[] = OUTDOOR.filter((o) => o.id !== "path").map((o) => ({
  id: o.id,
  name: o.name,
  price: o.price,
  size: `${o.w}×${o.d}`,
  does: [o.fun ? `Fun ${o.fun.join("/")}` : "", o.appeal ? `Appeal ${o.levels === 3 ? o.appeal.join("/") : o.appeal[0]}` : "", o.levels === 3 ? "upgrades to level 3" : ""].filter(Boolean).join(" · ") || "decoration",
  where: "outdoors",
  unlock: o.unlock,
}));

export function CatalogSheet({ open, tab, level, coins, owned, onPick, onClose, onBuyPack }: { open: boolean; tab: "furniture" | "outdoor"; level: number; coins: number; owned: ReadonlySet<PaidItemId>; onPick: (k: ThingKind) => void; onClose: () => void; onBuyPack?: (() => void) | undefined }) {
  const entries = tab === "furniture" ? FURNITURE_ENTRIES : OUTDOOR_ENTRIES;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[75svh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{tab === "furniture" ? "Furniture" : "Outdoor"}</SheetTitle>
          <SheetDescription>{tab === "furniture" ? "Furniture goes inside rooms and decides what a room can do." : "Play yards, comfort and scenery for your grounds. Fun and Appeal bring happier pups and more customers."}</SheetDescription>
        </SheetHeader>
        <ul className="mt-2 divide-y divide-border">
          {entries.map((e) => {
            const locked = e.unlock > level;
            const packLocked = !!e.paid && !owned.has(e.paid);
            return (
              <li key={e.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-secondary">
                    {e.name}
                    {e.paid && !packLocked ? <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">Owned</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.price ? `${e.price} coins` : "free"} · {e.size} · {e.does} · {e.where}
                  </p>
                </div>
                {packLocked ? (
                  <div className="flex max-w-[10rem] shrink-0 flex-col items-end gap-1 text-right">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Part of the Deluxe Daycare Decor pack
                    </span>
                    {onBuyPack ? (
                      <button
                        type="button"
                        onClick={onBuyPack}
                        aria-label={`${e.name}: Get the Deluxe Daycare Decor pack`}
                        className="inline-flex min-h-11 items-center rounded-xl border border-primary px-3 text-xs font-bold text-primary"
                      >
                        Get it
                      </button>
                    ) : (
                      <a
                        href={`${import.meta.env.BASE_URL}shop`}
                        aria-label={`${e.name}: Get the Deluxe Daycare Decor pack in the Shop`}
                        className="inline-flex min-h-11 items-center rounded-xl border border-primary px-3 text-xs font-bold text-primary"
                      >
                        Get it in the Shop
                      </a>
                    )}
                  </div>
                ) : locked ? (
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">Unlocks at level {e.unlock}</span>
                ) : (
                  <Button size="sm" className="h-11 shrink-0" aria-label={e.name} variant={coins >= e.price ? "default" : "outline"} onClick={() => onPick(e.id)}>
                    Choose
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
