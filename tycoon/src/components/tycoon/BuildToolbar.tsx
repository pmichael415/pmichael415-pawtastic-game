// Sims-style build mode: the tool bar, what each tool is doing, and the ghost it shows on the 3D stage.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { GROUPS } from "@/game/engine";
import type { GroupId } from "@/game/engine";
import { DOOR_PRICE, ONE_PER_FACILITY, ROOM_MAX, ROOM_MIN, ROOM_TYPE_NAMES, SELL_RATE, furnitureDef, outdoorDef, thingName } from "@/tycoon/catalog";
import { DEFAULT_ROOM_SIZE, addDoor, buildConnectedRoom, costLine, moveRoom, moveThing, paintPaths, placeThing, planRoom, removeDoor, roomContaining, setRoomType, spotInRoom, validRoomAt, validThingAt, type RoomPlan } from "@/tycoon/build";
import { OPPOSITE, containsTile, roomPrice, stepFrom, thingTiles, type Tile } from "@/tycoon/grid";
import { roomStatus } from "@/tycoon/connect";
import { level } from "@/tycoon/progress";
import { roomName } from "@/tycoon/rooms";
import { PAID_GONE, PAID_LOCK, isActive, ownedPaid } from "@/tycoon/paid";
import { fac } from "@/tycoon/state";
import type { FxKind, Ghost, PickMode, TPick } from "@/tycoon/render/world";
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
export type FxFn = (kind: FxKind, at: { c: number; r: number } | "hud") => void;

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
  /** Placing a room type-first (empire milestone §2): its type, playroom group, size and the tapped spot. */
  kind: RoomType | null;
  group: GroupId | null;
  size: { w: number; d: number } | null;
  spot: Tile | null;
  /** The room being furnished (chosen first), and whether its catalog is open. */
  dest: string | null;
  browse: boolean;
};
const EMPTY: BuildUi = { tool: null, corner: null, end: null, typing: null, door: null, doorError: null, item: null, at: null, rot: 0, moving: null, movingRoom: null, roomAt: null, paths: [], kind: null, group: null, size: null, spot: null, dest: null, browse: false };

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
/** The room's rectangle centred on the tapped square. */
const rectAt = (spot: Tile, size: { w: number; d: number }) => ({ c: spot.c - Math.floor((size.w - 1) / 2), r: spot.r - Math.floor((size.d - 1) / 2), w: size.w, d: size.d });
/** "Its door opens into the Lobby" / "a new path of 4 squares to the entrance" — the connection a plan makes. */
function connectionLine(f: Facility, plan: RoomPlan): string | null {
  if (!plan.ok) return null;
  if (plan.via) return `Its door opens into the ${roomName(f, plan.via)} — no path needed.`;
  if (!plan.paths.length) return "Its door opens onto the path to the entrance.";
  return `A new path of ${plan.paths.length} square${plan.paths.length === 1 ? "" : "s"} (green) leads to the entrance.`;
}
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
    let plan: RoomPlan | null = null;
    let connection: string | null = null;
    let placeAt: { at: Tile; rot: Rot } | null = null;
    if (ui.tool === "rooms" && ui.kind && ui.size && ui.spot) {
      const rect = rectAt(ui.spot, ui.size);
      const name = ROOM_TYPE_NAMES[ui.kind];
      plan = planRoom(f, rect);
      reason = plan.ok ? short(state, plan.cost.total) : plan.reason;
      label = `${name} ${rect.w} × ${rect.d}${plan.ok ? ` · ${costLine(plan.cost)}` : ""}`;
      connection = connectionLine(f, plan);
      ghost = { kind: "room", ...rect, ok: !reason, label: plan.ok ? `${name} · ${plan.cost.total}` : name, ...(plan.ok ? { door: plan.door, route: plan.paths } : {}) };
    } else if (ui.tool === "rooms" && ui.corner && ui.end) {
      const rect = rectOf(ui.corner, ui.end);
      plan = planRoom(f, rect);
      reason = plan.ok ? short(state, plan.cost.total) : plan.reason;
      label = `${rect.w} × ${rect.d} · ${costLine(plan.ok ? plan.cost : null, roomPrice(rect.w, rect.d))}`;
      connection = connectionLine(f, plan);
      ghost = { kind: "room", ...rect, ok: !reason, label, ...(plan.ok ? { door: plan.door, route: plan.paths } : {}) };
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
    } else if ((ui.tool === "furniture" || ui.tool === "outdoor") && ui.item && (ui.at || ui.dest)) {
      // Furnishing a chosen room: until you tap a square, the item waits at the room's first free spot.
      let at = ui.at;
      let rot = ui.rot;
      if (!at && ui.dest) {
        const sp = spotInRoom(f, ui.dest, ui.item, state.seq);
        if ("error" in sp) reason = sp.error;
        else {
          at = { c: sp.c, r: sp.r };
          rot = sp.rot;
        }
      }
      if (at) {
        const def = furnitureDef(ui.item) ?? outdoorDef(ui.item);
        const draft: Placed = { uid: ui.moving ?? "ghost", kind: ui.item, c: at.c, r: at.r, rot, level: 1, spent: 0, room: null, closed: false };
        const room = furnitureDef(ui.item) ? roomContaining(f, thingTiles(draft))?.uid ?? null : null;
        reason =
          (!isActive(ui.item) ? (ui.moving ? PAID_GONE : PAID_LOCK) : null) ??
          (!ui.moving && def && def.unlock > level(state) ? `Unlocks at level ${def.unlock}.` : null) ??
          (ui.dest && room !== ui.dest ? `That's outside the ${roomName(f, ui.dest)} — tap a square inside it.` : null) ??
          validThingAt(f, { ...draft, room }, ui.moving) ??
          (ui.moving ? null : short(state, def?.price ?? 0));
        ghost = { kind: "thing", thing: ui.item, c: at.c, r: at.r, rot, ok: !reason };
        placeAt = { at, rot };
      }
    } else if (ui.tool === "paths" && ui.paths.length) {
      reason = short(state, ui.paths.length * 10);
      ghost = { kind: "paths", tiles: ui.paths, ok: !reason };
    }
    const pickMode: PickMode = ui.tool === "doors" ? "edges" : ui.movingRoom || ui.tool === "rooms" || ui.tool === "paths" || ((ui.tool === "furniture" || ui.tool === "outdoor") && ui.item) ? "tiles" : "objects";
    return { ghost, label, reason, pickMode, plan, connection, placeAt };
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
        if (ui.kind) patch({ spot: { c: p.c, r: p.r } });
        else if (!ui.corner || ui.end || ui.typing) patch({ corner: { c: p.c, r: p.r }, end: null, typing: null });
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
        // Choose the room first: tapping a room (or something in it) furnishes that room.
        if (!ui.item && !ui.dest) {
          const uid = p.kind === "room" ? p.uid : p.kind === "thing" ? (f.items.find((i) => i.uid === p.uid)?.room ?? null) : null;
          if (uid && f.rooms.some((r) => r.uid === uid && r.type)) patch({ dest: uid, browse: true });
          return true;
        }
        if (ui.item && p.kind === "tile") patch({ at: { c: p.c, r: p.r } });
        return true;
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

  /** Draw mode: the room, its door and the path squares, for the total shown — then pick what it's for. */
  function buildRoom() {
    const plan = derived.plan;
    if (!ui.corner || !ui.end || !plan?.ok || derived.reason) return;
    const { rect } = plan;
    const uid = "r" + state.seq;
    const res = act((s) => buildConnectedRoom(s, rect, null), { event: { name: "tycoon_build", props: { kind: "room", action: "place" } } });
    if (res.ok) {
      fx("drop", { c: rect.c + Math.floor(rect.w / 2), r: rect.r + Math.floor(rect.d / 2) });
      patch({ typing: uid, corner: null, end: null });
    }
  }
  function setType(type: RoomType, group?: GroupId) {
    if (!ui.typing) return;
    const uid = ui.typing;
    const res = act((s) => setRoomType(s, uid, type, group));
    if (res.ok) setUi({ ...EMPTY, tool: "furniture", dest: uid }); // furnishing it is next
  }
  /** Type-first: choose what to build; its usual size is the starting outline. */
  const chooseKind = (kind: RoomType, group?: GroupId) => patch({ kind, group: group ?? null, size: DEFAULT_ROOM_SIZE[kind], spot: null, corner: null, end: null });
  const resize = (dw: number, dd: number) => {
    if (!ui.size) return;
    const clamp = (n: number) => Math.min(ROOM_MAX, Math.max(ROOM_MIN, n));
    patch({ size: { w: clamp(ui.size.w + dw), d: clamp(ui.size.d + dd) } });
  };
  const turn = () => ui.size && patch({ size: { w: ui.size.d, d: ui.size.w } });
  /** Confirm: room + door + path + type in one step, charged once for exactly the price shown; then furnish it. */
  function buildHere() {
    const plan = derived.plan;
    if (!ui.kind || !plan?.ok || derived.reason) return;
    const { rect } = plan;
    const kind = ui.kind;
    const group = ui.group ?? undefined;
    const uid = "r" + state.seq;
    const res = act((s) => buildConnectedRoom(s, rect, kind, group), { event: { name: "tycoon_build", props: { kind: "room", action: "place" } } });
    if (res.ok) {
      fx("drop", { c: rect.c + Math.floor(rect.w / 2), r: rect.r + Math.floor(rect.d / 2) });
      setUi({ ...EMPTY, tool: "furniture", dest: uid });
    }
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
    const spot = derived.placeAt;
    if (!ui.item || !spot || derived.reason) return;
    const { item, moving } = ui;
    const { at, rot } = spot;
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
  /** Rotate where the item is now (its first free spot, until you tap one). */
  const rotate = () => {
    const base = derived.placeAt;
    patch({ at: base?.at ?? ui.at, rot: (((base?.rot ?? ui.rot) + 1) % 4) as Rot });
  };
  /** Furnish a room chosen elsewhere (its panel): build mode with that room picked. */
  const furnish = (uid: string) => setUi({ ...EMPTY, tool: "furniture", dest: uid });
  const startMoveThing = (t: Placed) => setUi({ ...EMPTY, tool: furnitureDef(t.kind) ? "furniture" : "outdoor", item: t.kind, rot: t.rot, moving: t.uid, at: { c: t.c, r: t.r } });
  const startMoveRoom = (room: Room) => setUi({ ...EMPTY, movingRoom: room.uid, roomAt: { c: room.c, r: room.r } });

  return { ui, setUi, patch, setTool, onPick, buildRoom, setType, chooseKind, resize, turn, buildHere, furnish, toggleDoor, place, rotate, moveRoomHere, pave, startMoveThing, startMoveRoom, ...derived };
}
export type Build = ReturnType<typeof useBuild>;

const HINTS: Record<Tool, string> = {
  rooms: "Choose what to build, then tap where it goes.",
  doors: "Tap a room's wall to add a door (30).",
  furniture: "Choose the room first, then what goes in it.",
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
  const [kindGroupPick, setKindGroupPick] = useState(false);
  const typingRoom = ui.typing ? f.rooms.find((r) => r.uid === ui.typing) : null;
  const destRoom = ui.dest ? f.rooms.find((r) => r.uid === ui.dest) ?? null : null;
  const destName = destRoom ? roomName(f, destRoom.uid) : "";
  const kinds = (["playroom", "bath", "boarding", "calm", "staff", "lobby"] as RoomType[]).filter((t) => !(ONE_PER_FACILITY.includes(t) && f.rooms.some((r) => r.type === t)));
  const furnishable = f.rooms.filter((r) => r.type);
  const doorRoom = ui.door ? f.rooms.find((r) => r.uid === ui.door!.room) : null;
  const doorExists = !!doorRoom && doorRoom.doors.some((d) => d.side === ui.door!.door.side && d.i === ui.door!.door.i);
  const catalogOpen = !ui.item && ((ui.tool === "furniture" && !!destRoom && ui.browse) || ui.tool === "outdoor");

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

      {ui.tool === "rooms" && !typingRoom && !ui.kind && !ui.corner && (
        <section aria-label="Choose a room to build" className="space-y-2">
          <p className="font-semibold text-secondary">What do you want to build?</p>
          {!kindGroupPick ? (
            <div className="flex flex-wrap gap-2">
              {kinds.map((t) => (
                <Button key={t} variant="outline" className="h-11" onClick={() => (t === "playroom" ? setKindGroupPick(true) : b.chooseKind(t))}>
                  {ROOM_TYPE_NAMES[t]}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Which pups will play there?</p>
              <div className="flex flex-wrap gap-2">
                {GROUPS.map((g) => (
                  <Button
                    key={g.id}
                    variant="outline"
                    className="h-11"
                    onClick={() => {
                      setKindGroupPick(false);
                      b.chooseKind("playroom", g.id);
                    }}
                  >
                    {g.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Or tap two corners on the ground to draw a room of any size.</p>
        </section>
      )}
      {ui.tool === "rooms" && ui.kind && ui.size && (
        <section aria-label="Choose a spot" className="space-y-2">
          <p className="font-semibold text-secondary">
            Placing: {ROOM_TYPE_NAMES[ui.kind]}
            {ui.group ? ` · ${GROUPS.find((g) => g.id === ui.group)?.name ?? ""}` : ""} · {ui.size.w} × {ui.size.d}
          </p>
          {!ui.spot && <p className="text-sm text-muted-foreground">Tap where it goes. The outline shows its door and the way in; nothing is charged until you confirm.</p>}
          {b.label && ui.spot && <p className="font-display text-lg font-bold text-secondary">{b.label}</p>}
          {b.connection && <p className="text-sm font-semibold text-success">✓ {b.connection}</p>}
          {b.reason && <p className="text-sm font-semibold text-destructive">{b.reason}</p>}
          <div className="flex flex-wrap gap-2">
            {b.plan?.ok && (
              <Button className="h-11 flex-1" disabled={!!b.reason} onClick={b.buildHere}>
                Build here · {b.plan.cost.total.toLocaleString("en-US")}
              </Button>
            )}
            {ui.spot && (
              <Button variant="outline" className="h-11" onClick={() => b.patch({ spot: null })}>
                Cancel
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-11" onClick={b.turn}>
              Turn
            </Button>
            <Button variant="outline" size="sm" className="h-11" onClick={() => b.resize(-1, -1)}>
              Smaller
            </Button>
            <Button variant="outline" size="sm" className="h-11" onClick={() => b.resize(1, 1)}>
              Bigger
            </Button>
            <Button variant="ghost" size="sm" className="h-11" onClick={() => b.patch({ kind: null, group: null, size: null, spot: null })}>
              Change room type
            </Button>
          </div>
        </section>
      )}
      {ui.tool === "rooms" && !typingRoom && !ui.kind && ui.corner && (
        <div className="space-y-2">
          {ui.corner && !ui.end && <p className="text-sm font-semibold text-secondary">Now tap the opposite corner.</p>}
          {b.label && <p className="font-display text-lg font-bold text-secondary">{b.label}</p>}
          {b.connection && <p className="text-sm font-semibold text-success">✓ {b.connection}</p>}
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
      {ui.tool === "furniture" && !ui.item && !ui.moving && !destRoom && (
        <section aria-label="Choose a room to furnish" className="space-y-2">
          <p className="font-semibold text-secondary">Which room are you furnishing?</p>
          {furnishable.length ? (
            <div className="flex flex-wrap gap-2">
              {furnishable.map((r) => {
                const st = roomStatus(f, r);
                return (
                  <Button key={r.uid} variant="outline" className="h-auto min-h-11 flex-col items-start py-1 text-left" onClick={() => b.patch({ dest: r.uid, browse: true })}>
                    <span>{roomName(f, r.uid)}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">{st.working ? "working" : (st.reason ?? "not working yet")}</span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Build a room first — use Rooms.</p>
          )}
          <p className="text-xs text-muted-foreground">Or tap a room in your daycare.</p>
        </section>
      )}
      {ui.tool === "furniture" && destRoom && !ui.item && (
        <div className="space-y-2">
          <p className="font-semibold text-secondary">Furnishing: {destName}</p>
          {(() => {
            const st = roomStatus(f, destRoom);
            return <p className={`text-sm ${st.working ? "text-success" : "text-muted-foreground"}`}>{st.working ? "✓ Working — add more to raise Fun and Appeal." : `Not working yet: ${st.reason ?? "it needs furniture"}.`}</p>;
          })()}
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 flex-1" onClick={() => b.patch({ browse: true })}>
              Choose furniture for the {destName}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => b.patch({ dest: null, browse: false })}>
              Another room
            </Button>
          </div>
        </div>
      )}
      {(ui.tool === "furniture" || ui.tool === "outdoor") && ui.item && (
        <div className="space-y-2">
          <p className="font-semibold text-secondary">
            {ui.moving ? "Moving" : destRoom ? `Furnishing: ${destName} ·` : "Placing:"} {thingName(ui.item)}
          </p>
          {destRoom && !ui.at && !b.reason && <p className="text-sm text-muted-foreground">It goes where the outline is — or tap another square inside the {destName}.</p>}
          {b.reason && <p className="text-sm font-semibold text-destructive">{b.reason}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={b.rotate}>
              Rotate
            </Button>
            <Button className="h-11 flex-1" disabled={!b.placeAt || !!b.reason} onClick={b.place}>
              {destRoom && !ui.moving ? `Put it in ${destName}${ui.at ? " here" : ""}` : "Place"}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => (ui.moving ? b.setTool(null) : b.patch({ item: null, at: null, browse: false }))}>
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
        onPick={(kind) => b.patch({ item: kind, at: null, rot: 0, browse: false })}
        onClose={() => (ui.tool === "furniture" ? b.patch({ browse: false }) : b.setTool(null))}
        room={destRoom?.type ? { type: destRoom.type, name: destName } : null}
        onBuyPack={onBuyPack}
        hidePaid={hidePaid}
      />
      <LandSheet open={ui.tool === "land"} state={state} act={act} onClose={() => b.setTool(null)} />
    </section>
  );
}
