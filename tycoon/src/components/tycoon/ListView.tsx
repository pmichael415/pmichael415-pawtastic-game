// The list view: the whole game without the 3D stage — lobby, rooms, pups, and a "first free spot" builder.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GROUPS, groupName, hireCost, MAX_STAFF } from "@/game/engine";
import type { GroupId } from "@/game/engine";
import { FURNITURE, OUTDOOR, PARCELS, ROOM_TYPE_NAMES, DOOR_PRICE } from "@/tycoon/catalog";
import { DEFAULT_ROOM_SIZE, buyLand, placeFirstFree, sellRoom, setClosed, setRoomType, type FirstFree } from "@/tycoon/build";
import { connectedRooms, roomStatus } from "@/tycoon/connect";
import { roomPrice } from "@/tycoon/grid";
import { level } from "@/tycoon/progress";
import { clean, hasScuffle, hireStaff, lobbyDogs, roomAtRisk, roomDogs, separate } from "@/tycoon/run";
import { fac } from "@/tycoon/state";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { Facility, Room, RoomType, TResult, TycoonState } from "@/tycoon/types";
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
            <Button key={t} size="sm" variant="outline" className="h-10" onClick={() => act((s) => setRoomType(s, room.uid, t))}>
              {ROOM_TYPE_NAMES[t]}
            </Button>
          ))}
          {GROUPS.map((g) => (
            <Button key={g.id} size="sm" variant="outline" className="h-10" onClick={() => act((s) => setRoomType(s, room.uid, "playroom", g.id))}>
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
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="ghost" className="h-10" onClick={() => act((s) => setClosed(s, room.uid, !room.closed))}>
          {room.closed ? "Open room" : "Close room"}
        </Button>
        <Button
          size="sm"
          variant={selling ? "destructive" : "ghost"}
          className="h-10"
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

/** The full list view, or (compact, beside the 3D view) just the front desk and the pups in each room. */
export function ListView({ state, act, compact = false }: { state: TycoonState; act: Act; compact?: boolean }) {
  const f = fac(state);
  const lv = level(state);
  const connected = connectedRooms(f);
  const lobby = lobbyDogs(f);
  const calmAtDesk = f.dogs.filter((d) => d.place.kind === "calm" && !f.rooms.some((r) => r.uid === (d.place as { room: string }).room));
  const [tab, setTab] = useState<"rooms" | "furniture" | "outdoor" | "land">("rooms");
  const shown = ENTRIES.filter((e) => (tab === "rooms" ? e.kind === "room" : tab === "furniture" ? FURNITURE.some((x) => x.id === e.kind) : tab === "outdoor" ? OUTDOOR.some((x) => x.id === e.kind) : false));

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
          <Button size="sm" variant="outline" className="h-10" onClick={() => act(clean)}>
            Mop floors
          </Button>
          {f.staff.length < MAX_STAFF && (
            <Button size="sm" variant="outline" className="h-10" onClick={() => act(hireStaff)}>
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

      <section aria-label="Build" className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <h2 className="text-lg font-bold text-secondary">Build</h2>
        <div className="mt-2 flex gap-1" role="tablist">
          {(["rooms", "furniture", "outdoor", "land"] as const).map((t) => (
            <Button key={t} role="tab" aria-selected={tab === t} size="sm" variant={tab === t ? "default" : "outline"} className="h-10 capitalize" onClick={() => setTab(t)}>
              {t}
            </Button>
          ))}
        </div>
        <ul className="mt-2 divide-y divide-border">
          {shown.map((e) => {
            const locked = e.unlock > lv;
            return (
              <li key={e.key} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-secondary">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.price} coins · {e.note}
                  </p>
                </div>
                {locked ? (
                  <span className="text-xs font-semibold text-muted-foreground">Unlocks at level {e.unlock}</span>
                ) : (
                  <Button
                    size="sm"
                    className="h-10"
                    aria-label={`Place ${e.name} in first free spot`}
                    onClick={() => act((s) => placeFirstFree(s, e.what), { event: { name: "tycoon_build", props: { kind: e.kind, action: "place" } } })}
                  >
                    Place
                  </Button>
                )}
              </li>
            );
          })}
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
                    <Button size="sm" className="h-10" onClick={() => act((s) => buyLand(s, p.id), { event: { name: "tycoon_land", props: { parcel: p.id } } })}>
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
