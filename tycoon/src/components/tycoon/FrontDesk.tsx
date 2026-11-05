// The front desk (empire milestone §1, the old game's yellow bar): families dropping off and picking up, what they
// booked, and the one action each needs — right above the daycare. The actions are the ordinary rules (checkIn, and
// checkout through the pickup sheet when there's a concern), so billing stays exactly once.
import { Button } from "@/components/ui/button";
import { traitLabel } from "@/game/engine";
import { checkIn } from "@/tycoon/run";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { Facility, TResult, TycoonState } from "@/tycoon/types";
import { visitOf } from "@/tycoon/visit";
import { waitStage } from "@/tycoon/waiting";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;

export function FrontDesk({ f, act, onSelect, onCheckout }: { f: Facility; act: Act; onSelect: (dogId: string) => void; onCheckout: (dogId: string, exitBath: boolean) => void }) {
  const arriving = f.dogs.filter((d) => !d.checkedIn && d.place.kind === "lobby");
  const leaving = f.dogs.filter((d) => d.checkedIn && d.visit?.ownerHere != null);
  // checked in but still waiting for a spot (in the lobby or the calm room): listed so they're never lost
  const inside = f.dogs.filter((d) => d.checkedIn && d.visit?.ownerHere == null && (d.place.kind === "lobby" || d.place.kind === "calm"));
  const total = arriving.length + leaving.length;
  return (
    <section aria-label="Front desk" className="rounded-2xl border border-accent bg-accent/25 px-2 py-1.5">
      <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-secondary">
        🛎️ Front desk{total ? ` · ${total} ${total === 1 ? "family" : "families"}` : ""}
      </p>
      {total === 0 && !inside.length ? (
        <p className="px-1 pb-0.5 text-xs text-muted-foreground">No one at the desk — families arrive on their own.</p>
      ) : (
        <ul className="mt-1 flex gap-2 overflow-x-auto pb-1">
          {arriving.map((d) => {
            const v = visitOf(f, d);
            const w = waitStage(f, d);
            return (
              <li key={d.id} className={`flex shrink-0 items-center gap-2 rounded-xl border bg-card px-2 py-1 ${w?.stage === "upset" ? "border-destructive" : w?.stage === "impatient" ? "border-amber-500" : "border-border"}`}>
                <button type="button" className="min-h-11 text-left" onClick={() => onSelect(d.id)}>
                  <span className="block text-sm font-semibold text-secondary">🐕 {d.name}{d.boarding ? " · overnight" : ""}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {traitLabel(d)} · {v.requests.join(" + ")}
                    {v.bathAsked ? " · asked for a bath (no bath room yet)" : ""}
                    {w && w.stage !== "waiting" ? ` · waited ${w.minutes} min` : ""}
                  </span>
                </button>
                <Button
                  className="h-11"
                  onClick={() => {
                    const r = act((s) => checkIn(s, d.id));
                    if (r.ok) onSelect(d.id); // the pup's panel shows where it can safely go next
                  }}
                >
                  Check in {d.name}
                </Button>
              </li>
            );
          })}
          {inside.map((d) => (
            <li key={d.id} className="flex shrink-0 items-center rounded-xl border border-dashed border-border bg-card px-2 py-1">
              <button type="button" className="min-h-11 text-left" aria-label={`${d.name} · ${d.place.kind === "calm" ? "in the calm room" : "waiting for a spot"}`} onClick={() => onSelect(d.id)}>
                <span className="block text-sm font-semibold text-secondary">🐾 {d.name}</span>
                <span className="block text-[11px] text-muted-foreground">{d.place.kind === "calm" ? "in the calm room" : "waiting for a spot"}</span>
              </button>
            </li>
          ))}
          {leaving.map((d) => {
            const v = visitOf(f, d);
            return (
              <li key={d.id} className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-2 py-1">
                <button type="button" className="min-h-11 text-left" onClick={() => onSelect(d.id)}>
                  <span className="block text-sm font-semibold text-secondary">👋 {v.owner} for {d.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{v.finishing ? "waiting for the bath to finish" : "here for pickup"}</span>
                </button>
                {!v.finishing && (
                  <Button className="h-11" variant="secondary" onClick={() => onCheckout(d.id, false)}>
                    Check out {d.name}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
