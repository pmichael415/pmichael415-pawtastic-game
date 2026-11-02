// Daycare Tycoon, new engine (preview): build your own daycare from an empty lot. Separate save from today's game.
import { createFileRoute, Link } from "@tanstack/react-router";
import { GameHeader } from "@/components/game/GameHeader";
import { TycoonPlay } from "@/components/tycoon/TycoonPlay";
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
  const { state } = useTycoon();
  const f = state ? fac(state) : null;
  return (
    <main className="space-y-3 px-3 pt-3 pb-8">
      <GameHeader title="Daycare (preview)" sound {...(f ? { subtitle: `${f.name} · rep ${Math.round(f.reputation)}` } : {})} />
      <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
        A brand-new daycare you build from scratch. It's a separate save — your{" "}
        <Link to="/daycare" className="font-semibold underline">
          current daycare
        </Link>{" "}
        isn't changed. Game coins only; the layout is fictional.
      </p>
      <TycoonPlay />
    </main>
  );
}
