// Paint a room: one of 4 floor styles and one of 8 wall colours. Free.
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FLOORS, FLOOR_NAMES, ROOM_TYPE_NAMES, WALL_COLORS } from "@/tycoon/catalog";
import type { FloorStyle, Room } from "@/tycoon/types";

export function PaintSheet({ room, onApply, onClose }: { room: Room | null; onApply: (floor: FloorStyle, wall: string) => void; onClose: () => void }) {
  const [floor, setFloor] = useState<FloorStyle>(room?.floor ?? "wood");
  const [wall, setWall] = useState<string>(room?.wall ?? WALL_COLORS[0]!);
  useEffect(() => {
    if (room) {
      setFloor(room.floor);
      setWall(room.wall);
    }
  }, [room]);
  return (
    <Sheet open={!!room} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Paint the {room?.type ? ROOM_TYPE_NAMES[room.type] : "room"}</SheetTitle>
          <SheetDescription>Pick a floor and a wall colour. Painting is free.</SheetDescription>
        </SheetHeader>
        <p className="mt-3 text-sm font-semibold text-secondary">Floor</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {FLOORS.map((fl) => (
            <Button key={fl} variant={floor === fl ? "default" : "outline"} aria-pressed={floor === fl} className="h-11" onClick={() => setFloor(fl)}>
              {FLOOR_NAMES[fl]}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-sm font-semibold text-secondary">Walls</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {WALL_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              aria-label={`Wall colour ${i + 1}`}
              aria-pressed={wall === c}
              onClick={() => setWall(c)}
              className="grid h-11 w-11 place-items-center rounded-xl border-2 border-border"
              style={{ background: c, borderColor: wall === c ? "var(--primary)" : undefined }}
            >
              {wall === c && <Check className="h-5 w-5 text-secondary" />}
            </button>
          ))}
        </div>
        <Button className="mt-4 h-11 w-full" onClick={() => onApply(floor, wall)}>
          Apply paint
        </Button>
      </SheetContent>
    </Sheet>
  );
}
