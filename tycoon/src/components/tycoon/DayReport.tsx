// The end-of-day wrap-up: who came and went, income, expenses and profit, a "New record!" banner and one money tip.
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useEffect } from "react";
import { sound } from "@/tycoon/sound";
import { fac, withFac } from "@/tycoon/state";
import type { TycoonState } from "@/tycoon/types";

export function DayReport({ state, set, onFinances }: { state: TycoonState; set: (fn: (s: TycoonState) => TycoonState) => void; onFinances?: () => void }) {
  const f = fac(state);
  const r = f.report;
  const dismiss = () => set((s) => withFac(s, { ...fac(s), report: null }));
  const day = r?.day;
  useEffect(() => {
    if (day) sound.play("drumroll");
  }, [day]);
  return (
    <AlertDialog open={!!r} onOpenChange={(o) => !o && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>🌙 Day {r?.day} wrap-up</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-secondary">
              {r?.record && <p className="rounded-xl bg-accent px-3 py-2 text-center font-display text-lg font-bold text-accent-foreground">New record!</p>}
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profit</p>
                <p className={`font-display text-4xl font-bold tabular-nums ${r && r.profit < 0 ? "text-destructive" : "text-secondary"}`}>{r ? (r.profit > 0 ? `+${r.profit.toLocaleString()}` : r.profit.toLocaleString()) : ""}</p>
                <p className="text-xs text-muted-foreground">
                  income {r?.income.toLocaleString()} · expenses {r?.expenses.toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center font-bold">
                <div className="rounded-xl bg-muted p-2">
                  <div className="font-display text-xl">{r?.admitted}</div>checked in
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <div className="font-display text-xl">{r?.checkouts}</div>went home
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <div className="font-display text-xl">{r?.avgHappy}%</div>happy
                </div>
              </div>
              {r?.tip && <p className="rounded-xl border border-border p-2">{r.tip}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {onFinances && (
            <button
              type="button"
              className="min-h-11 rounded-md border border-border px-4 font-semibold text-secondary"
              onClick={() => {
                dismiss();
                onFinances();
              }}
            >
              Open Finances
            </button>
          )}
          <AlertDialogAction className="min-h-11" onClick={dismiss}>
            Start day {f.day}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
