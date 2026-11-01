import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GameHeader } from "@/components/game/GameHeader";
import { GraduationWeeklyCard } from "@/components/game/GraduationWeeklyCard";
import {
  readGraduationFromStorage,
  GRADUATION_LEVELS,
  GRADUATION_SAVE_KEY,
  type GraduationProgress,
} from "@/lib/graduation";
import { syncGraduation } from "@/game/linkSync";
import { useShareContext } from "@/components/game/ShareSheet";

export const Route = createFileRoute("/graduation")({
  head: () => ({
    meta: [
      { title: "Graduation Day — PAWtastic Games" },
      {
        name: "description",
        content:
          "Match-3 puzzles through Orientation, Recess Yard, the Spa, the Dorms and Graduation — part of PAWtastic Games.",
      },
    ],
  }),
  component: Graduation,
});

function Graduation() {
  const [p, setP] = useState<GraduationProgress | null>(null);
  useShareContext("graduation", null);
  useEffect(() => {
    const refresh = () => {
      setP(readGraduationFromStorage());
      const r = syncGraduation();
      r.newCosmetics.forEach((c) => toast.success(`🎓 ${c.name} unlocked for your daycare pups!`));
      r.newAchievements.forEach((a) => toast.success(`🏆 ${a}`));
    };
    refresh();
    // Graduation Day runs in a same-site frame; its saves fire storage events here.
    const onStorage = (e: StorageEvent) => {
      if (e.key === GRADUATION_SAVE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    const t = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, []);
  const sub =
    p && p.cleared
      ? `Level ${Math.min(GRADUATION_LEVELS, p.highest + 1)} · ${p.stars}★`
      : "Match-3";
  return (
    <main
      className="flex flex-col px-3 pt-3"
      style={{ height: "calc(100svh - 4rem - env(safe-area-inset-bottom))" }}
    >
      <GameHeader title="Graduation Day" subtitle={sub} />
      {!import.meta.env["VITE_REVIEW_BUILD"] && <GraduationWeeklyCard from="graduation" slim />}
      <p className="mt-1.5 px-1 text-[11px] font-medium text-muted-foreground">
        Free play here. Treats stay in Graduation Day; achievements and bandanas are shared with
        your daycare.
      </p>
      {import.meta.env["VITE_REVIEW_BUILD"] ? (
        <div className="mt-2 rounded-2xl border border-border bg-card p-5 text-center shadow-soft">
          <p className="font-display text-lg font-bold text-secondary">
            Graduation Day plays right here in the full game.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This private preview leaves it out. You can try it on its own site:
          </p>
          <a
            className="mt-3 inline-grid min-h-11 place-items-center rounded-xl bg-primary px-4 font-display font-bold text-primary-foreground"
            href="https://pawtastic-graduation.lovable.app"
            target="_blank"
            rel="noopener"
          >
            Open Graduation Day
          </a>
        </div>
      ) : (
        <iframe
          title="Graduation Day match-3 game"
          src={`${import.meta.env.BASE_URL}graduation/index.html`}
          allow="autoplay; fullscreen"
          className="mt-1.5 w-full flex-1 rounded-2xl border border-border bg-card shadow-soft"
        />
      )}
    </main>
  );
}
