// PAWtastic Daycare Tycoon — the one obvious next thing to do for a pup (empire milestone §1: the old game's big
// button). Pure: the pup's panel and the front desk show it; the actions themselves are the ordinary rules (checkIn,
// assignRoom, assignBed, bath, playtime, checkout), so staff and player share every rule.
import { groupName, groupOf } from "@/game/engine";
import { caps } from "./connect";
import { roomName } from "./rooms";
import type { Facility, Room, TDog } from "./types";
import { fmtTime, visitOf } from "./visit";

export type NextActionId = "checkout" | "checkin" | "room" | "bed" | "bath" | "play" | "none";
export type NextAction = { id: NextActionId; label: string; room?: string; bed?: string; reason?: string };

const inRoom = (f: Facility, uid: string) => f.dogs.filter((d) => d.place.kind === "room" && d.place.room === uid).length;

/** Working playrooms of the pup's own size-and-temperament group with a free spot (where it can safely go). */
export function safeRooms(f: Facility, d: TDog): Room[] {
  const g = groupOf(d);
  return caps(f)
    .playrooms.filter((p) => p.group === g && inRoom(f, p.room.uid) < p.spots)
    .map((p) => p.room);
}

export function nextAction(f: Facility, d: TDog): NextAction {
  const v = visitOf(f, d);
  const settled = d.place.kind === "room" || d.place.kind === "bed";
  if (d.checkedIn && v.ownerHere !== null && v.ownerHere !== undefined && !v.finishing) return { id: "checkout", label: `Check out ${d.name}` };
  if (!d.checkedIn && d.place.kind === "lobby") return { id: "checkin", label: `Check in ${d.name}` };
  if (d.checkedIn && (d.place.kind === "lobby" || d.place.kind === "calm")) {
    if (d.boarding) {
      const c = caps(f);
      const free = c.beds.find((b) => !f.dogs.some((x) => x.place.kind === "bed" && x.place.bed === b.bed));
      return free ? { id: "bed", label: "To a boarding bed", bed: free.bed } : { id: "none", label: "", reason: "No free boarding bed — a boarding wing adds beds." };
    }
    const room = safeRooms(f, d)[0];
    const g = groupName(groupOf(d));
    return room ? { id: "room", label: `Move to ${roomName(f, room.uid)} (${g})`, room: room.uid } : { id: "none", label: "", reason: `No free ${g} spot — a ${g} playroom (or one more bed) would take ${d.name}.` };
  }
  if (settled && !d.bathing && v.requests.includes("bath") && !d.bathed && caps(f).bath) return { id: "bath", label: `Bath ${d.name}` };
  if (settled && !d.bathing && (d.played === 0 || d.happiness < 70)) return { id: "play", label: `Play with ${d.name}` };
  return { id: "none", label: "", reason: d.bathing ? `In the bath — ${Math.ceil(d.bathing)} min left.` : `All set — ${v.owner} picks up ${v.pickupDay > f.day ? "tomorrow " : ""}at ${fmtTime(v.pickup)}.` };
}
