// A tapped team member: their role, rooms, priority, wage and what they're doing right now.
import { Button } from "@/components/ui/button";
import { WAGES } from "@/tycoon/business";
import { FOCUS_NAME, ROLE_JOB, ROLE_NAME } from "@/tycoon/roles";
import { roomName } from "@/tycoon/rooms";
import { liveRooms, staffStatus } from "@/tycoon/team";
import type { Facility, TStaff } from "@/tycoon/types";

export function StaffPanel({ f, st, onManage }: { f: Facility; st: TStaff; onManage: () => void }) {
  const status = staffStatus(f, st);
  return (
    <article aria-label={st.name} className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-baseline gap-2">
        <h4 className="font-semibold text-secondary">{st.name}</h4>
        <span className="text-xs text-muted-foreground">{st.founder ? "Founding partner" : st.role ? ROLE_NAME[st.role] : "No role yet"} · {WAGES[f.wage]} coins a day · energy {Math.round(st.energy)}%</span>
      </div>
      <p className={`mt-1 text-sm ${status.tone === "needs" ? "font-semibold text-destructive" : "text-secondary"}`}>Now: {status.text}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {st.founder ? "Helps with whatever you tap." : st.role ? ROLE_JOB[st.role] : "Give them a role in Team so they work on their own."}
      </p>
      {st.role && (
        <p className="mt-1 text-xs text-secondary">
          Priority: {st.focus ? FOCUS_NAME[st.focus] : "—"}
          {(st.role === "attendant" || st.role === "cleaner") && ` · Rooms: ${liveRooms(f, st).length ? liveRooms(f, st).map((r) => roomName(f, r)).join(", ") : "all"}`}
        </p>
      )}
      <Button variant="outline" className="mt-2 h-11" onClick={onManage}>
        Manage team
      </Button>
    </article>
  );
}
