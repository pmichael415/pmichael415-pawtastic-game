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
  // what that day spent on building (an investment, not a running cost)
  const built = r?.invested ?? 0;
  const running = r?.running ?? 0;
  // where the money came from and went (explains the numbers: empire milestone, "earn, reinvest, expand")
  const day0 = r ? f.ledger.find((l) => l.day === r.day) : undefined;
  const IN: [keyof NonNullable<typeof day0>["income"], string][] = [["daycare", "daycare"], ["boarding", "boarding"], ["baths", "baths"], ["exitBaths", "exit baths"], ["tips", "tips"], ["bonus", "bonuses"]];
  const OUT: [keyof NonNullable<typeof day0>["expenses"], string][] = [["wages", "wages"], ["upkeep", "upkeep"], ["supplies", "supplies"], ["marketing", "marketing"], ["refunds", "refunds"]];
  const earnedFrom = day0 ? IN.filter(([k]) => day0.income[k] > 0).map(([k, n]) => `${n} ${day0.income[k].toLocaleString()}`).join(" · ") : "";
  const spentOn = day0 ? OUT.filter(([k]) => day0.expenses[k] > 0).map(([k, n]) => `${n} ${day0.expenses[k].toLocaleString()}`).join(" · ") : "";
  const signed = (n: number, minus = false) => (n > 0 ? `+${n.toLocaleString()}` : minus && n < 0 ? `−${Math.abs(n).toLocaleString()}` : n.toLocaleString());
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
              {built > 0 && r ? (
                // a day you built on: the running result leads, and the building is shown as what you invested
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Running the daycare</p>
                  <p className={`font-display text-4xl font-bold tabular-nums ${running < 0 ? "text-destructive" : "text-secondary"}`}>{signed(running)}</p>
                  <p className="text-xs text-muted-foreground">
                    income {r.income.toLocaleString()} · running costs {(r.expenses - built).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-secondary">
                    You invested {built.toLocaleString()} in building — your daycare grew. Profit after building {signed(r.profit, true)}.
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profit</p>
                  <p className={`font-display text-4xl font-bold tabular-nums ${r && r.profit < 0 ? "text-destructive" : "text-secondary"}`}>{r ? signed(r.profit) : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    income {r?.income.toLocaleString()} · expenses {r?.expenses.toLocaleString()}
                  </p>
                </div>
              )}
              {(earnedFrom || spentOn) && (
                <div className="rounded-xl bg-muted p-2 text-xs">
                  {earnedFrom && <p><b>Earned:</b> {earnedFrom}</p>}
                  {spentOn && <p><b>Running costs:</b> {spentOn}</p>}
                </div>
              )}
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
