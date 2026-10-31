import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, ExternalLink, Gamepad2, MapPin, Share2, ShoppingBag, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACHIEVEMENTS, FREE_COSMETICS, daycareScore, dailyMissions, fmtClock, lobbyDogs, missionProgress, recessCoinsLeft, type GameState } from "@/game/engine";
import { peekSave, todayKey } from "@/game/store";
import { GameHeader } from "@/components/game/GameHeader";
import { useSession } from "@/lib/auth";
import { shareCard } from "@/game/share";
import { LOGO_URL } from "@/game/sprites";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PAWtastic Games — Daycare Tycoon & Recess Rush" },
      { name: "description", content: "Free dog games from PAWtastic Academy: run your own 3D dog daycare and race through Recess Rush. One profile, shared bandanas and achievements." },
      { property: "og:title", content: "PAWtastic Games" },
      { property: "og:description", content: "Run a 3D dog daycare and race Recess Rush. Free to play." },
    ],
  }),
  component: Hub,
});

function Hub() {
  const [s, setS] = useState<GameState | null>(null);
  const { user } = useSession();
  useEffect(() => { setS(peekSave()); track("hub_open", {}); }, []);
  if (!s) return <div className="grid min-h-dvh place-items-center font-display text-2xl text-primary">Loading PAWtastic Games…</div>;
  const name = (user?.user_metadata?.["display_name"] as string | undefined) || (user ? "Player" : "Guest");
  const started = s.stats.admitted > 0 || s.dogs.length > 0;
  const waiting = lobbyDogs(s, s.site).filter((d) => !d.checkedIn).length;
  const missions = dailyMissions(todayKey());
  const doneMissions = missions.filter((m) => missionProgress(s, m) >= m.target).length;
  const earned = FREE_COSMETICS.filter((c) => s.cosmetics.includes(c.id));

  const invite = async () => {
    const link = `${window.location.origin}/?utm_source=game_invite&utm_medium=share&utm_campaign=pawtastic_games`;
    const res = await shareCard(
      { title: "Come play PAWtastic Games", big: "🐾", lines: ["Run a dog daycare & race Recess Rush", "Free to play · no download"], link, logoUrl: LOGO_URL },
      "🐾 I'm running a dog daycare in PAWtastic Games — free to play. Come build yours:",
    );
    track("share", { kind: "invite", result: res });
    if (res === "copied" || res === "downloaded") toast.success("Invite link copied!");
  };

  return (
    <main className="space-y-3 px-3 pt-3 pb-6">
      <GameHeader title="PAWtastic Games" subtitle={`Hi, ${name}`} back={false} />

      <section className="rounded-3xl bg-brand-gradient p-4 text-primary-foreground shadow-pop">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide opacity-90"><Building2 className="h-4 w-4" /> Main game</div>
        <h2 className="mt-1 font-display text-2xl font-bold">Daycare Tycoon</h2>
        <p className="text-sm font-bold opacity-90">
          {started ? `Day ${s.gameDay} · ${fmtClock(s.clockMin)} · ${s.dogs.length} pups on site${waiting ? ` · ${waiting} waiting for check-in` : ""}` : "Check pups in, match playrooms by size & temperament, walk your daycare in 3D."}
        </p>
        <Button asChild size="lg" variant="secondary" className="mt-3 h-14 w-full bg-card font-display text-lg text-secondary">
          <Link to="/daycare">{started ? "Continue your daycare" : "Open your daycare"} <ArrowRight /></Link>
        </Button>
      </section>

      <section className="rounded-3xl bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-primary"><Gamepad2 className="h-4 w-4" /> Arcade</div>
            <h2 className="font-display text-xl font-bold text-secondary">Recess Rush</h2>
          </div>
          <div className="text-right text-xs font-extrabold text-muted-foreground">Best (this device)<div className="font-display text-2xl text-secondary">{s.recessBest}</div></div>
        </div>
        <p className="text-sm font-bold text-muted-foreground">60-second runner. Earn up to {recessCoinsLeft(s, todayKey())} more daycare coins today and unlock free bandanas.</p>
        <Button asChild size="lg" className="mt-3 h-12 w-full font-display text-base"><Link to="/recess">Play today's course <ArrowRight /></Link></Button>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center" aria-label="Your profile">
        <div className="rounded-2xl bg-card p-2 shadow-soft"><div className="font-display text-xl font-bold text-secondary">{s.coins}</div><div className="text-[11px] font-extrabold text-muted-foreground">game coins</div></div>
        <div className="rounded-2xl bg-card p-2 shadow-soft"><div className="font-display text-xl font-bold text-secondary">{s.achievements.length}/{ACHIEVEMENTS.length}</div><div className="text-[11px] font-extrabold text-muted-foreground">achievements</div></div>
        <div className="rounded-2xl bg-card p-2 shadow-soft"><div className="font-display text-xl font-bold text-secondary">{daycareScore(s)}</div><div className="text-[11px] font-extrabold text-muted-foreground">daycare score</div></div>
      </section>

      <section className="rounded-3xl bg-card p-4 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-secondary"><Trophy className="h-5 w-5 text-accent" /> Today</h2>
        <p className="text-sm font-bold text-muted-foreground">Daily missions: {doneMissions}/{missions.length} done. New missions every day at midnight (New York time) — nothing is lost if you skip a day.</p>
        <p className="mt-1 text-sm font-bold text-muted-foreground">Bandanas earned (shared by both games): {earned.length ? earned.map((c) => c.name).join(", ") : "none yet — score 150 in Recess Rush"}.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button asChild variant="secondary" className="h-11"><Link to="/shop"><ShoppingBag /> Style shop</Link></Button>
          <Button variant="outline" className="h-11" onClick={invite}><Share2 /> Invite a friend</Button>
        </div>
      </section>

      <section className="rounded-3xl border-2 border-primary bg-card p-4 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-secondary"><MapPin className="h-5 w-5 text-primary" /> Visit the real PAWtastic</h2>
        <p className="text-sm font-bold text-muted-foreground">Optional: book a free evaluation at Hawthorne or Hillsdale. The game is just for fun — coins and in-game items aren't connected to real services or rewards.</p>
        <Button asChild variant="outline" className="mt-2 h-11 w-full"><Link to="/visit">Choose a location</Link></Button>
      </section>

      <section className="rounded-3xl bg-card p-4 shadow-soft">
        <h2 className="font-display text-lg font-bold text-secondary">More PAWtastic games</h2>
        <p className="text-xs font-bold text-muted-foreground">Separate sites with their own progress.</p>
        <ul className="mt-2 grid gap-2">
          <li><a className="flex min-h-11 items-center justify-between rounded-xl bg-muted px-3 text-sm font-extrabold text-secondary" href="https://pawtastic-graduation.lovable.app" target="_blank" rel="noopener">Graduation Day (match-3) <ExternalLink className="h-4 w-4" /></a></li>
          <li><a className="flex min-h-11 items-center justify-between rounded-xl bg-muted px-3 text-sm font-extrabold text-secondary" href="https://pawtastic-recess-rush.minorclay.chatgpt.site" target="_blank" rel="noopener">Original Recess Rush <ExternalLink className="h-4 w-4" /></a></li>
        </ul>
      </section>

      <footer className="space-y-1 text-center text-[11px] font-bold text-muted-foreground">
        <p>Game coins are free virtual currency with no cash value. They can't become money, discounts or daycare credit.</p>
        <p><Link to="/help" className="underline">How to play · rules & privacy</Link></p>
      </footer>
    </main>
  );
}
