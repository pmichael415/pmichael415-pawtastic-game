// The team (staff design §2): who's on it, what each person is doing right now, their role, rooms, priority and
// wage — and hiring. Staff do routine work; concerns, refusals, scuffles and prices stay with the player.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WAGES } from "@/tycoon/business";
import { FOCI, FOCUS_NAME, ROLE_JOB, ROLE_NAME, ROLES } from "@/tycoon/roles";
import { roomName } from "@/tycoon/rooms";
import { fac } from "@/tycoon/state";
import { canHire, hire, hireCostFor, letGo, recommendRole, setFocus, setRole, setRooms, staffStatus, teamWages } from "@/tycoon/team";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { Facility, Role, TResult, TStaff, TycoonState } from "@/tycoon/types";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
const coins = (n: number) => n.toLocaleString("en-US");
const seg = (on: boolean) => `min-h-11 rounded-xl border px-3 text-xs font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-secondary hover:bg-muted"}`;

export function StaffCard({ f, st, act }: { f: Facility; st: TStaff; act: Act }) {
  const [confirm, setConfirm] = useState(false);
  const status = staffStatus(f, st);
  const roomsFor = st.role === "attendant" ? f.rooms.filter((r) => r.type === "playroom") : st.role === "cleaner" ? f.rooms : [];
  return (
    <li aria-label={st.name} className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-baseline gap-2">
        <h4 className="font-semibold text-secondary">{st.name}</h4>
        <span className="text-xs text-muted-foreground">{st.founder ? "Founding partner" : st.role ? ROLE_NAME[st.role] : "No role"} · {WAGES[f.wage]} coins a day</span>
      </div>
      <p data-testid={`status-${st.id}`} className={`mt-0.5 text-sm ${status.tone === "needs" ? "font-semibold text-destructive" : "text-secondary"}`}>{status.text}</p>
      {!status.text.includes("needs you") && st.note && !st.job && <p className="text-xs text-muted-foreground">Last: {st.note}</p>}
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        Energy <Progress value={st.energy} className="h-1.5 w-24" aria-label={`${st.name}'s energy ${Math.round(st.energy)}%`} />
      </div>
      {!st.founder && (
        <>
          <div role="group" aria-label={`${st.name}'s role`} className="mt-2 flex flex-wrap gap-1.5">
            {ROLES.map((r) => (
              <button key={r} type="button" className={seg(st.role === r)} aria-pressed={st.role === r} onClick={() => st.role !== r && act((s) => setRole(s, st.id, r))}>
                {ROLE_NAME[r]}
              </button>
            ))}
          </div>
          {st.role && (
            <div role="group" aria-label={`${st.name}'s priority`} className="mt-2 flex flex-wrap gap-1.5">
              {FOCI[st.role].map((x) => (
                <button key={x} type="button" className={seg(st.focus === x)} aria-pressed={st.focus === x} onClick={() => act((s) => setFocus(s, st.id, x))}>
                  {FOCUS_NAME[x]}
                </button>
              ))}
            </div>
          )}
          {roomsFor.length > 0 && (
            <div role="group" aria-label={`${st.name}'s rooms`} className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className={seg(!st.rooms?.length)} aria-pressed={!st.rooms?.length} onClick={() => act((s) => setRooms(s, st.id, []))}>
                All rooms
              </button>
              {roomsFor.map((r) => {
                const on = !!st.rooms?.includes(r.uid);
                return (
                  <button key={r.uid} type="button" className={seg(on)} aria-pressed={on} onClick={() => act((s) => setRooms(s, st.id, on ? (st.rooms ?? []).filter((x) => x !== r.uid) : [...(st.rooms ?? []), r.uid]))}>
                    {roomName(f, r.uid)}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-2">
            {confirm ? (
              <span className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                Let {st.name} go? No refund of the sign-on fee; their wage stops from tonight.
                <Button variant="destructive" className="h-11" onClick={() => act((s) => letGo(s, st.id))}>Let {st.name} go</Button>
                <Button variant="ghost" className="h-11" onClick={() => setConfirm(false)}>Keep</Button>
              </span>
            ) : (
              <Button variant="ghost" className="h-11 text-xs" onClick={() => setConfirm(true)}>Let go…</Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function TeamSheet({ state, act, onClose }: { state: TycoonState; act: Act; onClose: () => void }) {
  const f = fac(state);
  const recommended = recommendRole(f);
  const [pick, setPick] = useState<Role>(recommended);
  const cost = hireCostFor(f);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-2xl" aria-label="Team">
        <SheetHeader>
          <SheetTitle>Team · {f.staff.length} of 6</SheetTitle>
          <SheetDescription>
            Wages {coins(teamWages(f))} game coins a day, paid at closing (18:00). Staff handle routine work on their own; concerns, refusals, scuffles and prices stay with you.
          </SheetDescription>
        </SheetHeader>
        <ul className="mt-3 space-y-2">
          {f.staff.map((st) => (
            <StaffCard key={st.id} f={f} st={st} act={act} />
          ))}
        </ul>
        {canHire(f) ? (
          <section aria-label="Hire" className="mt-4 rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-bold text-secondary">Hire someone</h3>
            <div role="radiogroup" aria-label="Role to hire" className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {ROLES.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={pick === r} onClick={() => setPick(r)} className={`min-h-11 rounded-xl border p-2 text-left text-xs ${pick === r ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}>
                  <span className="font-semibold text-secondary">{ROLE_NAME[r]}{r === recommended ? " · recommended" : ""}</span>
                  <span className="mt-0.5 block text-muted-foreground">{ROLE_JOB[r]}</span>
                </button>
              ))}
            </div>
            <Button className="mt-2 h-11 w-full" disabled={state.coins < cost} onClick={() => act((s) => hire(s, pick))}>
              Hire a {ROLE_NAME[pick].toLowerCase()} · sign-on {coins(cost)} · {WAGES[f.wage]} a day
            </Button>
            {state.coins < cost && <p className="mt-1 text-xs text-muted-foreground">{coins(cost - state.coins)} more game coins needed.</p>}
          </section>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Your team is full (6 people).</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
