// The build catalog in a bottom sheet: price, size, what it does and where it goes; locked entries say when.
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FURNITURE, OUTDOOR, ROOM_TYPE_NAMES } from "@/tycoon/catalog";
import type { ThingKind } from "@/tycoon/types";

type Entry = { id: ThingKind; name: string; price: number; size: string; does: string; where: string; unlock: number };

const FURNITURE_ENTRIES: Entry[] = FURNITURE.map((f) => ({
  id: f.id,
  name: f.name,
  price: f.price,
  size: `${f.w}×${f.d}`,
  does: [f.required ? "required" : "", f.spots ? `+${f.spots} dog spot` : "", f.waiting ? `+${f.waiting} waiting spots` : "", f.boarder ? "+1 boarder" : "", f.tub ? (f.tub === "deluxe" ? "baths, +10 bath pay" : "enables baths") : "", f.staffBoost ? "staff rest +50%" : "", f.fun ? `Fun +${f.fun}` : "", f.appeal ? `Appeal +${f.appeal}` : ""].filter(Boolean).join(" · "),
  where: f.allowed === "any" ? "any room" : f.allowed.map((t) => ROOM_TYPE_NAMES[t]).join(", "),
  unlock: f.unlock,
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

export function CatalogSheet({ open, tab, level, coins, onPick, onClose }: { open: boolean; tab: "furniture" | "outdoor"; level: number; coins: number; onPick: (k: ThingKind) => void; onClose: () => void }) {
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
            return (
              <li key={e.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-secondary">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.price ? `${e.price} coins` : "free"} · {e.size} · {e.does} · {e.where}
                  </p>
                </div>
                {locked ? (
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">Unlocks at level {e.unlock}</span>
                ) : (
                  <Button size="sm" className="h-10 shrink-0" aria-label={e.name} variant={coins >= e.price ? "default" : "outline"} onClick={() => onPick(e.id)}>
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
