import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adventureStatus, siteName, type GameState, type SiteId } from "@/game/engine";
import { peekSave } from "@/game/store";
import { fetchStandings, teamPointsToday, TEAM_DAILY_CAP, type Standings } from "@/lib/team";
import { TEAM_COLORS, joinTeam, openTeamPicker, useTeamVersion } from "./TeamPicker";

const TEAMS: SiteId[] = ["hawthorne", "hillsdale"];

/** Home-page card: pick a team, or see your team's week and adventure. */
export function TeamCard() {
  const version = useTeamVersion();
  const [s, setS] = useState<GameState | null>(null);
  const [standings, setStandings] = useState<Standings | null | "loading">("loading");
  useEffect(() => setS(peekSave()), [version]);
  useEffect(() => {
    let off = false;
    void fetchStandings().then((r) => !off && setStandings(r));
    return () => {
      off = true;
    };
  }, [version]);
  if (!s) return null;

  if (!s.team) {
    return (
      <section
        aria-label="Pick your team"
        className="rounded-2xl border border-accent bg-card p-4 shadow-soft"
      >
        <h2 className="font-display text-lg font-bold text-secondary">Pick your team! 🐾</h2>
        <p className="text-sm text-muted-foreground">
          Team Hawthorne or Team Hillsdale? Your team picks where your daycare opens, your
          adventure, and who you play for each week.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {TEAMS.map((t) => (
            <Button
              key={t}
              className={`h-12 font-display text-base text-white ${TEAM_COLORS[t].bg}`}
              onClick={() => joinTeam(t)}
            >
              Team {siteName(t)}
            </Button>
          ))}
        </div>
        <button
          type="button"
          className="mt-1 min-h-11 w-full text-xs text-muted-foreground underline"
          onClick={openTeamPicker}
        >
          Compare the teams first
        </button>
      </section>
    );
  }

  const team = s.team;
  const adv = adventureStatus(s);
  const week = standings && standings !== "loading" ? standings.thisWeek : null;
  const last = standings && standings !== "loading" ? standings.lastWeek : null;
  const total = week ? Math.max(1, week.hawthorne.points + week.hillsdale.points) : 1;
  const lastWinner =
    last && last.hawthorne.points + last.hillsdale.points > 0
      ? last.hawthorne.points === last.hillsdale.points
        ? "Last week was a tie!"
        : `Last week: Team ${siteName(last.hawthorne.points > last.hillsdale.points ? "hawthorne" : "hillsdale")} won.`
      : null;
  return (
    <section aria-label={`Team ${siteName(team)}`} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <h2 className={`font-display text-xl font-bold ${TEAM_COLORS[team].text}`}>
          Team {siteName(team)} 🐾
        </h2>
        <button
          type="button"
          className="min-h-11 px-1 text-xs text-muted-foreground underline"
          onClick={openTeamPicker}
        >
          Switch team
        </button>
      </div>
      <h3 className="mt-1 flex items-center gap-1 text-sm font-bold text-secondary">
        <Trophy className="h-4 w-4 text-accent" /> This week: Team Hawthorne vs Team Hillsdale
      </h3>
      {standings === "loading" ? (
        <p className="text-xs text-muted-foreground">Loading team totals…</p>
      ) : week ? (
        <div className="mt-1 space-y-1" data-testid="team-standings">
          {TEAMS.map((t) => (
            <div key={t}>
              <div className="flex justify-between text-xs font-bold text-secondary">
                <span>
                  Team {siteName(t)}
                  {t === team ? " (you)" : ""}
                </span>
                <span>
                  {week[t].points.toLocaleString()} pts · {week[t].players} player
                  {week[t].players === 1 ? "" : "s"}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${TEAM_COLORS[t].bg}`}
                  style={{ width: `${(week[t].points / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {lastWinner && <p className="text-xs text-muted-foreground">{lastWinner}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="team-standings">
          Team totals aren't available right now — your points still count.
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Your points today: {teamPointsToday()}/{TEAM_DAILY_CAP}. Earn them by checking pups in,
        caring for them, Recess Rush runs and Graduation Day levels.
      </p>
      {adv && (
        <div className="mt-2 rounded-2xl bg-muted p-2">
          <p className="text-sm font-bold text-secondary">
            {adv.done
              ? `🏅 “${adv.adventure.title}” complete!`
              : `Adventure: “${adv.adventure.title}” · chapter ${adv.chapter + 1}/${adv.adventure.chapters.length}`}
          </p>
          {adv.current && (
            <p className="text-xs text-muted-foreground">
              {adv.current.title}: {adv.progress}/{adv.current.target}
            </p>
          )}
          <Button asChild className="mt-1 h-11 w-full">
            <Link to="/daycare">
              Continue in your daycare <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}
