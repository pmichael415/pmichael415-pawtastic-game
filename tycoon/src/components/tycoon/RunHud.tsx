// Coins, level, the day clock, open/closed and pause for the new Daycare Tycoon.
import { Coins, Pause, Play, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { fmtClock, lobbyStatus } from "@/game/engine";
import { canOpen } from "@/tycoon/connect";
import { levelOf, xpForLevel } from "@/tycoon/progress";
import { setOpen } from "@/tycoon/run";
import { fac } from "@/tycoon/state";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { TResult, TycoonState } from "@/tycoon/types";
import { CoinCounter } from "./CoinCounter";

export function RunHud({
  state,
  act,
  paused,
  setPaused,
  onFinances,
  onReputation,
  onShop,
}: {
  state: TycoonState;
  act: (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
  paused: boolean;
  setPaused: (p: boolean) => void;
  onFinances?: () => void;
  /** Opens why reputation moved, the reviews and recent pickups. */
  onReputation?: () => void;
  onShop?: () => void;
}) {
  const f = fac(state);
  const lv = levelOf(state.xp);
  const lo = xpForLevel(lv);
  const hi = xpForLevel(lv + 1);
  const pct = Math.round(((state.xp - lo) / (hi - lo)) * 100);
  const open = canOpen(f);
  const lobby = lobbyStatus(f.clockMin);
  const recent = (f.reviews ?? []).slice(-10);
  const stars = recent.length ? (recent.reduce((n, r) => n + r.stars, 0) / recent.length).toFixed(1) : "";
  const toggle = (v: boolean) =>
    act((s) => setOpen(s, v), v ? { event: { name: "tycoon_open", props: { day: f.day } } } : {});

  return (
    <section aria-label="Daycare status" className="sticky top-1 z-20 rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onFinances} disabled={!onFinances} className="-m-1 flex min-h-11 items-center gap-1.5 rounded-xl p-1 hover:bg-muted" aria-label={`Finances · ${state.coins} coins`}>
          <Coins className="h-5 w-5 text-accent-foreground" aria-hidden />
          <CoinCounter value={state.coins} className={`font-display text-xl font-bold tabular-nums ${state.coins < 0 ? "text-destructive" : "text-secondary"}`} />
        </button>
        {onShop && (
          <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" onClick={onShop} aria-label="Get coins">
            <Plus className="h-5 w-5" aria-hidden />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-xs font-semibold text-secondary">
            <span>Lv {lv}</span>
            <span className="text-muted-foreground">{state.xp - lo}/{hi - lo} XP</span>
          </div>
          <Progress value={pct} aria-label={`Level ${lv}, ${pct}% to level ${lv + 1}`} className="mt-1 h-2" />
        </div>
        {onShop && (
          <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" onClick={onShop} aria-label="Daycare Shop">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </Button>
        )}
        <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" onClick={() => setPaused(!paused)} aria-label={paused ? "Resume" : "Pause"}>
          {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="font-semibold text-secondary">
          Day {f.day} · {fmtClock(f.clockMin)}
        </span>
        {f.open && !lobby.open && <span className="text-xs text-muted-foreground">· lobby break</span>}
        {paused && <span className="text-xs font-semibold text-accent-foreground">· paused</span>}
        {f.open && f.dogs.filter((d) => d.place.kind === "lobby").length >= 3 && (
          <span role="status" className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
            Rush hour!
          </span>
        )}
        {onReputation && (
          <button type="button" onClick={onReputation} aria-label={`Reputation ${Math.round(f.reputation)}${stars ? `, ${stars} stars` : ""}`} className="-my-2 min-h-11 rounded-xl px-2 text-xs font-bold text-secondary hover:bg-muted">
            Rep {Math.round(f.reputation)}{stars ? ` · ★${stars}` : ""}
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 font-semibold text-secondary">
          {f.open ? "Open" : "Closed"}
          <Switch checked={f.open} onCheckedChange={toggle} aria-label="Open for business" disabled={!f.open && !open.ok} />
        </label>
      </div>
      {!f.open && !open.ok && (
        <p className="mt-1 text-xs text-muted-foreground">
          To open you need: {open.missing.join(" · ")}
        </p>
      )}
    </section>
  );
}
