// A lightweight 2D map of the daycare (Stage A, spec §3.4), shown when the 3D view can't load. Rooms show their name
// and how full they are; items are small icons; pups are markers with their status. Tapping picks exactly like the 3D
// view does, so every panel and action works the same. Positions glide with a CSS transition.
import type { KeyboardEvent } from "react";
import { groupName } from "@/game/engine";
import { COLS, ROOM_TYPE_NAMES, ROWS, PARCELS, thingName } from "@/tycoon/catalog";
import { caps } from "@/tycoon/connect";
import { thingTiles } from "@/tycoon/grid";
import { inActiveScuffle } from "@/tycoon/run";
import { fac } from "@/tycoon/state";
import type { TPick } from "@/tycoon/render/world";
import type { Facility, Room, TDog, TycoonState } from "@/tycoon/types";

const ICON: Record<string, string> = {
  front_counter: "🛎️", bench: "🪑", dog_bed: "🛏️", play_mat: "🟩", water_bowl: "💧", rug: "🟫", plant: "🪴", toy_bin: "🧸",
  bath_tub: "🛁", boarding_bed: "🛌", couch: "🛋️", hurdles: "🚧", deluxe_bed: "🛏️", staff_couch: "🛋️", deluxe_tub: "🛁",
  cloud_bed: "☁️", lighthouse_fort: "🗼", play_yard: "🎾", ball_pit: "🔴", splash_pool: "🏊", agility: "🏁", water: "🚰",
  shade_tree: "🌳", nap_cabana: "⛺", park_bench: "🪑", flowers: "🌷", lights: "✨", fountain: "⛲", fence: "▫️", sign: "🪧",
};
const FILL: Record<string, string> = { lobby: "#E2ECF8", playroom: "#FFF6E3", calm: "#E7F3EA", bath: "#DCEFFB", boarding: "#F1E8FA", staff: "#F2EFEA" };

function roomName(r: Room): string {
  return r.type === "playroom" && r.group ? `Playroom · ${groupName(r.group)}` : r.type ? ROOM_TYPE_NAMES[r.type] : "Room";
}
function roomLabel(f: Facility, r: Room): string {
  const c = caps(f);
  if (r.type === "playroom") {
    const spots = c.playrooms.find((p) => p.room.uid === r.uid)?.spots ?? 0;
    const n = f.dogs.filter((d) => d.place.kind === "room" && d.place.room === r.uid).length;
    return `${roomName(r)}, ${n} of ${spots}`;
  }
  if (r.type === "lobby") return `${roomName(r)}, ${f.dogs.filter((d) => d.place.kind === "lobby").length} of ${c.waiting} waiting`;
  if (r.type === "boarding") {
    const beds = f.items.filter((i) => i.room === r.uid && i.kind === "boarding_bed").length;
    const used = f.dogs.filter((d) => d.place.kind === "bed" && d.place.room === r.uid).length;
    return `${roomName(r)}, ${used} of ${beds} beds`;
  }
  return roomName(r);
}
function dogStatus(f: Facility, d: TDog): string {
  if (!d.checkedIn) return "waiting to check in";
  if (inActiveScuffle(f, d)) return "needs help";
  if (d.place.kind === "calm") return "calming down";
  return `${Math.round(d.happiness)}% happy`;
}
const dogColor = (f: Facility, d: TDog) => (!d.checkedIn ? "#F6A823" : inActiveScuffle(f, d) ? "#DF3A3A" : d.place.kind === "calm" ? "#45A167" : "#0068D6");

/** Where each pup stands: spread over its room's squares, on its bed, or in the lobby. */
function positions(f: Facility): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const lobby = f.rooms.find((r) => r.type === "lobby") ?? null;
  const byRoom = new Map<string, TDog[]>();
  for (const d of f.dogs) {
    if (d.place.kind === "bed") {
      const bed = f.items.find((i) => i.uid === (d.place as { bed: string }).bed);
      if (bed) out.set(d.id, { x: bed.c + 0.5, y: bed.r + 0.5 });
      continue;
    }
    const key = d.place.kind === "lobby" ? lobby?.uid ?? "" : d.place.room;
    byRoom.set(key, [...(byRoom.get(key) ?? []), d]);
  }
  for (const [uid, dogs] of byRoom) {
    const room = f.rooms.find((r) => r.uid === uid);
    dogs.forEach((d, i) => {
      out.set(d.id, room ? { x: room.c + 0.5 + (i % room.w), y: room.r + 0.5 + (Math.floor(i / room.w) % room.d) } : { x: 18.5, y: 26.5 });
    });
  }
  return out;
}

export function TycoonMap({ state, selected, onPick }: { state: TycoonState; selected: string | null; onPick: (p: TPick | null) => void }) {
  const f = fac(state);
  const pos = positions(f);
  const keyPick = (p: TPick) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(p);
    }
  };
  const owned = PARCELS.filter((p) => f.land.includes(p.id));
  return (
    <section aria-label="Daycare map" className="relative overflow-hidden rounded-2xl border border-border bg-sky shadow-soft">
      <svg viewBox={`0 0 ${COLS} ${ROWS}`} className="block h-auto w-full touch-manipulation select-none" role="group" aria-label="Your daycare from above" onClick={() => onPick(null)}>
        <rect x={0} y={0} width={COLS} height={ROWS} fill="#E7E2D8" />
        {owned.map((p) => (
          <rect key={p.id} x={p.c0} y={p.r0} width={p.c1 - p.c0} height={p.r1 - p.r0} fill="#CFE6C4" />
        ))}
        {f.items
          .filter((i) => i.kind === "path")
          .map((p) => (
            <rect key={p.uid} x={p.c} y={p.r} width={1} height={1} fill="#D9CBB2" />
          ))}
        {f.rooms.map((r) => {
          const pick: TPick = { kind: "room", uid: r.uid };
          return (
            <g
              key={r.uid}
              role="button"
              tabIndex={0}
              aria-label={roomLabel(f, r)}
              aria-pressed={selected === r.uid}
              onClick={(e) => {
                e.stopPropagation();
                onPick(pick);
              }}
              onKeyDown={keyPick(pick)}
              className="cursor-pointer"
            >
              <rect x={r.c + 0.05} y={r.r + 0.05} width={r.w - 0.1} height={r.d - 0.1} rx={0.25} fill={r.type ? FILL[r.type] : "#FFFFFF"} stroke={selected === r.uid ? "#0068D6" : "#312721"} strokeWidth={selected === r.uid ? 0.18 : 0.08} opacity={r.closed ? 0.6 : 1} />
              <text x={r.c + 0.2} y={r.r + 0.55} fontSize={0.42} fontWeight={700} fill="#312721" fontFamily="DM Sans, system-ui, sans-serif">
                {roomLabel(f, r).replace(/^Playroom · /, "")}
              </text>
            </g>
          );
        })}
        {f.items
          .filter((i) => i.kind !== "path")
          .map((it) => {
            const tiles = thingTiles(it);
            const xs = tiles.map((t) => t.c);
            const ys = tiles.map((t) => t.r);
            const x = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
            const y = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
            const pick: TPick = { kind: "thing", uid: it.uid };
            return (
              <text
                key={it.uid}
                x={x}
                y={y + 0.3}
                fontSize={0.8}
                textAnchor="middle"
                role="button"
                tabIndex={0}
                aria-label={thingName(it.kind)}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(pick);
                }}
                onKeyDown={keyPick(pick)}
                opacity={it.closed ? 0.4 : 1}
                className="cursor-pointer"
              >
                {ICON[it.kind] ?? "▪️"}
              </text>
            );
          })}
        {f.dogs.map((d) => {
          const at = pos.get(d.id) ?? { x: 18.5, y: 26.5 };
          const pick: TPick = { kind: "dog", id: d.id };
          const on = selected === d.id;
          return (
            <g
              key={d.id}
              role="button"
              tabIndex={0}
              aria-label={`${d.name}, ${dogStatus(f, d)}`}
              aria-pressed={on}
              style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: "transform 600ms ease" }}
              onClick={(e) => {
                e.stopPropagation();
                onPick(pick);
              }}
              onKeyDown={keyPick(pick)}
              className="cursor-pointer"
            >
              <circle r={on ? 0.48 : 0.4} fill={dogColor(f, d)} stroke="#FFFFFF" strokeWidth={0.1} />
              <text y={-0.55} fontSize={0.45} fontWeight={700} textAnchor="middle" fill="#312721" fontFamily="DM Sans, system-ui, sans-serif">
                {d.name}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
