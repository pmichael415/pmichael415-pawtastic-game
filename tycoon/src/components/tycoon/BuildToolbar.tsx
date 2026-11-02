// Sims-style build mode: the tool bar, what each tool is doing, and the ghost it shows on the 3D stage.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { GROUPS } from "@/game/engine";
import type { GroupId } from "@/game/engine";
import { DOOR_PRICE, ROOM_TYPE_NAMES, SELL_RATE, furnitureDef, outdoorDef, thingName } from "@/tycoon/catalog";
import { addDoor, connectionEstimate, costLine, drawRoom, moveRoom, moveThing, paintPaths, placeThing, removeDoor, roomContaining, setRoomType, validRoomAt, validThingAt } from "@/tycoon/build";
import { OPPOSITE, containsTile, roomPrice, stepFrom, thingTiles, type Tile } from "@/tycoon/grid";
import { level } from "@/tycoon/progress";
import { PAID_GONE, PAID_LOCK, isActive, ownedPaid } from "@/tycoon/paid";
import { fac } from "@/tycoon/state";
import type { Ghost, PickMode, TPick } from "@/tycoon/render/world";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { Door, Facility, Placed, Room, RoomType, Rot, Side, TResult, ThingKind, TycoonState } from "@/tycoon/types";
import { CatalogSheet } from "./CatalogSheet";
import { LandSheet } from "./LandSheet";

export type Tool = "rooms" | "doors" | "furniture" | "outdoor" | "paths" | "paint" | "land" | "sell";
export const TOOLS: { id: Tool; label: string }[] = [
  { id: "rooms", label: "Rooms" },
  { id: "doors", label: "Doors" },
  { id: "furniture", label: "Furniture" },
  { id: "outdoor", label: "Outdoor" },
  { id: "paths", label: "Paths" },
  { id: "paint", label: "Paint" },
  { id: "land", label: "Land" },
  { id: "sell", label: "Sell" },
];

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
export type FxFn = (kind: "drop" | "sparkle" | "coins" | "confetti" | "puff", at: { c: number; r: number } | "hud") => void;

export type BuildUi = {
  tool: Tool | null;
  corner: Tile | null;
  end: Tile | null;
  typing: string | null;
  door: { room: string; door: Door } | null;
  doorError: string | null;
  item: ThingKind | null;
  at: Tile | null;
  rot: Rot;
  moving: string | null;
  movingRoom: string | null;
  roomAt: Tile | null;
  paths: Tile[];
};
const EMPTY: BuildUi = { tool: null, corner: null, end: null, typing: null, door: null, doorError: null, item: null, at: null, rot: 0, moving: null, movingRoom: null, roomAt: null, paths: [] };

const onSide = (room: Room, c: number, r: number, side: Side) =>
  side === "N" ? r === room.r : side === "S" ? r === room.r + room.d - 1 : side === "W" ? c === room.c : c === room.c + room.w - 1;
const along = (side: Side) => side === "N" || side === "S";

/** The room and door for a tapped wall edge (from inside either room that shares it). */
export function doorForEdge(f: Facility, c: number, r: number, side: Side): { room: Room; door: Door } | null {
  const inside = f.rooms.find((room) => containsTile(room, { c, r }) && onSide(room, c, r, side));
  if (inside) return { room: inside, door: { side, i: along(side) ? c - inside.c : r - inside.r } };
  const t = stepFrom({ c, r }, side);
  const opp = OPPOSITE[side];
  const other = f.rooms.find((room) => containsTile(room, t) && onSide(room, t.c, t.r, opp));
  if (other) return { room: other, door: { side: opp, i: along(opp) ? t.c - other.c : t.r - other.r } };
  return null;
}

const rectOf = (a: Tile, b: Tile) => ({ c: Math.min(a.c, b.c), r: Math.min(a.r, b.r), w: Math.abs(a.c - b.c) + 1, d: Math.abs(a.r - b.r) + 1 });
const draftRoom = (uid: string, c: number, r: number, w: number, d: number): Room => ({ uid, c, r, w, d, type: null, group: null, doors: [], floor: "wood", wall: "#F4EDE4", spent: 0, closed: false });
const short = (s: TycoonState, price: number) => (s.coins < 0 ? "Paused until your coins are back above zero." : s.coins < price ? `Need ${price - s.coins} more coins.` : null);

/** Build-mode state and everything derived from it (ghost, pick mode, reasons). */
export function useBuild(state: TycoonState, act: Act, fx: FxFn) {
  const [ui, setUi] = useState<BuildUi>(EMPTY);
  const f = fac(state);
  const patch = (p: Partial<BuildUi>) => setUi((u) => ({ ...u, ...p }));

  const derived = useMemo(() => {
    let ghost: Ghost | null = null;
    let label: string | null = null;
    let reason: string | null = null;
    if (ui.tool === "rooms" && ui.corner && ui.end) {
      const { c, r, w, d } = rectOf(ui.corner, ui.end);
      const price = roomPrice(w, d);
      const est = connectionEstimate(f, { c, r, w, d });
      reason = validRoomAt(f, draftRoom("ghost", c, r, w, d)) ?? short(state, est?.total ?? price);
      label = `${w} × ${d} · ${costLine(est, price)}`;
      ghost = { kind: "room", c, r, w, d, ok: !reason, label };
    } else if (ui.movingRoom && ui.roomAt) {
      const room = f.rooms.find((x) => x.uid === ui.movingRoom);
      if (room) {
        reason = validRoomAt(f, { ...room, c: ui.roomAt.c, r: ui.roomAt.r }, room.uid);
        label = "Move here";
        ghost = { kind: "room", c: ui.roomAt.c, r: ui.roomAt.r, w: room.w, d: room.d, ok: !reason, label };
      }
    } else if (ui.tool === "doors" && ui.door) {
      const room = f.rooms.find((x) => x.uid === ui.door!.room);
      if (room) {
        const exists = room.doors.some((d) => d.side === ui.door!.door.side && d.i === ui.door!.door.i);
        reason = exists ? null : validRoomAt(f, { ...room, doors: [...room.doors, ui.door.door] }) ?? short(state, DOOR_PRICE);
        ghost = { kind: "door", room: room.uid, door: ui.door.door, ok: !reason };
      }
    } else if ((ui.tool === "furniture" || ui.tool === "outdoor") && ui.item && ui.at) {
      const def = furnitureDef(ui.item) ?? outdoorDef(ui.item);
      const draft: Placed = { uid: ui.moving ?? "ghost", kind: ui.item, c: ui.at.c, r: ui.at.r, rot: ui.rot, level: 1, spent: 0, room: null, closed: false };
      const room = furnitureDef(ui.item) ? roomContaining(f, thingTiles(draft))?.uid ?? null : null;
      reason =
        (!isActive(ui.item) ? (ui.moving ? PAID_GONE : PAID_LOCK) : null) ??
        (!ui.moving && def && def.unlock > level(state) ? `Unlocks at level ${def.unlock}.` : null) ??
        validThingAt(f, { ...draft, room }, ui.moving) ??
        (ui.moving ? null : short(state, def?.price ?? 0));
      ghost = { kind: "thing", thing: ui.item, c: ui.at.c, r: ui.at.r, rot: ui.rot, ok: !reason };
    } else if (ui.tool === "paths" && ui.paths.length) {
      reason = short(state, ui.paths.length * 10);
      ghost = { kind: "paths", tiles: ui.paths, ok: !reason };
    }
    const pickMode: PickMode = ui.tool === "doors" ? "edges" : ui.movingRoom || ui.tool === "rooms" || ui.tool === "paths" || ((ui.tool === "furniture" || ui.tool === "outdoor") && ui.item) ? "tiles" : "objects";
    return { ghost, label, reason, pickMode };
  }, [ui, f, state]);

  /** Handles a tap while building. Returns false when the tap is for selection (no tool, Paint or Sell). */
  function onPick(p: TPick | null): boolean {
    if (!p) return false;
    if (ui.movingRoom) {
      if (p.kind === "tile") patch({ roomAt: { c: p.c, r: p.r } });
      return true;
    }
    switch (ui.tool) {
      case "rooms":
        if (p.kind !== "tile") return true;
        if (!ui.corner || ui.end || ui.typing) patch({ corner: { c: p.c, r: p.r }, end: null, typing: null });
        else patch({ end: { c: p.c, r: p.r } });
        return true;
      case "doors": {
        if (p.kind !== "edge") {
          patch({ door: null, doorError: "Tap closer to a wall." });
          return true;
        }
        const hit = doorForEdge(f, p.c, p.r, p.side);
        patch(hit ? { door: { room: hit.room.uid, door: hit.door }, doorError: null } : { door: null, doorError: "That's not a room wall." });
        return true;
      }
      case "furniture":
      case "outdoor":
        if (ui.item && p.kind === "tile") patch({ at: { c: p.c, r: p.r } });
        return true;
      case "paths":
        if (p.kind === "tile") {
          const has = ui.paths.some((t) => t.c === p.c && t.r === p.r);
          patch({ paths: has ? ui.paths.filter((t) => !(t.c === p.c && t.r === p.r)) : [...ui.paths, { c: p.c, r: p.r }] });
        }
        return true;
      case "land":
        return true;
      default:
        return false; // no tool, Paint and Sell select what was tapped
    }
  }

  const setTool = (tool: Tool | null) => setUi({ ...EMPTY, tool });

  function buildRoom() {
    if (!ui.corner || !ui.end) return;
    const { c, r, w, d } = rectOf(ui.corner, ui.end);
    const uid = "r" + state.seq;
    const res = act((s) => drawRoom(s, c, r, w, d), { event: { name: "tycoon_build", props: { kind: "room", action: "place" } } });
    if (res.ok) {
      fx("drop", { c: c + Math.floor(w / 2), r: r + Math.floor(d / 2) });
      patch({ typing: uid, corner: null, end: null });
    }
  }
  function setType(type: RoomType, group?: GroupId) {
    if (!ui.typing) return;
    const uid = ui.typing;
    const res = act((s) => setRoomType(s, uid, type, group));
    if (res.ok) patch({ typing: null });
  }
  function toggleDoor() {
    if (!ui.door) return;
    const { room: uid, door } = ui.door;
    const room = f.rooms.find((x) => x.uid === uid);
    const exists = room?.doors.some((d) => d.side === door.side && d.i === door.i);
    const res = exists
      ? act((s) => removeDoor(s, uid, door), { event: { name: "tycoon_build", props: { kind: "door", action: "sell" } } })
      : act((s) => addDoor(s, uid, door), { event: { name: "tycoon_build", props: { kind: "door", action: "place" } } });
    if (res.ok) patch({ door: null });
  }
  function place() {
    if (!ui.item || !ui.at) return;
    const { item, at, rot, moving } = ui;
    const res = moving
      ? act((s) => moveThing(s, moving, at.c, at.r, rot), { event: { name: "tycoon_build", props: { kind: item, action: "move" } } })
      : act((s) => placeThing(s, item, at.c, at.r, rot), { event: { name: "tycoon_build", props: { kind: item, action: "place" } } });
    if (!res.ok) return;
    fx("drop", at);
    if (moving) setUi(EMPTY);
    else patch({ at: null });
  }
  function moveRoomHere() {
    if (!ui.movingRoom || !ui.roomAt) return;
    const { movingRoom: uid, roomAt } = ui;
    const res = act((s) => moveRoom(s, uid, roomAt.c, roomAt.r), { event: { name: "tycoon_build", props: { kind: "room", action: "move" } } });
    if (res.ok) {
      fx("drop", roomAt);
      setUi(EMPTY);
    }
  }
  function pave() {
    const tiles = ui.paths;
    const res = act((s) => paintPaths(s, tiles), { event: { name: "tycoon_build", props: { kind: "path", action: "place" } } });
    if (res.ok) {
      fx("drop", tiles[tiles.length - 1]!);
      patch({ paths: [] });
    }
  }
  const startMoveThing = (t: Placed) => setUi({ ...EMPTY, tool: furnitureDef(t.kind) ? "furniture" : "outdoor", item: t.kind, rot: t.rot, moving: t.uid, at: { c: t.c, r: t.r } });
  const startMoveRoom = (room: Room) => setUi({ ...EMPTY, movingRoom: room.uid, roomAt: { c: room.c, r: room.r } });

  return { ui, setUi, patch, setTool, onPick, buildRoom, setType, toggleDoor, place, moveRoomHere, pave, startMoveThing, startMoveRoom, ...derived };
}
export type Build = ReturnType<typeof useBuild>;

const HINTS: Record<Tool, string> = {
  rooms: "Tap one corner, then the opposite corner.",
  doors: "Tap a room's wall to add a door (30).",
  furniture: "Pick an item, then tap where it goes inside a room.",
  outdoor: "Pick an item, then tap where it goes on your land.",
  paths: "Tap squares to pave them (10 each). Tap again to remove.",
  paint: "Tap a room to paint it. Painting is free.",
  land: "Buy more land to build on.",
  sell: "Tap a room or an item to sell it for 75% back.",
};

/** The tool bar and the current tool's controls. */
export function BuildToolbar({ b, state, act, onBuyPack, hidePaid = false }: { b: Build; state: TycoonState; act: Act; onBuyPack?: () => void; hidePaid?: boolean }) {
  const { ui } = b;
  const f = fac(state);
  const [groupPick, setGroupPick] = useState(false);
  const typingRoom = ui.typing ? f.rooms.find((r) => r.uid === ui.typing) : null;
  const doorRoom = ui.door ? f.rooms.find((r) => r.uid === ui.door!.room) : null;
  const doorExists = !!doorRoom && doorRoom.doors.some((d) => d.side === ui.door!.door.side && d.i === ui.door!.door.i);
  const catalogOpen = (ui.tool === "furniture" || ui.tool === "outdoor") && !ui.item;

  return (
    <section aria-label="Build mode" className="space-y-2 rounded-2xl border border-primary/40 bg-card p-3 shadow-soft">
      <div role="toolbar" aria-label="Build tools" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TOOLS.map((t) => (
          <Button key={t.id} size="sm" variant={ui.tool === t.id ? "default" : "outline"} aria-pressed={ui.tool === t.id} className="h-11 shrink-0" onClick={() => b.setTool(ui.tool === t.id ? null : t.id)}>
            {t.label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {ui.movingRoom ? "Tap where the room's top-left corner should go." : ui.tool ? HINTS[ui.tool] : "Pick a tool, or tap a room or item to edit it."}
      </p>

      {ui.tool === "rooms" && !typingRoom && (
        <div className="space-y-2">
          {ui.corner && !ui.end && <p className="text-sm font-semibold text-secondary">Now tap the opposite corner.</p>}
          {b.label && <p className="font-display text-lg font-bold text-secondary">{b.label}</p>}
          {b.reason && <p className="text-sm font-semibold text-destructive">{b.reason}</p>}
          {ui.end && (
            <div className="flex gap-2">
              <Button className="h-11 flex-1" disabled={!!b.reason} onClick={b.buildRoom}>
                Build room · {b.label?.split(" · ")[1]}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => b.patch({ corner: null, end: null })}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
      {typingRoom && (
        <div className="space-y-2">
          <p className="font-semibold text-secondary">What's this room for?</p>
          {!groupPick ? (
            <div className="flex flex-wrap gap-2">
              {(["lobby", "playroom", "calm", "bath", "boarding", "staff"] as RoomType[]).map((t) => (
                <Button key={t} variant="outline" className="h-11" onClick={() => (t === "playroom" ? setGroupPick(true) : b.setType(t))}>
                  {ROOM_TYPE_NAMES[t]}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {GROUPS.map((g) => (
                <Button
                  key={g.id}
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setGroupPick(false);
                    b.setType("playroom", g.id);
                  }}
                >
                  {g.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      {ui.tool === "doors" && (
        <div className="space-y-2">
          {(b.reason ?? ui.doorError) && <p className="text-sm font-semibold text-destructive">{b.reason ?? ui.doorError}</p>}
          {ui.door && (
            <Button className="h-11 w-full" disabled={!doorExists && !!b.reason} onClick={b.toggleDoor}>
              {doorExists ? `Remove door · +${Math.floor(SELL_RATE * DOOR_PRICE)}` : `Add door · ${DOOR_PRICE}`}
            </Button>
          )}
        </div>
      )}
      {(ui.tool === "furniture" || ui.tool === "outdoor") && ui.item && (
        <div className="space-y-2">
          <p className="font-semibold text-secondary">
            {ui.moving ? "Moving" : "Placing"}: {thingName(ui.item)}
          </p>
          {b.reason && <p className="text-sm font-semibold text-destructive">{b.reason}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={() => b.patch({ rot: ((ui.rot + 1) % 4) as Rot })}>
              Rotate
            </Button>
            <Button className="h-11 flex-1" disabled={!ui.at || !!b.reason} onClick={b.place}>
              Place
            </Button>
            <Button variant="outline" className="h-11" onClick={() => (ui.moving ? b.setTool(null) : b.patch({ item: null, at: null }))}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {ui.movingRoom && (
        <div className="space-y-2">
          {b.reason && <p className="text-sm font-semibold text-destructive">{b.reason}</p>}
          <div className="flex gap-2">
            <Button className="h-11 flex-1" disabled={!!b.reason} onClick={b.moveRoomHere}>
              Move room here
            </Button>
            <Button variant="outline" className="h-11" onClick={() => b.setTool(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {ui.tool === "paths" && ui.paths.length > 0 && (
        <div className="space-y-2">
          {b.reason && <p className="text-sm font-semibold text-destructive">{b.reason}</p>}
          <div className="flex gap-2">
            <Button className="h-11 flex-1" disabled={!!b.reason} onClick={b.pave}>
              Done · {ui.paths.length} square{ui.paths.length === 1 ? "" : "s"} ({ui.paths.length * 10})
            </Button>
            <Button variant="outline" className="h-11" onClick={() => b.patch({ paths: [] })}>
              Clear
            </Button>
          </div>
        </div>
      )}
      <CatalogSheet
        open={catalogOpen}
        tab={ui.tool === "outdoor" ? "outdoor" : "furniture"}
        level={level(state)}
        coins={state.coins}
        owned={ownedPaid()}
        onPick={(kind) => b.patch({ item: kind, at: null, rot: 0 })}
        onClose={() => b.setTool(null)}
        onBuyPack={onBuyPack}
        hidePaid={hidePaid}
      />
      <LandSheet open={ui.tool === "land"} state={state} act={act} onClose={() => b.setTool(null)} />
    </section>
  );
}
