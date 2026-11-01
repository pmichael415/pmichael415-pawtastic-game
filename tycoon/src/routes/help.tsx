import { createFileRoute, Link } from "@tanstack/react-router";
import { GameHeader } from "@/components/game/GameHeader";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "How to play · Rules & privacy | PAWtastic Games" },
      {
        name: "description",
        content:
          "How to play PAWtastic Daycare Tycoon and Recess Rush, plus game rules and privacy.",
      },
    ],
  }),
  component: Help,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <h2 className="font-display text-lg font-bold text-secondary">{title}</h2>
      <div className="mt-1 space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function Help() {
  return (
    <main className="space-y-3 px-3 pt-3 pb-6">
      <GameHeader title="How to play" subtitle="Rules & privacy" />
      <Section title="Daycare Tycoon: the daily flow">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <b>Arrival</b> — customers drop pups off in the lobby on their own (or take a walk-in).
          </li>
          <li>
            <b>Check in</b> — tap “Check in” beside the pup at the front desk. The fee is paid once.
          </li>
          <li>
            <b>Review traits</b> — every pup shows size (small/large) and temperament
            (gentle/active).
          </li>
          <li>
            <b>Assign a room</b> — playrooms are grouped by BOTH size and temperament. Green ✓ rooms
            are a safe match. Overnight boarders get their own private suite.
          </li>
          <li>
            <b>Care</b> — play, baths, a clean floor and rested staff keep pups happy.
          </li>
          <li>
            <b>Checkout</b> — happier pups pay more; add an exit bath for extra sparkle.
          </li>
        </ol>
        <p>
          The game clock runs faster than real time. Each game day, new drop-offs pause from 12:00
          to 14:00 — staff keep caring for (and checking in) pups already inside, and drop-offs
          resume at 14:00.
        </p>
      </Section>
      <Section title="Keeping rooms calm">
        <p>
          Placing a pup in a room that doesn't match its size or temperament asks you to confirm
          first. Mixed rooms show warning signs and may have a cartoon scuffle — a game risk, never
          based on breed.
        </p>
        <p>
          Tap “Separate dogs” to move the mismatched pup to the staff-only recovery room. Separating
          is free and always works — even when the lobby is closed or full or staff are tired.
          Scuffles never earn coins and cost a little happiness and reputation; matching rooms
          prevents them.
        </p>
      </Section>
      <Section title="Cameras & controls">
        <p>
          <b>Overhead:</b> drag to pan, pinch or use + / − to zoom, tap a pup or room. Use the area
          buttons to jump around.
        </p>
        <p>
          <b>Walk (first person):</b> use the stick to walk and drag the view to look. Face a pup, a
          room sign or the front desk and tap the big button. Desktop: W A S D to move, arrow keys
          or Q/E to turn, drag with the mouse to look.
        </p>
        <p>
          <b>List view:</b> every action is also available in the lists below the 3D view — handy
          for screen readers and older devices.
        </p>
      </Section>
      <Section title="Recess Rush">
        <p>
          A 60-second three-lane runner: swipe or tap left/right, collect 🦴 treats, avoid puddles,
          grab 🔵 shield balls. Each run gives up to 120 daycare coins, with a daily limit of 300 so
          the arcade stays a bonus. Scores the course can't produce aren't counted. Scores are
          stored on this device and there is no public leaderboard.
        </p>
      </Section>
      <Section title="Coins, purchases & fairness">
        <p>
          Game coins are free virtual currency. They have no cash value and can't become money,
          discounts, daycare credit or PAWtastic customer rewards.
        </p>
        <p>
          Everything needed to care for pups and grow your daycare is free. Optional cosmetic packs
          change looks only. You're never charged for safety, and nothing is lost if you skip a day
          — when you're away, the clock stops and pups are safe.
        </p>
      </Section>
      <Section title="Privacy">
        <p>
          Guest progress is saved in this browser. If you sign in, your progress also syncs to your
          account. Anonymous gameplay stats (a random device id, no name, email or location) help us
          improve the game — you can switch them off in Settings.
        </p>
        <p>
          The game doesn't post to social media or contact anyone for you. Sharing only happens when
          you tap Share.
        </p>
        <p>
          Room layouts are fictional and simplified for play — not floor plans or facility rules of
          PAWtastic Hawthorne or Hillsdale.
        </p>
      </Section>
      <p className="text-center text-sm font-bold">
        <Link to="/" className="underline">
          Back to PAWtastic Games
        </Link>
      </p>
    </main>
  );
}
