// Rooms at a glance (empire milestone §1, §3; the old game's room cards, compact): each room and how full it is. With a
// checked-in pup selected, the rooms it can safely go to show ✓ and one tap moves it there (the ordinary assignRoom /
// assignBed rules — the same ones staff use).
import { groupName, groupOf } from "@/game/engine";
import { caps, connectedRooms, roomStatus } from "@/tycoon/connect";
import { nextAction, safeRooms } from "@/tycoon/nextAction";
import { roomName } from "@/tycoon/rooms";
import { assignBed, assignRoom } from "@/tycoon/run";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { Facility, TDog, TResult, TycoonState } from "@/tycoon/types";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
const ICON: Record<string, string> = { playroom: "🎾", bath: "🛁", boarding: "🌙", calm: "🫶", staff: "☕", lobby: "🛎️" };

/** A settled pup whose next step is play or its booked bath: the cue the strip shows (milestone §2). */
function careCue(f: Facility, d: TDog): string | null {
  if (!(d.place.kind === "room" || d.place.kind === "bed") || d.bathing) return null;
  const n = nextAction(f, d);
  return n.id === "play" ? `🎾 ${d.name} wants to play` : n.id === "bath" ? `🛁 ${d.name}'s bath is booked` : null;
}

export function RoomsStrip({ f, dog, act, onSelectRoom, onSelectDog }: { f: Facility; dog: TDog | null; act: Act; onSelectRoom: (uid: string) => void; onSelectDog?: (dogId: string) => void }) {
  const c = caps(f);
  const connected = connectedRooms(f); // one search for every chip
  const waiting = !!dog && dog.checkedIn && (dog.place.kind === "lobby" || dog.place.kind === "calm");
  const safe = waiting && dog && !dog.boarding ? new Set(safeRooms(f, dog).map((r) => r.uid)) : new Set<string>();
  const freeBed = waiting && dog?.boarding ? c.beds.find((b) => !f.dogs.some((x) => x.place.kind === "bed" && x.place.bed === b.bed)) : undefined;
  const rooms = f.rooms.filter((r) => r.type && r.type !== "lobby");
  if (!rooms.length) return null;
  return (
    <section aria-label="Rooms" className="flex gap-1.5 overflow-x-auto pb-0.5">
      {rooms.map((r) => {
        const status = roomStatus(f, r, connected);
        const inside = f.dogs.filter((d) => (d.place.kind === "room" || d.place.kind === "calm" || d.place.kind === "bed") && "room" in d.place && d.place.room === r.uid).length;
        const spots = r.type === "playroom" ? (c.playrooms.find((p) => p.room.uid === r.uid)?.spots ?? 0) : r.type === "boarding" ? c.beds.filter((b) => b.room === r.uid).length : r.type === "bath" ? c.tubs.filter((t) => t.room === r.uid).length : 0;
        const bathing = r.type === "bath" ? f.dogs.filter((d) => d.bathing && c.tubs.some((t) => t.uid === d.bathTub && t.room === r.uid)).length : 0;
        const label = `${roomName(f, r.uid)}${r.type === "playroom" && r.group ? ` · ${groupName(r.group)}` : ""} · ${r.type === "bath" ? `${bathing}/${spots} tubs busy` : r.type === "calm" || r.type === "staff" ? `${inside} inside` : `${inside}/${spots}`}${status.working ? "" : ` · ${status.reason ?? "not working"}`}`;
        const target = (r.type === "playroom" && safe.has(r.uid)) || (r.type === "boarding" && freeBed?.room === r.uid);
        if (target && dog) {
          return (
            <button
              key={r.uid}
              type="button"
              className="min-h-11 shrink-0 rounded-xl border-2 border-success bg-success/15 px-2 text-xs font-semibold text-secondary"
              onClick={() => (r.type === "boarding" && freeBed ? act((s) => assignBed(s, dog.id, freeBed.bed)) : act((s) => assignRoom(s, dog.id, r.uid)))}
            >
              ✓ Move {dog.name} to {roomName(f, r.uid)}
              {r.type === "playroom" && r.group ? ` (${groupName(groupOf(dog))})` : ""}
            </button>
          );
        }
        // pups here who'd like you now (play, or the bath they booked): one tap opens them with that step ready, so
        // nothing waits for a complaint at pickup — and nothing covers the daycare to say so
        const cues = onSelectDog && !dog ? f.dogs.filter((d) => "room" in d.place && d.place.room === r.uid).flatMap((d) => (careCue(f, d) ? [{ id: d.id, text: careCue(f, d)! }] : [])) : [];
        return (
          <span key={r.uid} className="contents">
          {cues.map((cue) => (
            <button key={cue.id} type="button" className="min-h-11 shrink-0 rounded-xl border-2 border-accent bg-accent/25 px-2 text-xs font-semibold text-secondary" onClick={() => onSelectDog!(cue.id)}>
              {cue.text}
            </button>
          ))}
          <button
            type="button"
            aria-label={label}
            className={`min-h-11 shrink-0 rounded-xl border bg-card px-2 text-left text-xs ${status.working ? "border-border text-secondary" : "border-dashed border-muted-foreground/50 text-muted-foreground"}`}
            onClick={() => onSelectRoom(r.uid)}
          >
            <span aria-hidden>{ICON[r.type ?? ""] ?? "▫️"} </span>
            {label}
          </button>
          </span>
        );
      })}
    </section>
  );
}
