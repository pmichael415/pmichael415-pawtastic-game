// PAWtastic Daycare Tycoon — the next goals strip (Stage A, spec §3.6): up to three clear goals worked out from the
// save, so there is always something to aim for. Stage C turns these into the owner's milestone path.
import { OUTDOOR, PARCELS } from "./catalog";
import { canOpen, caps } from "./connect";
import { level, unlocksAt, xpForLevel } from "./progress";
import { fac } from "./state";
import type { TycoonState } from "./types";

export type Goal = { id: string; title: string; detail: string; progress?: [number, number] };
const coins = (n: number) => n.toLocaleString("en-US");

export function nextGoals(s: TycoonState): Goal[] {
  const f = fac(s);
  const lvl = level(s);
  const out: Goal[] = [];
  if (!canOpen(f).ok) {
    out.push({ id: "open", title: "Open your daycare", detail: "A Lobby with a Front Desk Counter, a Playroom with a dog spot and a Calm-Down Room." });
  } else {
    const c = caps(f);
    const playArea = f.items.some((i) => i.room === null && OUTDOOR.find((o) => o.id === i.kind)?.tab === "play");
    if (!c.bath) out.push({ id: "build-bath", title: "Build a Bath Room", detail: `Baths and exit baths earn extra.${lvl < 2 ? " The Bath Tub unlocks at level 2." : ""}` });
    else if (c.beds.length === 0) out.push({ id: "build-boarding", title: "Build a Boarding Room", detail: `Overnight guests pay the boarding price.${lvl < 3 ? " Boarding Beds unlock at level 3." : ""}` });
    else if (!playArea) out.push({ id: "build-play-area", title: "Add an outdoor play area", detail: "A Play Yard, Ball Pit or Splash Pool makes every playtime better." });
  }
  const parcel = PARCELS.filter((p) => !f.land.includes(p.id)).sort((a, b) => a.level - b.level || a.price - b.price)[0];
  if (parcel && parcel.level <= lvl + 2)
    out.push({
      id: `land-${parcel.id}`,
      title: `Buy the ${parcel.name}`,
      detail: `${coins(parcel.price)} coins${parcel.level > lvl ? `, from level ${parcel.level}` : ""} — room to grow.`,
      progress: [Math.max(0, Math.min(s.coins, parcel.price)), parcel.price],
    });
  if (s.bestProfit <= 0) out.push({ id: "profit", title: "Have a profitable day", detail: "Earn more than the day's wages, upkeep and supplies by closing time (18:00)." });
  const next = unlocksAt(lvl + 1);
  if (next.length)
    out.push({
      id: `level-${lvl + 1}`,
      title: `Reach level ${lvl + 1}`,
      detail: `Unlocks ${next.slice(0, 3).join(", ")}${next.length > 3 ? " and more" : ""}.`,
      progress: [s.xp - xpForLevel(lvl), xpForLevel(lvl + 1) - xpForLevel(lvl)],
    });
  return out.slice(0, 3);
}
