// Coins, level, the day clock, open/closed and pause for the new Daycare Tycoon.
import { useEffect, useRef, useState } from "react";
import { Coins, Pause, Play } from "lucide-react";
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

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that rolls up (or down) to its new value. */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced() || typeof requestAnimationFrame === "undefined") {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let id = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 450);
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - k, 3)));
      setShown(v);
      if (k < 1) id = requestAnimationFrame(step);
      else from.current = value;
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <span className={className}>{shown.toLocaleString()}</span>;
}

export function RunHud({
  state,
  act,
  paused,
  setPaused,
  onFinances,
}: {
  state: TycoonState;
  act: (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
  paused: boolean;
  setPaused: (p: boolean) => void;
  onFinances?: () => void;
}) {
  const f = fac(state);
  const lv = levelOf(state.xp);
  const lo = xpForLevel(lv);
  const hi = xpForLevel(lv + 1);
  const pct = Math.round(((state.xp - lo) / (hi - lo)) * 100);
  const open = canOpen(f);
  const lobby = lobbyStatus(f.clockMin);
  const toggle = (v: boolean) =>
    act((s) => setOpen(s, v), v ? { event: { name: "tycoon_open", props: { day: f.day } } } : {});

  return (
    <section aria-label="Daycare status" className="sticky top-1 z-20 rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onFinances} disabled={!onFinances} className="-m-1 flex min-h-11 items-center gap-1.5 rounded-xl p-1 hover:bg-muted" aria-label={`Finances · ${state.coins} coins`}>
          <Coins className="h-5 w-5 text-accent-foreground" aria-hidden />
          <RollingNumber value={state.coins} className={`font-display text-xl font-bold tabular-nums ${state.coins < 0 ? "text-destructive" : "text-secondary"}`} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-xs font-semibold text-secondary">
            <span>Lv {lv}</span>
            <span className="text-muted-foreground">{state.xp - lo}/{hi - lo} XP</span>
          </div>
          <Progress value={pct} aria-label={`Level ${lv}, ${pct}% to level ${lv + 1}`} className="mt-1 h-2" />
        </div>
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
