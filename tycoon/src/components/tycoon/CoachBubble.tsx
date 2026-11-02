// The guided tour's coach, pinned to the daycare (Stage A, spec §3.2–3.3): one line and the one thing to do next,
// in words that match the player's controls. The upgrade and decision beats offer their choices right here.
import { groupName, groupOf } from "@/game/engine";
import { furnitureDef, outdoorDef } from "@/tycoon/catalog";
import { canOpen, caps } from "@/tycoon/connect";
import { beatText, guideText, type Controls } from "@/tycoon/controls";
import { ROOM_FUN_HAPPY } from "@/tycoon/effects";
import { guideProgress } from "@/tycoon/guide";
import { placeFirstFree } from "@/tycoon/build";
import { fac } from "@/tycoon/state";
import type { ActOpts, ActResult } from "@/tycoon/store";
import { TOUR_DOGS, chooseUpgrade, firstDogGroup, skipTour } from "@/tycoon/tour";
import { buildPlayroomFor, playroomCost, restAtHome } from "@/tycoon/tourActions";
import type { TResult, TycoonState, TourUpgrade } from "@/tycoon/types";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;

const UPGRADES: { kind: TourUpgrade; name: string; price: number; benefit: string }[] = [
  { kind: "toy_bin", name: "Toy Bin", price: furnitureDef("toy_bin")!.price, benefit: `+${ROOM_FUN_HAPPY * (furnitureDef("toy_bin")!.fun ?? 0)} happiness at every playtime in its playroom` },
  { kind: "play_yard", name: "Play Yard", price: outdoorDef("play_yard")!.price, benefit: `+${outdoorDef("play_yard")!.fun![0]} happiness at every playtime, for every pup` },
];

export function CoachBubble({ state, controls, act, set }: { state: TycoonState; controls: Controls; act: Act; set: (fn: (s: TycoonState) => TycoonState) => void }) {
  const t = state.tour;
  if (!t || t.done || t.skipped) return null;
  const f = fac(state);
  const chosen = UPGRADES.find((u) => u.kind === t.upgrade) ?? UPGRADES.find((u) => f.items.some((i) => i.kind === u.kind));
  const rocket = f.dogs.find((d) => d.name === TOUR_DOGS.third) ?? null;
  // Once a playroom for the decision pup exists, the coach says to take him there instead of offering to build one.
  const roomReady = !!rocket && caps(f).playrooms.some((p) => p.group === groupOf(rocket) && p.spots > 0);
  const ctx = {
    first: TOUR_DOGS.first,
    second: TOUR_DOGS.second,
    third: TOUR_DOGS.third,
    group: groupName(firstDogGroup(f)),
    upgrade: chosen?.name ?? "upgrade",
    ...(rocket ? { thirdGroup: groupName(groupOf(rocket)), roomReady } : {}),
  };
  const text = beatText(t.beat, controls, ctx);
  const step = guideProgress(state).step;
  return (
    <section aria-label="Guide" className="rounded-2xl border border-accent bg-card/95 p-3 shadow-pop backdrop-blur">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold text-secondary">{text.title}</p>
          <p className="text-sm text-secondary">{text.action}</p>
          {t.beat === "meet" && (
            <p className="mt-1 text-sm text-muted-foreground">
              {step <= 3 ? `Step ${step} of 3: ${guideText(step, controls)}` : canOpen(f).ok && !f.open ? "Ready! Switch Open on in the status bar." : ""}
            </p>
          )}
        </div>
        <button type="button" onClick={() => set(skipTour)} className="min-h-11 shrink-0 rounded-xl px-2 text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline">
          Skip guide
        </button>
      </div>
      {t.beat === "upgrade" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {UPGRADES.map((u) => (
            <button
              key={u.kind}
              type="button"
              aria-label={`${u.name} · ${u.price} coins`}
              onClick={() => {
                set((s) => chooseUpgrade(s, u.kind));
                act((s) => placeFirstFree(s, u.kind), { event: { name: "tycoon_build", props: { kind: u.kind, action: "tour-upgrade" } } });
              }}
              className="min-h-11 rounded-xl border border-primary bg-background p-2 text-left"
            >
              <span className="block text-sm font-bold text-secondary">
                {u.name} · {u.price} coins
              </span>
              <span className="block text-xs text-muted-foreground">{u.benefit}</span>
            </button>
          ))}
        </div>
      )}
      {t.beat === "decision" && rocket && (() => {
        const g = groupOf(rocket);
        const cost = playroomCost(state, g);
        return (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {cost !== null && !roomReady && (
              <button type="button" onClick={() => act((s) => buildPlayroomFor(s, g))} className="min-h-11 rounded-xl bg-primary p-2 text-left text-sm font-bold text-primary-foreground">
                {`Build a ${groupName(g)} playroom · ${cost} coins`}
              </button>
            )}
            <button type="button" onClick={() => act((s) => restAtHome(s, rocket.id))} className="min-h-11 rounded-xl border border-border bg-background p-2 text-left text-sm font-bold text-secondary">
              {`Let ${rocket.name} rest in the calm room today (free)`}
            </button>
          </div>
        );
      })()}
    </section>
  );
}
