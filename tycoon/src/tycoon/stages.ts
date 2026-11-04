// PAWtastic Daycare Tycoon — facility stages (combined-loop plan, task 5): Starter → Growing → Full-service → Campus.
// Worked out from the layout every time (never stored, so they can't drift): what's built, open and working. Any order
// of growing counts — a play yard first is as good a start as a playroom wing. Pure.
import { caps } from "./connect";
import type { Facility } from "./types";

export type GrowthWay = "playrooms" | "bath" | "boarding" | "yard" | "staff";
export type StageId = "starter" | "growing" | "full" | "campus";
export const WAY_LABEL: Record<GrowthWay, string> = { playrooms: "a second playroom", bath: "a bath station", boarding: "a boarding wing", yard: "a play yard", staff: "a staff room" };
export const STAGES: { id: StageId; name: string; means: string; needs: GrowthWay[]; anyOf: boolean }[] = [
  { id: "starter", name: "Starter daycare", means: "A lobby, a playroom and a calm-down room — where every PAWtastic daycare begins.", needs: [], anyOf: false },
  { id: "growing", name: "Growing daycare", means: "You've grown past the starter layout — more room, a new service, comfort or a team that keeps going.", needs: ["playrooms", "bath", "boarding", "yard", "staff"], anyOf: true },
  { id: "full", name: "Full-service daycare", means: "Daycare, baths and overnight boarding — every PAWtastic service under one roof.", needs: ["bath", "boarding"], anyOf: false },
  { id: "campus", name: "PAWtastic campus", means: "Playrooms, baths, boarding, a play yard and a staff room — a whole campus.", needs: ["playrooms", "bath", "boarding", "yard", "staff"], anyOf: false },
];

/** Which ways the daycare has grown (working and open only — a closed room counts for nothing). */
export function grownWays(f: Facility): Record<GrowthWay, boolean> {
  const c = caps(f);
  return {
    playrooms: c.playrooms.length >= 2,
    bath: c.tubs.length > 0,
    boarding: c.beds.length > 0,
    yard: f.items.some((i) => i.room === null && i.kind === "play_yard" && !i.closed),
    staff: c.staffBoost > 0,
  };
}

export type StageNeed = { way: GrowthWay; label: string; done: boolean };
export type FacilityStage = {
  index: number;
  id: StageId;
  name: string;
  means: string;
  /** The next stage and what it needs (with what's already done), or null at the top. */
  next: { id: StageId; name: string; means: string; anyOf: boolean; needs: StageNeed[]; progress: [number, number] } | null;
};

const met = (g: Record<GrowthWay, boolean>, st: (typeof STAGES)[number]) => (st.anyOf ? st.needs.some((w) => g[w]) : st.needs.every((w) => g[w]));

export function facilityStage(f: Facility): FacilityStage {
  const g = grownWays(f);
  let index = 0;
  while (index + 1 < STAGES.length && met(g, STAGES[index + 1]!)) index++;
  const here = STAGES[index]!;
  const nx = STAGES[index + 1];
  const next = nx
    ? (() => {
        const needs = nx.needs.map((way) => ({ way, label: WAY_LABEL[way], done: g[way] }));
        const done = needs.filter((n) => n.done).length;
        return { id: nx.id, name: nx.name, means: nx.means, anyOf: nx.anyOf, needs, progress: (nx.anyOf ? [Math.min(1, done), 1] : [done, needs.length]) as [number, number] };
      })()
    : null;
  return { index, id: here.id, name: here.name, means: here.means, next };
}
