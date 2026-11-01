// The level-up celebration: confetti (not with reduced motion), "Level N!", the new unlocks flipping in as cards, and
// the 25 × N coin reward. Continue clears it.
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { levelReward, unlocksAt } from "@/tycoon/progress";
import { sound } from "@/tycoon/sound";
import type { TycoonState } from "@/tycoon/types";

const COLORS = ["#ffd34d", "#e46a96", "#4cc3a0", "#0057A7", "#e0a100", "#9fe6ff"];

export function LevelUp({ state, set }: { state: TycoonState; set: (fn: (s: TycoonState) => TycoonState) => void }) {
  const { reducedMotion } = useSettings();
  const n = state.pendingLevel;
  useEffect(() => {
    if (n) sound.play("fanfare");
  }, [n]);
  if (!n) return null;
  const unlocks = unlocksAt(n);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tycoon-levelup-title" className="fixed inset-0 z-50 grid place-items-center bg-secondary/70 p-4">
      {!reducedMotion && (
        <div data-testid="confetti" aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              className="absolute top-[-5%] block h-3 w-2 rounded-sm"
              style={{ left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length], animation: `tycoon-fall ${1.6 + (i % 5) * 0.35}s ${(i % 7) * 0.12}s ease-in forwards`, transform: `rotate(${i * 23}deg)` }}
            />
          ))}
        </div>
      )}
      <div className="relative w-full max-w-sm rounded-3xl bg-card p-5 text-center shadow-soft">
        <p className="eyebrow">Your daycare is growing</p>
        <h2 id="tycoon-levelup-title" className="font-display text-4xl font-bold text-secondary">
          Level {n}!
        </h2>
        <p className="mt-1 font-display text-xl font-bold text-primary">+{levelReward(n)} coins</p>
        {unlocks.length > 0 && (
          <>
            <p className="mt-3 text-sm font-semibold text-secondary">New to build:</p>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {unlocks.map((u, i) => (
                <li key={u} className="rounded-xl border border-accent bg-accent/30 p-2 text-sm font-semibold text-secondary" style={reducedMotion ? undefined : { animation: `tycoon-flip 500ms ${150 + i * 120}ms ease-out both` }}>
                  {u}
                </li>
              ))}
            </ul>
          </>
        )}
        <Button className="mt-4 h-11 w-full" onClick={() => set((s) => ({ ...s, pendingLevel: null }))}>
          Continue
        </Button>
      </div>
    </div>
  );
}
