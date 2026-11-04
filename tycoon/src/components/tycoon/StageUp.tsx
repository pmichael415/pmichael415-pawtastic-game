// A new facility stage (combined-loop plan, task 5): the daycare grew into a Growing daycare, a Full-service daycare
// or a PAWtastic campus. Confetti (not with reduced motion), what the stage means, and what the next one needs.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { sound } from "@/tycoon/sound";
import type { FacilityStage } from "@/tycoon/stages";

const COLORS = ["#ffd34d", "#e46a96", "#4cc3a0", "#0057A7", "#e0a100", "#9fe6ff"];

export function StageUp({ stage, onClose }: { stage: FacilityStage; onClose: () => void }) {
  const { reducedMotion } = useSettings();
  useEffect(() => {
    sound.play("fanfare");
  }, [stage.id]);
  const n = stage.next;
  const overlay = (
    <div role="dialog" aria-modal="true" aria-labelledby="tycoon-stageup-title" className="fixed inset-0 z-[70] grid place-items-center bg-secondary/70 p-4">
      {!reducedMotion && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              className="absolute top-[-5%] block h-3 w-2 rounded-sm"
              style={{ left: `${(i * 41) % 100}%`, background: COLORS[i % COLORS.length], animation: `tycoon-fall ${1.6 + (i % 5) * 0.35}s ${(i % 7) * 0.12}s ease-in forwards`, transform: `rotate(${i * 29}deg)` }}
            />
          ))}
        </div>
      )}
      <div className="relative w-full max-w-sm rounded-3xl bg-card p-5 text-center shadow-soft">
        <p className="eyebrow">Your daycare grew</p>
        <h2 id="tycoon-stageup-title" className="font-display text-3xl font-bold text-secondary">
          {stage.name}!
        </h2>
        <p className="mt-2 text-sm text-secondary">{stage.means}</p>
        {n ? (
          <div className="mt-3 rounded-xl border border-accent bg-accent/20 p-3 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Next: {n.name}</p>
            <p className="text-xs text-muted-foreground">{n.anyOf ? "Any one of these:" : "Needs all of these:"}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {n.needs.map((x) => (
                <li key={x.way} className={x.done ? "text-muted-foreground line-through" : "font-semibold text-secondary"}>
                  {x.done ? "✓" : "○"} {x.label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-primary">The top stage — a second location comes next.</p>
        )}
        <Button className="mt-4 h-11 w-full" onClick={onClose}>
          Continue
        </Button>
      </div>
    </div>
  );
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
