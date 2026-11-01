import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, CalendarCheck, Cloud, CloudOff, ExternalLink, Gamepad2, GraduationCap, MapPin, Share2, ShoppingBag, Smartphone, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACHIEVEMENTS, FREE_COSMETICS, REFERRAL_COINS_EACH, REFERRAL_MAX_REWARDED, daycareScore, dailyMissions, fmtClock, lobbyDogs, missionProgress, nextGoal, recessCoinsLeft, weekKey, type GameState } from "@/game/engine";
import { peekSave, todayKey } from "@/game/store";
import { GameHeader } from "@/components/game/GameHeader";
import { GraduationWeeklyCard } from "@/components/game/GraduationWeeklyCard";
import { peekTycoon } from "@/tycoon/store";
import { goalFor, rollWeekly, weeklyStatus, type WeeklyStatus } from "@/tycoon/weekly";
import { openShare } from "@/components/game/ShareSheet";
import { TeamCard } from "@/components/game/TeamCard";
import { maybeAskForTeam } from "@/components/game/TeamPicker";
import { useSession } from "@/lib/auth";
import { shareCard } from "@/game/share";
import { LOGO_URL, SITTING_DOG_LOGO_URL } from "@/game/sprites";
import { track } from "@/lib/analytics";
import { CUSTOMER_APP_URL, LOCATIONS, bookingUrl } from "@/lib/locations";
import { referredBy } from "@/lib/referral";
import { GRADUATION_LEVELS, readGraduationFromStorage, type GraduationProgress } from "@/lib/graduation";
import { syncGraduation } from "@/game/linkSync";
import { overall, useStatuses } from "@/game/cloud";

/** This week's goal in the new Daycare (progress 0 for a new player or a new week). */
function tycoonWeekly(): WeeklyStatus {
  const wk = weekKey();
  const saved = peekTycoon();
  const st = saved ? weeklyStatus(rollWeekly(saved, wk).state) : null;
  const goal = goalFor(wk, 1);
  return st ?? { goal, progress: 0, target: goal.target, done: false, claimed: false };
}

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
  const [g, setG] = useState<GraduationProgress | null>(null);
  const [tw, setTw] = useState<WeeklyStatus | null>(null);
  useEffect(() => {
    const r = syncGraduation(); // Graduation Day milestones → shared achievements & bandanas
    r.newCosmetics.forEach((c) => toast.success(`🎓 ${c.name} unlocked for your daycare pups!`));
    setS(peekSave());
    setG(readGraduationFromStorage());
    setTw(tycoonWeekly());
    track("hub_open", {});
    maybeAskForTeam();
  }, []);
  if (!s)
    return (
      <div className="grid min-h-dvh place-items-center bg-card">
        <div className="text-center">
          <img src={SITTING_DOG_LOGO_URL} alt="PAWtastic Academy" width={496} height={640} className="mx-auto h-60 w-auto" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Loading PAWtastic Games…</p>
        </div>
      </div>
    );
  const name = (user?.user_metadata?.["display_name"] as string | undefined) || (user ? "Player" : "Guest");
  const started = s.stats.admitted > 0 || s.dogs.length > 0;
  const waiting = lobbyDogs(s, s.site).filter((d) => !d.checkedIn).length;
  const missions = dailyMissions(todayKey());
  const doneMissions = missions.filter((m) => missionProgress(s, m) >= m.target).length;
  const earned = FREE_COSMETICS.filter((c) => s.cosmetics.includes(c.id));
  const myLocation = LOCATIONS.find((l) => l.id === s.team) ?? null;



  return (
    <main className="space-y-3 px-3 pt-3 pb-6">
      <GameHeader title="PAWtastic Games" subtitle={`Hi, ${name}`} back={false} />

      <section aria-label="PAWtastic Academy" className="rounded-2xl border border-border bg-card px-4 pt-4 pb-3 text-center shadow-soft">
        <img src={SITTING_DOG_LOGO_URL} alt="PAWtastic Academy: daycare, boarding and baths" width={496} height={640} className="mx-auto h-44 w-auto" />
        <p className="mt-2 text-sm text-muted-foreground">Free dog games from PAWtastic Academy in Hillsdale and Hawthorne, NJ.</p>
      </section>

      <GameCard
        icon={Building2}
        eyebrow="Main game"
        title="Daycare Tycoon"
        text={started ? `Day ${s.gameDay} · ${fmtClock(s.clockMin)} · ${s.dogs.length} pups on site${waiting ? ` · ${waiting} waiting for check-in` : ""}` : "Check pups in, match playrooms by size & temperament, walk your daycare in 3D."}
        to="/daycare"
        cta={started ? "Continue your daycare" : "Open your daycare"}
      />
      <Link to="/daycare-next" className="-mt-1 flex min-h-11 flex-col items-center justify-center rounded-xl px-4 py-1 text-center text-sm font-semibold text-primary underline-offset-2 hover:underline">
        <span>Try the new Daycare (preview): build your own from an empty lot →</span>
        {tw && (
          <span className="text-[11px] font-medium text-muted-foreground">
            This week: {tw.goal.label} · {tw.progress}/{tw.target} · +{tw.goal.reward} coins
          </span>
        )}
      </Link>
      <GameCard
        icon={Gamepad2}
        eyebrow="Arcade"
        title="Recess Rush"
        statLabel="Best (this device)"
        stat={String(s.recessBest)}
        text={`60-second runner. Earn up to ${recessCoinsLeft(s, todayKey())} more daycare coins today and unlock free bandanas.`}
        to="/recess"
        cta="Play today's course"
      />
      <GameCard
        icon={GraduationCap}
        eyebrow="Puzzle"
        title="Graduation Day"
        statLabel="Levels cleared"
        stat={`${g?.cleared ?? 0}/${GRADUATION_LEVELS}`}
        text={`${g && g.cleared ? `${g.dogName ? `${g.dogName} is` : "Your pup is"} on level ${Math.min(GRADUATION_LEVELS, g.highest + 1)} · ${g.stars}★. ` : "Match-3 from Orientation to Graduation. "}Finish Orientation and graduate to unlock bandanas for your daycare pups.`}
        to="/graduation"
        cta={g && g.cleared ? "Continue Graduation Day" : "Play Graduation Day"}
      />
      <GraduationWeeklyCard from="home" />

      <CloudCard signedIn={!!user} />

      <TeamCard />

      <section aria-label="Invite friends" className="flex items-center gap-3 rounded-2xl border border-accent bg-card p-4 shadow-soft">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-secondary">Invite friends 🐾</h2>
          <p className="text-xs text-muted-foreground">Share your personal link. Each friend who finishes their first day earns you +{REFERRAL_COINS_EACH} daycare coins (up to {REFERRAL_MAX_REWARDED}) and the Best Buddy Bandana.</p>
        </div>
        <Button className="h-12 shrink-0 font-display" onClick={openShare}><Share2 /> Share</Button>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center" aria-label="Your profile">
        <div className="rounded-xl border border-border bg-card p-2 shadow-soft"><div className="font-display text-xl font-bold text-secondary">{s.coins}</div><div className="text-[11px] font-medium text-muted-foreground">game coins</div></div>
        <div className="rounded-xl border border-border bg-card p-2 shadow-soft"><div className="font-display text-xl font-bold text-secondary">{s.achievements.length}/{ACHIEVEMENTS.length}</div><div className="text-[11px] font-medium text-muted-foreground">achievements</div></div>
        <div className="rounded-xl border border-border bg-card p-2 shadow-soft"><div className="font-display text-xl font-bold text-secondary">{daycareScore(s)}</div><div className="text-[11px] font-medium text-muted-foreground">daycare score</div></div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-secondary"><Trophy className="h-5 w-5 text-accent" /> Today</h2>
        <p className="text-sm font-bold text-secondary">🎯 Next goal: {nextGoal(s).label} <span className="text-muted-foreground">· {nextGoal(s).detail}</span></p>
        <p className="text-sm text-muted-foreground">Daily missions: {doneMissions}/{missions.length} done. New missions every day at midnight (New York time) — nothing is lost if you skip a day.</p>
        <p className="mt-1 text-sm text-muted-foreground">Bandanas earned (shared across all three games): {earned.length ? earned.map((c) => c.name).join(", ") : "none yet — score 150 in Recess Rush"}.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button asChild variant="secondary" className="h-11"><Link to="/shop"><ShoppingBag /> Style shop</Link></Button>
          <Button asChild variant="outline" className="h-11"><Link to="/account">Account & saves</Link></Button>
          <Button variant="outline" className="h-11" onClick={openShare}><Share2 /> Invite a friend</Button>
        </div>
      </section>

      <section aria-label="Visit the real PAWtastic" className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <p className="eyebrow">PAWtastic Academy</p>
        <h2 className="text-lg font-bold text-secondary">Visit the real PAWtastic</h2>
        <p className="text-sm text-muted-foreground">Daycare, boarding, baths and exit baths in Hawthorne and Hillsdale. The game is just for fun: coins and items aren't connected to real services or rewards.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Link to="/visit" className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-2 text-center text-xs font-medium text-secondary hover:bg-muted">
            <MapPin className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden /> Visit us
          </Link>
          {myLocation ? (
            <a href={bookingUrl(myLocation)} target="_blank" rel="noopener noreferrer" onClick={() => { const ref = referredBy(); track("booking_click", { location: myLocation.id, from: "home", ...(ref ? { ref } : {}) }); }} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl bg-primary p-2 text-center text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <CalendarCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden /> Book an eval
            </a>
          ) : (
            <Link to="/visit" className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl bg-primary p-2 text-center text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <CalendarCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden /> Book an eval
            </Link>
          )}
          <a href={CUSTOMER_APP_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("app_click", { from: "home" })} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-2 text-center text-xs font-medium text-secondary hover:bg-muted">
            <Smartphone className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden /> Get the app
          </a>
        </div>
        {myLocation && <p className="mt-2 text-[11px] font-medium text-muted-foreground">"Book an eval" opens the {myLocation.name} form (your team). Both locations are on Visit us.</p>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <h2 className="font-display text-lg font-bold text-secondary">Also from PAWtastic</h2>
        <p className="text-xs text-muted-foreground">A separate site with its own scores.</p>
        <ul className="mt-2 grid gap-2">
          <li><a className="flex min-h-11 items-center justify-between rounded-xl bg-muted px-3 text-sm font-bold text-secondary" href="https://pawtastic-recess-rush.minorclay.chatgpt.site" target="_blank" rel="noopener">Original Recess Rush <ExternalLink className="h-4 w-4" /></a></li>
        </ul>
      </section>

      <footer className="space-y-1 text-center text-[11px] font-medium text-muted-foreground">
        <p>Game coins are free virtual currency with no cash value. They can't become money, discounts or daycare credit.</p>
        <p><Link to="/help" className="underline">How to play · rules & privacy</Link></p>
      </footer>
    </main>
  );
}

/** One game on the home page, in Graduation Day's card style. */
function GameCard({ icon: Icon, eyebrow, title, text, to, cta, stat, statLabel }: {
  icon: typeof Building2;
  eyebrow: string;
  title: string;
  text: string;
  to: "/daycare" | "/recess" | "/graduation";
  cta: string;
  stat?: string;
  statLabel?: string;
}) {
  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="text-xl font-bold leading-tight text-secondary">{title}</h2>
        </div>
        {stat && (
          <div className="text-right">
            <p className="text-[11px] font-medium text-muted-foreground">{statLabel}</p>
            <p className="text-xl font-bold leading-tight text-secondary">{stat}</p>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <Button asChild size="lg" className="mt-3 h-12 w-full text-base">
        <Link to={to}>{cta} <ArrowRight /></Link>
      </Button>
    </section>
  );
}

/** Sign in to save each game's progress to your account (or, once signed in, the save status). */
function CloudCard({ signedIn }: { signedIn: boolean }) {
  const kind = overall(useStatuses());
  const choose = signedIn && kind === "conflict";
  return (
    <section aria-label="Cloud saves" className={`flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft ${choose ? "border-accent" : "border-border"}`}>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        {signedIn ? <Cloud className="h-6 w-6" strokeWidth={1.75} aria-hidden /> : <CloudOff className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold leading-tight text-secondary">
          {!signedIn ? "Save your progress" : choose ? "Choose which progress to keep" : "Your progress is saved"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {!signedIn
            ? "Sign in to keep Daycare Tycoon, Recess Rush and Graduation Day on every phone."
            : choose
              ? "A game has different progress here and in your account."
              : "Each game saves to your account automatically."}
        </p>
      </div>
      <Button asChild className="h-11 shrink-0" variant={signedIn && !choose ? "secondary" : "default"}>
        <Link to="/account">{!signedIn ? "Sign in" : choose ? "Choose" : "Manage"}</Link>
      </Button>
    </section>
  );
}
