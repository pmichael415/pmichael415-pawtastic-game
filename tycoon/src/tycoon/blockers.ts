// PAWtastic Daycare Tycoon — what's blocking income right now, and the fix (service design, "Stalls"). Pure.
// Every fix is something the player can do by playing: no purchase, nothing deleted.
import { groupName, groupOf, type GroupId } from "@/game/engine";
import { DEFAULT_ROOM_SIZE } from "./build";
import { DOOR_PRICE } from "./catalog";
import { canOpen, caps } from "./connect";
import { roomPrice } from "./grid";
import { fac } from "./state";
import type { TycoonState } from "./types";

export type Blocker = { id: string; title: string; fix: string };

const roomsWithDogs = (dogs: { place: { kind: string; room?: string } }[]) => new Set(dogs.filter((d) => d.place.kind === "room").map((d) => d.place.room));

export function incomeBlockers(s: TycoonState): Blocker[] {
  const f = fac(s);
  const out: Blocker[] = [];
  const open = canOpen(f);
  if (!open.ok) return [{ id: "cant-open", title: "Your daycare can't open yet", fix: `Still needed: ${open.missing.join(", ")}.` }];
  if (!f.open) out.push({ id: "closed", title: "Closed — no drop-offs", fix: "Switch Open on in the status bar. (While closed, the clock and daily costs pause.)" });
  if (s.coins < 0) out.push({ id: "below-zero", title: "Coins below zero — building, hiring and marketing are paused", fix: "Serving pups still works: every checkout pays. To cut daily costs, close unused items in Finances → Upkeep." });
  const c = caps(f);
  const lobby = f.dogs.filter((d) => d.place.kind === "lobby");
  if (c.waiting > 0 && lobby.length >= c.waiting) out.push({ id: "lobby-full", title: "The lobby is full — new families can't drop off", fix: "Check pups in and move them to playrooms, or turn away the ones you can't take today." });

  // waiting pups whose group has no working playroom, or whose playroom is full
  const occupied = roomsWithDogs(f.dogs);
  const byGroup = new Map<GroupId, number>();
  for (const d of lobby) if (!d.boarding) byGroup.set(groupOf(d), (byGroup.get(groupOf(d)) ?? 0) + 1);
  for (const [g, n] of byGroup) {
    const rooms = c.playrooms.filter((p) => p.group === g);
    if (!rooms.length) {
      const empty = c.playrooms.find((p) => !occupied.has(p.room.uid));
      const { w, d } = DEFAULT_ROOM_SIZE.playroom;
      const fix = empty
        ? `Tap the ${groupName(empty.group)} playroom, then Change type → ${groupName(g)} (free while it's empty). Or turn them away politely.`
        : `Build a ${groupName(g)} playroom (from about ${roomPrice(w, d) + DOOR_PRICE} coins), or turn them away politely — no charge, nothing held against you.`;
      out.push({ id: `group-${g}`, title: `No playroom for ${groupName(g)} pups (${n} waiting)`, fix });
    } else {
      const free = rooms.reduce((a, p) => a + Math.max(0, p.spots - f.dogs.filter((x) => x.place.kind === "room" && x.place.room === p.room.uid).length), 0);
      if (free === 0) out.push({ id: `full-${g}`, title: `The ${groupName(g)} playroom is full (${n} waiting)`, fix: "Add a Dog Bed (each gives a spot), or check pups out when their families arrive." });
    }
  }
  if (f.staff.length && Math.max(...f.staff.map((x) => x.energy)) < 10) out.push({ id: "tired", title: "Staff are worn out", fix: "They recover over time — faster with a Staff Room or better wages. Calm-down still works without them." });
  const sad = f.dogs.filter((d) => (d.place.kind === "room" || d.place.kind === "bed") && d.happiness < 45);
  if (sad.length) out.push({ id: "unhappy", title: `${sad.length} ${sad.length === 1 ? "pup is" : "pups are"} unhappy`, fix: "Give them playtime — unhappy pups pay less, and their families complain." });
  return out;
}
