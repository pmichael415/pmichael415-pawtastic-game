import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Pause, Play, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyRun, checkAchievements, FREE_COSMETICS, mulberry, recessCoinsLeft, recessItemKind, recessSpawnInterval, seedFrom, RECESS_DAILY_COIN_CAP, RECESS_RUN_COIN_CAP } from "@/game/engine";
import { peekSave, todayKey, updateSave } from "@/game/store";
import { useEntitlements } from "@/lib/entitlements";
import { LOGO_URL } from "@/game/sprites";
import { shareCard } from "@/game/share";
import { GameHeader } from "@/components/game/GameHeader";
import { track } from "@/lib/analytics";
import { myReferralCode } from "@/lib/referral";
import { useShareContext } from "@/components/game/ShareSheet";

const search = z.object({
  seed: z.string().regex(/^[\w-]{1,32}$/).optional().catch(undefined),
  challenge: z.coerce.number().int().min(0).max(100000).optional().catch(undefined),
});

export const Route = createFileRoute("/recess")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Recess Rush — 60-Second Pup Runner | PAWtastic" },
      { name: "description", content: "Dash through three lanes, snag treats, dodge puddles and grab shield balls in this free 60-second PAWtastic runner." },
      { property: "og:title", content: "Recess Rush — 60-Second Pup Runner" },
      { property: "og:description", content: "Snag treats, dodge puddles. Can you beat today's challenge?" },
    ],
  }),
  component: Recess,
});

type Item = { lane: number; y: number; kind: "treat" | "puddle" | "shield" };
const W = 360, H = 560, DUR = 60;
const laneX = (l: number) => W / 6 + (l * W) / 3;

function Recess() {
  const { seed, challenge } = Route.useSearch();
  const runSeed = seed ?? todayKey();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"ready" | "run" | "paused" | "over">("ready");
  const [hud, setHud] = useState({ score: 0, time: DUR, lives: 3, shield: false });
  const [best, setBest] = useState(0);
  const [left, setLeft] = useState(RECESS_DAILY_COIN_CAP);
  const [result, setResult] = useState<string | null>(null);
  const shareRef = useRef<() => void>(() => {});
  const runShare = useCallback(() => shareRef.current(), []);
  useShareContext("recess", { label: "🏆 Share my Recess Rush challenge", run: runShare });
  const { visuals } = useEntitlements();
  const trailRef = useRef(false);
  trailRef.current = visuals["sparkle-trail"];
  const g = useRef({ lane: 1, items: [] as Item[], t: 0, spawn: 0, score: 0, lives: 3, shield: false, rand: mulberry(1), flash: 0 });

  useEffect(() => { const s = peekSave(); setBest(s.recessBest); setLeft(recessCoinsLeft(s, todayKey())); }, []);

  const start = () => {
    g.current = { lane: 1, items: [], t: 0, spawn: 0, score: 0, lives: 3, shield: false, rand: mulberry(seedFrom("recess-" + runSeed)), flash: 0 };
    setHud({ score: 0, time: DUR, lives: 3, shield: false });
    setPhase("run");
  };
  const move = (d: number) => { g.current.lane = Math.max(0, Math.min(2, g.current.lane + d)); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (phase !== "run") return;
      if (e.key === "ArrowLeft" || e.key === "a") move(-1);
      if (e.key === "ArrowRight" || e.key === "d") move(1);
      if (e.key === "p" || e.key === "Escape") setPhase("paused");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [phase]);

  const finish = (score: number) => {
    setPhase("over");
    let coins = 0, cos: string[] = [], capped = false, rejected: string | undefined;
    const day = todayKey();
    const s = updateSave((st) => {
      const r = applyRun(st, score, { seed: runSeed, day });
      coins = r.coins;
      capped = r.capped;
      rejected = r.rejected;
      cos = r.newCosmetics.map((c) => c.name);
      return checkAchievements(r.state).state;
    });
    setBest(s.recessBest);
    setLeft(recessCoinsLeft(s, day));
    track("recess_run", { score, coins, capped, rejected: !!rejected });
    const msg = rejected ?? (coins > 0 ? `+${coins} daycare coins${capped ? " (daily coin limit reached)" : ""}` : "Daily coin limit reached — runs still count for your best score and bandanas.");
    setResult(msg);
    if (rejected) toast.error(rejected); else toast.success(msg);
    cos.forEach((c) => toast.success(`🎀 Unlocked ${c} for your pups!`));
  };

  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0, last = performance.now();
    const ctx = canvas.current!.getContext("2d")!;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = g.current;
      st.t += dt;
      const speed = 220 + st.t * 4;
      st.spawn -= dt;
      if (st.spawn <= 0) {
        const kind = recessItemKind(st.rand());
        st.items.push({ lane: Math.floor(st.rand() * 3), y: -30, kind });
        st.spawn = recessSpawnInterval(st.t);
      }
      const dogY = H - 80;
      st.items = st.items.filter((it) => {
        it.y += speed * dt;
        if (it.lane === st.lane && Math.abs(it.y - dogY) < 30) {
          if (it.kind === "treat") st.score += 10;
          if (it.kind === "shield") st.shield = true;
          if (it.kind === "puddle") {
            if (st.shield) st.shield = false;
            else { st.lives -= 1; st.flash = 0.4; }
          }
          return false;
        }
        return it.y < H + 40;
      });
      st.score += dt * 2;
      st.flash = Math.max(0, st.flash - dt);
      // draw
      ctx.fillStyle = "#e9f3ff"; ctx.fillRect(0, 0, W, H);
      for (let l = 0; l < 3; l++) { ctx.fillStyle = l % 2 ? "#d6e8fb" : "#e2effd"; ctx.fillRect((l * W) / 3, 0, W / 3, H); }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4; ctx.setLineDash([24, 20]); ctx.lineDashOffset = -st.t * speed;
      [W / 3, (2 * W) / 3].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); });
      ctx.setLineDash([]);
      ctx.font = "34px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      st.items.forEach((it) => {
        if (it.kind === "puddle") { ctx.fillStyle = "#6aa7e0"; ctx.beginPath(); ctx.ellipse(laneX(it.lane), it.y, 34, 14, 0, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillText(it.kind === "treat" ? "🦴" : "🔵", laneX(it.lane), it.y);
      });
      const dx = laneX(st.lane);
      if (st.shield) { ctx.strokeStyle = "#0057A7"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(dx, dogY, 34, 0, Math.PI * 2); ctx.stroke(); }
      if (trailRef.current) { ctx.font = "20px sans-serif"; for (let k = 1; k <= 3; k++) { ctx.globalAlpha = 0.8 - k * 0.2; ctx.fillText("✨", dx + Math.sin(st.t * 10 + k) * 8, dogY + 26 + k * 16); } ctx.globalAlpha = 1; }
      ctx.font = "48px sans-serif"; ctx.globalAlpha = st.flash > 0 ? 0.4 : 1;
      ctx.save(); ctx.translate(dx, dogY + Math.sin(st.t * 18) * 3); ctx.scale(-1, 1); ctx.fillText("🐕", 0, 0); ctx.restore();
      ctx.globalAlpha = 1;
      const left = Math.max(0, DUR - st.t);
      setHud({ score: Math.floor(st.score), time: Math.ceil(left), lives: st.lives, shield: st.shield });
      if (left <= 0 || st.lives <= 0) { finish(Math.floor(st.score)); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // swipe
  const touch = useRef<number | null>(null);
  const onDown = (e: React.PointerEvent) => { touch.current = e.clientX; };
  const onUp = (e: React.PointerEvent) => {
    if (touch.current == null || phase !== "run") return;
    const dx = e.clientX - touch.current;
    if (Math.abs(dx) > 25) move(dx > 0 ? 1 : -1);
    else { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); move(e.clientX - r.left < r.width / 2 ? -1 : 1); }
    touch.current = null;
  };

  const share = async () => {
    const link = `${window.location.origin}/recess?seed=${runSeed}&challenge=${hud.score}&ref=${myReferralCode()}&utm_source=game_share&utm_medium=share&utm_campaign=recess_rush`;
    const res = await shareCard(
      { title: "Recess Rush Score", big: String(hud.score), lines: [hud.score >= (challenge ?? Infinity) ? "Challenge crushed! 🏆" : "Zoomies unlocked 🐾", `Run code: ${runSeed}`], link, logoUrl: LOGO_URL },
      `🐶 I scored ${hud.score} in PAWtastic Recess Rush! Same course, your turn:`,
    );
    if (res === "shared" || res === "downloaded" || res === "copied") updateSave((s) => ({ ...s, stats: { ...s.stats, shares: s.stats.shares + 1 } }));
    if (res === "downloaded") toast.success("Card downloaded & challenge link copied!");
    if (res === "copied") toast.success("Challenge link copied!");
  };

  shareRef.current = share;

  return (
    <main className="px-3 pt-3">
      <GameHeader title="Recess Rush" subtitle={`${seed ? `Challenge “${seed}”` : "Today's course"} · best ${best}`}>
        {phase === "run" && <Button size="icon" variant="secondary" className="h-11 w-11" aria-label="Pause" onClick={() => setPhase("paused")}><Pause /></Button>}
      </GameHeader>
      {challenge != null && <p className="mt-2 rounded-2xl bg-accent p-2 text-center text-sm font-extrabold text-accent-foreground">A friend challenged you to beat {challenge}!</p>}

      <div className="mt-2 flex justify-between rounded-2xl bg-card px-4 py-2 font-display text-lg font-bold text-secondary shadow-soft">
        <span>🦴 {hud.score}</span><span>⏱ {hud.time}s</span><span>{"❤️".repeat(Math.max(0, hud.lives))}{hud.shield ? " 🔵" : ""}</span>
      </div>

      <div className="relative mt-2 touch-none select-none overflow-hidden rounded-3xl border-4 border-secondary shadow-pop" onPointerDown={onDown} onPointerUp={onUp}>
        <canvas ref={canvas} width={W} height={H} className="block aspect-[9/14] w-full bg-sky" aria-label="Recess Rush play field" />
        {phase !== "run" && (
          <div className="absolute inset-0 grid place-items-center bg-secondary/70 p-6 text-center">
            <div className="rounded-3xl bg-card p-5 shadow-soft">
              {phase === "ready" && (<>
                <h2 className="font-display text-2xl font-bold text-secondary">60 seconds of zoomies!</h2>
                <p className="mt-2 text-sm font-bold text-muted-foreground">Swipe or tap left/right. 🦴 treats +10 · puddles cost a heart · 🔵 shield ball blocks one puddle.</p>
                <Button size="lg" className="mt-4 h-14 w-full font-display text-lg" onClick={start}><Play /> Start run</Button>
              </>)}
              {phase === "paused" && <Button size="lg" className="h-14 font-display text-lg" onClick={() => setPhase("run")}><Play /> Resume</Button>}
              {phase === "over" && (<>
                <h2 className="font-display text-3xl font-bold text-primary">{hud.score} pts</h2>
                <p className="text-sm font-bold text-muted-foreground">Best on this device: {best}</p>
                {result && <p className="mt-1 text-sm font-extrabold text-secondary">{result}</p>}
                <div className="mt-4 grid gap-2">
                  <Button size="lg" onClick={start}><Play /> Run again</Button>
                  <Button size="lg" variant="secondary" onClick={share}><Share2 /> Share & challenge</Button>
                  <Button size="lg" variant="outline" asChild><Link to="/daycare">Back to my daycare</Link></Button>
                  <Button size="lg" variant="ghost" asChild><Link to="/">PAWtastic Games home</Link></Button>
                </div>
              </>)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="lg" variant="secondary" className="h-16" aria-label="Move left" onPointerDown={(e) => { e.stopPropagation(); move(-1); }}><ChevronLeft className="!size-9" /></Button>
        <Button size="lg" variant="secondary" className="h-16" aria-label="Move right" onPointerDown={(e) => { e.stopPropagation(); move(1); }}><ChevronRight className="!size-9" /></Button>
      </div>

      <section className="mt-4 rounded-2xl bg-card p-3 shadow-soft">
        <h2 className="font-display font-bold text-secondary">Free bandanas (shared with Tycoon)</h2>
        <ul className="mt-1 text-sm font-bold text-muted-foreground">
          {FREE_COSMETICS.filter((c) => Number.isFinite(c.unlockScore)).map((c) => <li key={c.id}>{best >= c.unlockScore ? "✅" : "🔒"} {c.name} — score {c.unlockScore}</li>)}
        </ul>
        <p className="mt-2 text-[11px] font-bold text-muted-foreground">Each run gives up to {RECESS_RUN_COIN_CAP} daycare coins, up to {RECESS_DAILY_COIN_CAP} a day ({left} left today). Scores the course can't produce aren't counted. Scores stay on this device — there's no public leaderboard.</p>
      </section>
    </main>
  );
}
