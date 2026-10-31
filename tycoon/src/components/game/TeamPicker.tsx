// "Pick your team": Team Hawthorne or Team Hillsdale. One dialog for the whole site, opened automatically for
// new players and from Settings / the home page. Joining is saved in the player's game (and cloud save).
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ADVENTURES,
  checkAchievements,
  pickTeam,
  siteName,
  type Result,
  type SiteId,
} from "@/game/engine";
import { peekSave, updateSave } from "@/game/store";
import { LOCATIONS } from "@/lib/locations";
import { track } from "@/lib/analytics";

export const TEAM_COLORS: Record<SiteId, { bg: string; ring: string; text: string }> = {
  hawthorne: { bg: "bg-[#0057A7]", ring: "ring-[#0057A7]", text: "text-[#0057A7]" },
  hillsdale: { bg: "bg-[#2f8f57]", ring: "ring-[#2f8f57]", text: "text-[#2f8f57]" },
};
const DISMISS_KEY = "pawtastic-team-dismissed";

let state = { open: false, version: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER = state;
export function openTeamPicker() {
  state = { ...state, open: true };
  emit();
}
function close(dismissed: boolean) {
  if (dismissed) {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }
  state = { ...state, open: false };
  emit();
}
/** Re-renders when the player joins or switches team (bump `version`). */
export const useTeamVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => state.version,
    () => 0,
  );
/** New players see the picker once per visit until they choose (or tap "Not sure yet"). */
export function maybeAskForTeam() {
  try {
    if (sessionStorage.getItem(DISMISS_KEY)) return;
  } catch {
    /* ignore */
  }
  if (!peekSave().team) openTeamPicker();
}

export function joinTeam(team: SiteId): boolean {
  const prev = peekSave().team;
  let res = { ok: false, error: "Couldn't join the team." } as Result;
  updateSave((s) => {
    res = pickTeam(s, team, Date.now());
    return res.ok ? checkAchievements(res.state).state : s;
  });
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  track("team_pick", { team, switched: !!prev });
  toast.success(res.msg ?? `Welcome to Team ${siteName(team)}!`);
  state = { open: false, version: state.version + 1 };
  emit();
  return true;
}

export function TeamPicker() {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
  const current = s.open ? peekSave().team : null;
  return (
    <Dialog open={s.open} onOpenChange={(o) => (o ? openTeamPicker() : close(true))}>
      <DialogContent className="max-h-[90svh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-secondary">
            Pick your team!
          </DialogTitle>
          <DialogDescription className="font-bold">
            Which PAWtastic is yours? Your team sets where your daycare opens, your team adventure,
            and who you play for in the weekly Team Hawthorne vs Team Hillsdale challenge. You can
            switch once a week.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {LOCATIONS.map((l) => {
            const adv = ADVENTURES[l.id];
            const c = TEAM_COLORS[l.id];
            const mine = current === l.id;
            return (
              <article
                key={l.id}
                className={`rounded-2xl border-2 bg-card p-3 ${mine ? `ring-4 ${c.ring}` : "border-border"}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-full ${c.bg} font-display text-lg font-bold text-white`}
                    aria-hidden
                  >
                    {l.name[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-display text-lg font-bold ${c.text}`}>Team {l.name}</h3>
                    <p className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                      <MapPin className="h-3 w-3" /> PAWtastic {l.name} · {l.address}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-sm font-bold text-secondary">
                  Adventure: “{adv.title}” — {adv.intro}
                </p>
                <Button
                  className={`mt-2 h-12 w-full font-display text-base text-white ${c.bg}`}
                  disabled={mine}
                  onClick={() => joinTeam(l.id)}
                >
                  {mine ? "Your team ✓" : `Join Team ${l.name}`}
                </Button>
              </article>
            );
          })}
        </div>
        <p className="text-[11px] font-bold text-muted-foreground">
          Team stories are fictional game adventures, not descriptions of the real locations.
          Picking a team doesn't sign you up for anything.
        </p>
        <Button variant="ghost" className="min-h-11" onClick={() => close(true)}>
          Not sure yet
        </Button>
      </DialogContent>
    </Dialog>
  );
}
