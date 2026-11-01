// The skippable guided start checklist (spec §3).
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GUIDE_STEPS, claimGuide, guideProgress, guideVisible, markPainted, skipGuide } from "@/tycoon/guide";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { TResult, TycoonState } from "@/tycoon/types";
import { GUIDE_REWARD } from "@/tycoon/catalog";

export function GuideCard({
  state,
  act,
  set,
}: {
  state: TycoonState;
  act: (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
  set: (fn: (s: TycoonState) => TycoonState) => void;
}) {
  if (!guideVisible(state)) return null;
  const { step, checks } = guideProgress(state);
  return (
    <section aria-label="Getting started" className="rounded-2xl border border-accent bg-card p-4 shadow-soft">
      <p className="eyebrow">Getting started · +{GUIDE_REWARD} coins when done</p>
      <ol className="mt-2 space-y-2">
        {GUIDE_STEPS.map((g, i) => (
          <li key={g.title} className={`flex gap-2 ${i + 1 === step ? "" : "opacity-70"}`}>
            {checks[i] ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-label="done" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="to do" />}
            <div className="min-w-0">
              <p className="font-semibold text-secondary">{g.title}</p>
              {i + 1 === step && <p className="text-sm text-muted-foreground">{g.detail}</p>}
              {i + 1 === step && i === 3 && (
                <Button size="sm" variant="ghost" className="mt-1 h-9 px-2" onClick={() => set(markPainted)}>
                  Skip this step
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        {step === 6 ? (
          <Button className="h-11 flex-1" onClick={() => act(claimGuide)}>
            Claim +{GUIDE_REWARD} coins
          </Button>
        ) : (
          <Button variant="outline" className="h-11" onClick={() => set(skipGuide)}>
            Skip guide
          </Button>
        )}
      </div>
    </section>
  );
}
