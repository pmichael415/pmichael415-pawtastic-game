// Daycare Tycoon, new engine (preview): build your own daycare from an empty lot. Separate save from today's game.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { GameHeader } from "@/components/game/GameHeader";
import { GuideCard } from "@/components/tycoon/GuideCard";
import { ListView } from "@/components/tycoon/ListView";
import { RunHud } from "@/components/tycoon/RunHud";
import { fac } from "@/tycoon/state";
import { useTycoon } from "@/tycoon/store";

export const Route = createFileRoute("/daycare-next")({
  head: () => ({
    meta: [
      { title: "Build Your Own Dog Daycare (Preview) | PAWtastic Games" },
      {
        name: "description",
        content: "Preview of the new PAWtastic Daycare Tycoon: start from an empty lot, build rooms, paths and play yards, set prices and grow your daycare. Free to play.",
      },
      { property: "og:title", content: "Build Your Own Dog Daycare — PAWtastic Games (Preview)" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DaycareNext,
});

function DaycareNext() {
  const { state, act, set, paused, setPaused } = useTycoon();
  if (!state)
    return (
      <main className="grid min-h-[60svh] place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading your daycare" />
      </main>
    );
  const f = fac(state);
  return (
    <main className="space-y-3 px-3 pt-3 pb-8">
      <GameHeader title="Daycare (preview)" subtitle={`${f.name} · rep ${Math.round(f.reputation)}`} />
      <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
        A brand-new daycare you build from scratch. It's a separate save — your{" "}
        <Link to="/daycare" className="font-semibold underline">
          current daycare
        </Link>{" "}
        isn't changed. Game coins only; the layout is fictional.
      </p>
      <RunHud state={state} act={act} paused={paused} setPaused={setPaused} />
      <GuideCard state={state} act={act} set={set} />
      <ListView state={state} act={act} />
    </main>
  );
}
