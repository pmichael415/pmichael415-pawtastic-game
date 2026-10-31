// "What should I do with this pup next?" — one pure helper shared by the care panel, the front desk
// queue and the first-person Interact button, so every view offers the same next step.
import {
  GROUPS, assignRoom, assignSuite, bath, checkIn, checkout, groupName, groupOf, hasScuffle, inActiveScuffle, mismatchWarning, playtime,
  roomHardBlock, separateDogs, suiteBlockReason, suiteCount, suiteDog, traitLabel, type Dog, type GameState, type GroupId, type Result,
} from "./engine";

export type ActionId = "checkin" | "assign" | "suite" | "separate" | "play" | "bath" | "checkout" | "none";
export type EffectKind = "checkin" | "assign" | "play" | "bath" | "checkout" | "separate";
export type PrimaryAction = { id: ActionId; label: string; apply?: (s: GameState) => Result; effect?: EffectKind; reason?: string };

const feeFor = (s: GameState, d: Dog) => Math.round((d.boarding ? 40 : 20) * (s.upgrades.includes("hillsdale") ? 1.25 : 1));

/** Matching playroom for this pup if it has space (null when full or the pup can't use playrooms). */
export function bestRoom(s: GameState, d: Dog): GroupId | null {
  const g = groupOf(d);
  return roomHardBlock(s, d, g) ? null : g;
}

export function freeSuite(s: GameState, d: Dog): number | null {
  for (let i = 0; i < suiteCount(s); i++) if (!suiteDog(s, d.site, i)) return i;
  return null;
}

export type RoomOption = { group: GroupId; name: string; status: "fit" | "warn" | "block"; reason: string | null };
export function roomOptions(s: GameState, d: Dog): RoomOption[] {
  return GROUPS.map((g) => {
    const hard = roomHardBlock(s, d, g.id);
    const warn = hard ? null : mismatchWarning(d, g.id);
    return { group: g.id, name: g.name, status: hard ? "block" : warn ? "warn" : "fit", reason: hard ?? warn };
  });
}

export function describePlace(s: GameState, d: Dog): string {
  const where =
    d.place.kind === "lobby" ? "Lobby"
    : d.place.kind === "recovery" ? "Staff recovery room"
    : d.place.kind === "room" ? `${groupName(d.place.group)} playroom`
    : `Boarding Suite ${d.place.index + 1}`;
  const status = !d.checkedIn ? "waiting for check-in" : "checked in";
  const fight = inActiveScuffle(s, d) ? " · scuffle — separate now" : "";
  return `${where} · ${status}${fight}`;
}

export function primaryAction(s: GameState, d: Dog): PrimaryAction {
  if (!d.checkedIn) return { id: "checkin", label: `🛎️ Check in ${d.name} (+${feeFor(s, d)})`, apply: (x) => checkIn(x, d.id), effect: "checkin" };
  if (d.place.kind === "room" && hasScuffle(s, d.site, d.place.group)) {
    const g = d.place.group;
    return { id: "separate", label: "🫶 Separate dogs now", apply: (x) => separateDogs(x, d.site, g), effect: "separate" };
  }
  if (d.place.kind === "lobby" || d.place.kind === "recovery") {
    if (d.boarding) {
      const i = freeSuite(s, d);
      if (i === null) return { id: "none", label: "All suites are occupied", reason: suiteCount(s) ? "Every boarding suite is occupied — check a boarder out first." : "Build Boarding Suites in Upgrades to host overnight guests." };
      const why = suiteBlockReason(s, d, i);
      if (why) return { id: "none", label: "Can't settle yet", reason: why };
      return { id: "suite", label: `🌙 Settle ${d.name} into Suite ${i + 1}`, apply: (x) => assignSuite(x, d.id, i), effect: "assign" };
    }
    const g = bestRoom(s, d);
    if (!g) return { id: "none", label: `${groupName(groupOf(d))} room is full`, reason: roomHardBlock(s, d, groupOf(d)) ?? "That room is full." };
    return { id: "assign", label: `🐾 Move to ${groupName(g)}`, apply: (x) => assignRoom(x, d.id, g), effect: "assign" };
  }
  if (d.place.kind === "room" && d.happiness < 85) {
    if (playtime(s, d.id).ok) return { id: "play", label: `🎾 Play with ${d.name} (+15)`, apply: (x) => playtime(x, d.id), effect: "play" };
  }
  if (d.clean < 55 && bath(s, d.id).ok) return { id: "bath", label: `🛁 Bath for ${d.name}`, apply: (x) => bath(x, d.id), effect: "bath" };
  const out = checkout(s, d.id, false);
  if (out.ok) return { id: "checkout", label: `🏠 Send ${d.name} home happy`, apply: (x) => checkout(x, d.id, false), effect: "checkout" };
  return { id: "none", label: "Nothing needed right now", reason: out.error };
}

export const dogSummary = (d: Dog) => `${d.name} · ${traitLabel(d)}${d.boarding ? " · boarder" : ""}`;
