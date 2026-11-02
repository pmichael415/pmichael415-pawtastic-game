// Graduation Day's Weekly Challenge: the hub's copy of the game uses Graduation Day's own server (docs/graduation-hub/),
// so scores count for its leaderboard and real prizes right here. The slim link on /graduation shows only while that
// server can't be reached, and then opens Graduation Day's own site. No prize details are copied here: the lineup
// changes every week with the owner's approval and is shown inside the game.
import { Link } from "@tanstack/react-router";
import { ExternalLink, Trophy } from "lucide-react";
import { track } from "@/lib/analytics";

export const GRADUATION_SITE = "https://pawtastic-graduation.lovable.app";

export function GraduationWeeklyCard({
  from,
  slim = false,
}: {
  from: "home" | "graduation";
  slim?: boolean;
}) {
  if (slim)
    return (
      <a
        href={GRADUATION_SITE}
        target="_blank"
        rel="noopener"
        onClick={() => track("graduation_weekly_open", { from })}
        aria-label="Play the Weekly Challenge for real prizes on Graduation Day's own site"
        className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-accent bg-card px-3 text-sm font-semibold text-secondary"
      >
        <Trophy className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          Weekly Challenge for real prizes: on Graduation Day's site
        </span>
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
      </a>
    );
  return (
    <section
      aria-label="Graduation Day Weekly Challenge"
      className="rounded-2xl border border-accent bg-card p-4 shadow-soft"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/40 text-secondary">
          <Trophy className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Graduation Day · real prizes</p>
          <h2 className="text-lg font-bold leading-tight text-secondary">
            This week's Weekly Challenge
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Play it right here in Graduation Day. Sign in with your Graduation Day email to get on
            the leaderboard for this week's prizes at each PAWtastic location.
          </p>
        </div>
      </div>
      <Link
        to="/graduation"
        onClick={() => track("graduation_weekly_open", { from })}
        className="mt-3 flex min-h-11 items-center justify-center gap-1 rounded-xl bg-primary px-4 font-display font-bold text-primary-foreground"
      >
        Play the Weekly Challenge
      </Link>
    </section>
  );
}
