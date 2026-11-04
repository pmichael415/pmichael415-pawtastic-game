// PAWtastic Daycare Tycoon — the skippable guided start (spec §3). Each step completes when the daycare shows it.
import { GUIDE_REWARD } from "./catalog";
import { earn } from "./business";
import { caps, connectedRooms } from "./connect";
import { fac } from "./state";
import type { TResult, TycoonState } from "./types";

export const GUIDE_STEPS = [
  { title: "Build a Lobby", detail: "Rooms → Lobby by the entrance path (it comes with its door and path), then the Front Desk Counter and a Waiting Bench." },
  { title: "Build a Playroom", detail: "Rooms → Playroom beside the Lobby, pick its group, then 2 Dog Beds and a Water Bowl." },
  { title: "Build a Calm-Down Room", detail: "A small connected room where overwhelmed pups can settle." },
  { title: "Paint the Lobby", detail: "Pick a floor and a wall colour. This step is optional." },
  // Ticks on the first checkout, so it's named for that (the hub build called it "Open for business" and left it
  // unticked while the daycare was open).
  { title: "Serve your first family", detail: "Switch Open on, check the first pup in, put it in the playroom, give it playtime, then check it out." },
] as const;

/** Which steps the daycare already shows; `step` is the first one left (6 = all done). */
export function guideProgress(s: TycoonState): { step: 1 | 2 | 3 | 4 | 5 | 6; checks: boolean[] } {
  const f = fac(s);
  const connected = connectedRooms(f);
  const inRoom = (uid: string, kind: string) => f.items.filter((i) => i.room === uid && i.kind === kind && !i.closed).length;
  const c = caps(f);
  const lobby = !!c.lobby && inRoom(c.lobby.uid, "bench") >= 1;
  const playroom = f.rooms.some((r) => r.type === "playroom" && r.group && connected.has(r.uid) && inRoom(r.uid, "dog_bed") >= 2 && inRoom(r.uid, "water_bowl") >= 1);
  const calm = f.rooms.some((r) => r.type === "calm" && connected.has(r.uid));
  const checks = [lobby, playroom, calm, s.guide.painted, f.stats.checkouts >= 1];
  const first = checks.indexOf(false);
  return { step: (first < 0 ? 6 : first + 1) as 1 | 2 | 3 | 4 | 5 | 6, checks };
}

export const guideVisible = (s: TycoonState) => !s.guide.done && !s.guide.skipped;

/** Step 4 is done once the player paints (or taps "Skip this step"). */
export const markPainted = (s: TycoonState): TycoonState => (s.guide.painted ? s : { ...s, guide: { ...s.guide, painted: true } });

/** Hides the guide for good, without the reward. */
export const skipGuide = (s: TycoonState): TycoonState => ({ ...s, guide: { ...s.guide, skipped: true } });

/** Pays the +200 checklist reward once. */
export function claimGuide(s: TycoonState): TResult {
  if (s.guide.done) return { ok: false, error: "Already claimed." };
  if (s.guide.skipped) return { ok: false, error: "The guide was skipped." };
  if (guideProgress(s).step !== 6) return { ok: false, error: "Finish the checklist first." };
  const paid = earn({ ...s, guide: { ...s.guide, done: true } }, { bonus: GUIDE_REWARD });
  return { ok: true, state: paid, earned: GUIDE_REWARD, msg: `Guide complete! +${GUIDE_REWARD} coins` };
}
