// Below zero: building, upgrading, land, hiring and marketing pause until income brings coins back. The daycare keeps
// running normally. No loans, no interest, no automatic selling.
import { moneyTip } from "@/tycoon/business";
import { fac } from "@/tycoon/state";
import type { TycoonState } from "@/tycoon/types";

export function MoneyBanner({ state }: { state: TycoonState }) {
  if (state.coins >= 0) return null;
  const idea = moneyTip(fac(state), { profit: -1 });
  return (
    <div role="status" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-secondary">
      <p className="font-semibold">Coins below zero: building is paused until income brings you back above zero</p>
      <p className="mt-1 text-xs">Your daycare keeps running. Idea: {idea}</p>
    </div>
  );
}
