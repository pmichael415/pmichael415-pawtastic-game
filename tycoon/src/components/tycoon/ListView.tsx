// The list view: the whole game without the 3D stage — lobby, rooms, pups, and a "first free spot" builder.
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GROUPS, groupName, hireCost, MAX_STAFF } from "@/game/engine";
import type { GroupId } from "@/game/engine";
import { FURNITURE, OUTDOOR, PARCELS, ROOM_TYPE_NAMES, DOOR_PRICE, furnitureDef, outdoorDef, thingName, upgradePrice } from "@/tycoon/catalog";
import { DEFAULT_ROOM_SIZE, buildConnectedRoom, buyLand, costLine, saleValue, firstFreeRoomPlan, placeFirstFree, placeThing, rankedRoomsFor, spotInRoom, sellRoom, sellThing, setClosed, setRoomType, upgradeThing, type FirstFree } from "@/tycoon/build";
import { isActive, ownedPaid } from "@/tycoon/paid";
import { connectedRooms, roomStatus } from "@/tycoon/connect";
import { roomPrice } from "@/tycoon/grid";
import { level } from "@/tycoon/progress";
import { clean, hasScuffle, hireStaff, lobbyDogs, roomAtRisk, roomDogs, separate } from "@/tycoon/run";
import { roomName } from "@/tycoon/rooms";
import { fac } from "@/tycoon/state";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { Facility, Placed, Room, RoomType, TResult, TycoonState } from "@/tycoon/types";
import { DogPanel } from "./DogPanel";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;

const roomTitle = (r: Room) => (r.type === "playroom" && r.group ? `Playroom · ${groupName(r.group)}` : r.type ? ROOM_TYPE_NAMES[r.type] : "Room (pick a type)");

type BuildEntry = { key: string; name: string; what: FirstFree; price: string; note: string; unlock: number; kind: string };

function buildEntries(): BuildEntry[] {
  const rooms: BuildEntry[] = [];
  const roomEntry = (type: RoomType, group?: GroupId): BuildEntry => {
    const { w, d } = DEFAULT_ROOM_SIZE[type];
    return {
      key: `room-${type}-${group ?? ""}`,
      name: group ? `Playroom — ${groupName(group)}` : ROOM_TYPE_NAMES[type],
      what: group ? { room: type, group } : { room: type },
      price: `from ${roomPrice(w, d) + DOOR_PRICE}`,
      note: `${w} × ${d}, with a door and a path`,
      unlock: 1,
      kind: "room",
    };
  };
  rooms.push(roomEntry("lobby"));
  for (const g of GROUPS) rooms.push(roomEntry("playroom", g.id));
  rooms.push(roomEntry("calm"), roomEntry("bath"), roomEntry("boarding"), roomEntry("staff"));
  const furniture = FURNITURE.map<BuildEntry>((x) => ({
    key: x.id,
    name: x.name,
    what: x.id,
    price: String(x.price),
    note: x.allowed === "any" ? "any room" : x.allowed.map((t) => ROOM_TYPE_NAMES[t]).join(", "),
    unlock: x.unlock,
    kind: x.id,
  }));
  const outdoor = OUTDOOR.filter((o) => o.id !== "path").map<BuildEntry>((x) => ({
    key: x.id,
    name: x.name,
    what: x.id,
    price: x.price ? String(x.price) : "free",
    note: [x.fun ? `Fun ${x.fun[0]}` : "", x.appeal ? `Appeal ${x.appeal[0]}` : ""].filter(Boolean).join(" · ") || "scenery",
    unlock: x.unlock,
    kind: x.id,
  }));
  return [...rooms, ...furniture, ...outdoor];
}
const ENTRIES = buildEntries();

/** One built thing: its level and effect, with Upgrade (play/comfort items), Close/Open and Sell. */
function ItemRow({ f, item, act }: { f: Facility; item: Placed; act: Act }) {
  const [selling, setSelling] = useState(false);
  const od = outdoorDef(item.kind);
  const name = thingName(item.kind);
  const next = od && od.levels === 3 && item.level < 3 ? upgradePrice(od.price, (item.level + 1) as 2 | 3) : null;
  const refund = saleValue(f, item.spent);
  const ev = (action: string) => ({ event: { name: "tycoon_build" as const, props: { kind: item.kind, action } } });
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1 text-sm text-secondary">
        {name}
        {od && od.levels === 3 ? <span className="text-xs text-muted-foreground"> · level {item.level}</span> : null}
        {item.closed ? <span className="text-xs text-muted-foreground"> · closed</span> : null}
        {!isActive(item.kind) ? <span className="text-xs text-destructive"> · pack no longer active</span> : null}
      </span>
      {next !== null && (
        <Button size="sm" className="h-11" aria-label={`Upgrade ${name} · ${next}`} onClick={() => act((s) => upgradeThing(s, item.uid), ev("upgrade"))}>
          Upgrade · {next}
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-11" aria-label={`${item.closed ? "Open" : "Close"} ${name}`} onClick={() => act((s) => setClosed(s, item.uid, !item.closed))}>
        {item.closed ? "Open" : "Close"}
      </Button>
      <Button
        size="sm"
        variant={selling ? "destructive" : "ghost"}
        className="h-11"
        aria-label={selling ? `Tap again to sell ${name} (+${refund})` : `Sell ${name}`}
        onClick={() => {
          if (!selling) return setSelling(true);
          setSelling(false);
          act((s) => sellThing(s, item.uid), ev("sell"));
        }}
      >
        {selling ? `Tap again (+${refund})` : "Sell"}
      </Button>
    </li>
  );
}

function RoomCard({ f, room, act }: { f: Facility; room: Room; act: Act }) {
  const [selling, setSelling] = useState(false);
  const st = roomStatus(f, room);
  const dogs = room.type === "playroom" ? roomDogs(f, room.uid) : f.dogs.filter((d) => d.place.kind !== "lobby" && (d.place as { room: string }).room === room.uid);
  const risky = room.type === "playroom" && (hasScuffle(f, room.uid) || roomAtRisk(f, room));
  return (
    <section aria-label={roomTitle(room)} className={`rounded-2xl border border-border bg-card p-3 shadow-soft ${st.working ? "" : "opacity-90"}`}>
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold text-secondary">{roomTitle(room)}</h3>
        <span className="text-xs text-muted-foreground">
          {room.w} × {room.d}
        </span>
        {st.reason && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{st.reason}</span>}
      </div>
      {!room.type && (
        <div className="mt-2 flex flex-wrap gap-2">
          {(["lobby", "calm", "bath", "boarding", "staff"] as RoomType[]).map((t) => (
            <Button key={t} size="sm" variant="outline" className="h-11" onClick={() => act((s) => setRoomType(s, room.uid, t))}>
              {ROOM_TYPE_NAMES[t]}
            </Button>
          ))}
          {GROUPS.map((g) => (
            <Button key={g.id} size="sm" variant="outline" className="h-11" onClick={() => act((s) => setRoomType(s, room.uid, "playroom", g.id))}>
              Playroom · {g.name}
            </Button>
          ))}
        </div>
      )}
      {risky && (
        <Button variant="destructive" className="mt-2 h-11" onClick={() => act((s) => separate(s, room.uid))}>
          Separate the pups
        </Button>
      )}
      {dogs.length > 0 && (
        <div className="mt-2 space-y-2">
          {dogs.map((d) => (
            <DogPanel key={d.id} f={f} dog={d} act={act} />
          ))}
        </div>
      )}
      {f.items.some((i) => i.room === room.uid) && (
        <ul aria-label={`Furniture in ${roomTitle(room)}`} className="mt-2 divide-y divide-border">
          {f.items
            .filter((i) => i.room === room.uid)
            .map((i) => (
              <ItemRow key={i.uid} f={f} item={i} act={act} />
            ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="ghost" className="h-11" onClick={() => act((s) => setClosed(s, room.uid, !room.closed))}>
          {room.closed ? "Open room" : "Close room"}
        </Button>
        <Button
          size="sm"
          variant={selling ? "destructive" : "ghost"}
          className="h-11"
          onClick={() => {
            if (!selling) return setSelling(true);
            setSelling(false);
            act((s) => sellRoom(s, room.uid), { event: { name: "tycoon_build", props: { kind: "room", action: "sell" } } });
          }}
        >
          {selling ? "Tap again to sell (75% back)" : "Sell"}
        </Button>
      </div>
    </section>
  );
}

/**
 * One thing to build. Rooms show their exact price (room + door + every path square) and where they'd go, and ask
 * before charging; furniture asks which room it goes in, best room first (empire milestone §2 — the hub build listed
 * "from 430", charged 570 at once, and put a water bowl in the lobby).
 */
function BuildRow({ e, f, coins, locked, act }: { e: BuildEntry; f: Facility; coins: number; locked: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  const used = useRef<unknown>(null); // the quote already confirmed (a second tap on it does nothing)
  const room = typeof e.what === "string" ? null : e.what;
  const fd = typeof e.what === "string" ? furnitureDef(e.what) : null;
  const quote = useMemo(() => (room ? firstFreeRoomPlan(f, room.room, room.group) : null), [room?.room, room?.group, f.rooms, f.items, f.land]);
  const ev = { event: { name: "tycoon_build" as const, props: { kind: e.kind, action: "place" } } };
  const where = quote?.ok ? (quote.via ? `door into the ${roomName(f, quote.via)}` : quote.paths.length ? `door + ${quote.paths.length} path square${quote.paths.length === 1 ? "" : "s"} to the entrance` : "door onto the path") : null;
  const targets = open && fd ? rankedRoomsFor(f, fd.id) : [];
  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-secondary">{e.name}</p>
          <p className="text-xs text-muted-foreground">{quote ? (quote.ok ? `${costLine(quote.cost)} · ${quote.rect.w} × ${quote.rect.d}, ${where}` : quote.reason) : `${e.price} coins · ${e.note}`}</p>
        </div>
        {locked ? (
          <span className="text-xs font-semibold text-muted-foreground">Unlocks at level {e.unlock}</span>
        ) : open ? null : (
          <Button
            size="sm"
            className="h-11"
            aria-label={`Place ${e.name} in first free spot`}
            disabled={!!quote && !quote.ok}
            onClick={() => (room || fd ? setOpen(true) : act((s) => placeFirstFree(s, e.what), ev))}
          >
            Place
          </Button>
        )}
      </div>
      {open && quote?.ok && (
        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl bg-muted p-2">
          <p className="min-w-0 flex-1 text-sm text-secondary">{coins >= quote.cost.total ? `Build it for ${quote.cost.total.toLocaleString("en-US")}?` : `Need ${(quote.cost.total - coins).toLocaleString("en-US")} more coins.`}</p>
          <Button
            size="sm"
            className="h-11"
            aria-label={`Build ${e.name} for ${quote.cost.total}`}
            disabled={coins < quote.cost.total}
            onClick={() => {
              // the quote on screen, bound: same spot, doorway, route and price, or nothing (audit finding 3); once
              if (used.current === quote || !room) return;
              used.current = quote;
              const r = act((s) => buildConnectedRoom(s, quote.rect, room.room, room.group, quote), ev);
              if (r.ok) setOpen(false);
              else used.current = null;
            }}
          >
            Build · {quote.cost.total.toLocaleString("en-US")}
          </Button>
          <Button size="sm" variant="outline" className="h-11" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
      {open && fd && (
        <div className="mt-1 space-y-1 rounded-xl bg-muted p-2">
          <p className="text-sm text-secondary">{targets.length ? "Which room?" : fd.allowed === "any" ? "Build a room first." : `Build a ${fd.allowed.map((t) => ROOM_TYPE_NAMES[t]).join(" or ")} first.`}</p>
          <div className="flex flex-wrap gap-2">
            {targets.map((r, i) => (
              <Button
                key={r.uid}
                size="sm"
                variant={i === 0 ? "default" : "outline"}
                className="h-11"
                aria-label={`Put ${e.name} in ${roomName(f, r.uid)}`}
                onClick={() => {
                  // the spot that's free right now in that room, bound (a replay can't put a second one in)
                  const spot = spotInRoom(f, r.uid, fd.id);
                  if ("error" in spot) {
                    act(() => ({ ok: false, error: spot.error }), ev);
                    return;
                  }
                  if (act((s) => placeThing(s, fd.id, spot.c, spot.r, spot.rot), ev).ok) setOpen(false);
                }}
              >
                {roomName(f, r.uid)}
                {i === 0 && targets.length > 1 ? " (suggested)" : ""}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** The full list view, or (compact, beside the 3D view) just the front desk and the pups in each room. */
export function ListView({ state, act, compact = false }: { state: TycoonState; act: Act; compact?: boolean }) {
  const f = fac(state);
  const lv = level(state);
  const connected = connectedRooms(f);
  const lobby = lobbyDogs(f);
  const calmAtDesk = f.dogs.filter((d) => d.place.kind === "calm" && !f.rooms.some((r) => r.uid === (d.place as { room: string }).room));
  const [tab, setTab] = useState<"rooms" | "furniture" | "outdoor" | "land">("rooms");
  const owned = ownedPaid();
  const shown = ENTRIES.filter((e) => {
    const paid = furnitureDef(e.kind)?.paid;
    if (paid && !owned.has(paid)) return false; // pack items only for owners (fresh server entitlements)
    return tab === "rooms" ? e.kind === "room" : tab === "furniture" ? FURNITURE.some((x) => x.id === e.kind) : tab === "outdoor" ? OUTDOOR.some((x) => x.id === e.kind) : false;
  });

  return (
    <div className="space-y-3">
      <section aria-label="Front desk" className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <h2 className="text-lg font-bold text-secondary">Front desk</h2>
        {lobby.length === 0 && calmAtDesk.length === 0 && <p className="text-sm text-muted-foreground">{f.open ? "No pups waiting." : "Open for business to welcome pups."}</p>}
        <div className="mt-2 space-y-2">
          {[...lobby, ...calmAtDesk].map((d) => (
            <DogPanel key={d.id} f={f} dog={d} act={act} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="self-center text-muted-foreground">
            Staff {f.staff.length}/{MAX_STAFF} · energy {f.staff.map((x) => Math.round(x.energy)).join(" / ")} · floors {Math.round(f.cleanliness)}%
          </span>
          <Button size="sm" variant="outline" className="h-11" onClick={() => act(clean)}>
            Mop floors
          </Button>
          {f.staff.length < MAX_STAFF && (
            <Button size="sm" variant="outline" className="h-11" onClick={() => act(hireStaff)}>
              Hire ({hireCost(f.staff.length)})
            </Button>
          )}
        </div>
      </section>

      {compact
        ? f.rooms
            .filter((room) => f.dogs.some((d) => d.place.kind !== "lobby" && (d.place as { room: string }).room === room.uid))
            .map((room) => (
              <section key={room.uid} aria-label={roomTitle(room)} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                <h3 className="font-semibold text-secondary">{roomTitle(room)}</h3>
                <div className="mt-2 space-y-2">
                  {f.dogs
                    .filter((d) => d.place.kind !== "lobby" && (d.place as { room: string }).room === room.uid)
                    .map((d) => (
                      <DogPanel key={d.id} f={f} dog={d} act={act} />
                    ))}
                </div>
              </section>
            ))
        : f.rooms.map((room) => <RoomCard key={room.uid} f={f} room={room} act={act} />)}
      {compact ? null : (
      <>
      {f.rooms.length > 0 && connected.size < f.rooms.length && (
        <p className="px-1 text-xs text-muted-foreground">Rooms marked "Not connected" need a door and a path back to the entrance.</p>
      )}

      {f.items.some((i) => i.room === null && i.kind !== "path" && i.uid !== "entrance") && (
        <section aria-label="Outdoor items" className="rounded-2xl border border-border bg-card p-3 shadow-soft">
          <h2 className="text-lg font-bold text-secondary">Outdoor items</h2>
          <ul className="mt-1 divide-y divide-border">
            {f.items
              .filter((i) => i.room === null && i.kind !== "path" && i.uid !== "entrance")
              .map((i) => (
                <ItemRow key={i.uid} f={f} item={i} act={act} />
              ))}
          </ul>
        </section>
      )}

      <section aria-label="Build" className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <h2 className="text-lg font-bold text-secondary">Build</h2>
        <div className="mt-2 flex gap-1" role="tablist">
          {(["rooms", "furniture", "outdoor", "land"] as const).map((t) => (
            <Button key={t} role="tab" aria-selected={tab === t} size="sm" variant={tab === t ? "default" : "outline"} className="h-11 capitalize" onClick={() => setTab(t)}>
              {t}
            </Button>
          ))}
        </div>
        <ul className="mt-2 divide-y divide-border">
          {shown.map((e) => (
            <BuildRow key={e.key} e={e} f={f} coins={state.coins} locked={e.unlock > lv} act={act} />
          ))}
          {tab === "land" &&
            PARCELS.filter((p) => p.price > 0).map((p) => {
              const owned = f.land.includes(p.id);
              return (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-secondary">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{owned ? "Yours" : `${p.price.toLocaleString()} coins`}</p>
                  </div>
                  {owned ? null : p.level > lv ? (
                    <span className="text-xs font-semibold text-muted-foreground">Unlocks at level {p.level}</span>
                  ) : (
                    <Button size="sm" className="h-11" onClick={() => act((s) => buyLand(s, p.id), { event: { name: "tycoon_land", props: { parcel: p.id } } })}>
                      Buy
                    </Button>
                  )}
                </li>
              );
            })}
        </ul>
      </section>
      </>
      )}
    </div>
  );
}
