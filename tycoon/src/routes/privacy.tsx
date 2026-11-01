import { createFileRoute, Link } from "@tanstack/react-router";
import { GameHeader } from "@/components/game/GameHeader";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy | PAWtastic Games" },
      { name: "description", content: "What PAWtastic Games records, what it doesn't do, and your choices." },
    ],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <h2 className="font-display text-lg font-bold text-secondary">{title}</h2>
      <div className="mt-1 space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

/** The page text (owner-reviewed before publishing). Kept free of router hooks so it can be tested on its own. */
export function PrivacyContent({ heading = true }: { heading?: boolean }) {
  return (
    <div className="space-y-3">
      {heading && <h1 className="font-display text-2xl font-bold text-secondary">Privacy</h1>}
      <Section title="What we record">
        <ul className="list-disc space-y-1 pl-5">
          <li>A random device ID and game events (like starting a session, finishing a run or tapping a booking link), so we can see what players enjoy. These include which ad or link brought you here, if any.</li>
          <li>Your account email and your saved game progress, only if you sign in.</li>
          <li>Phone-notification subscriptions, only if you turn notifications on.</li>
          <li>Your email choices, only if you ask for email updates.</li>
          <li>If you buy a pack: which pack, its price and the payment reference. Stripe handles the payment; we never see your card number.</li>
        </ul>
      </Section>
      <Section title="What we don't do">
        <ul className="list-disc space-y-1 pl-5">
          <li>No ad trackers or pixels, and we never sell your information.</li>
          <li>We don't post anything for you or contact anyone for you.</li>
          <li>Game coins are game money only. They aren't cash, discounts or daycare credit.</li>
        </ul>
      </Section>
      <Section title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>Turn game stats and phone notifications off in Settings at any time.</li>
          <li>Every email has an unsubscribe link.</li>
          <li>
            To have your account and data deleted, email{" "}
            <a className="font-semibold underline" href="mailto:info@pawtasticacademy.com">info@pawtasticacademy.com</a>.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function PrivacyPage() {
  return (
    <main className="space-y-3 px-3 pt-3 pb-6">
      <GameHeader title="Privacy" subtitle="PAWtastic Games" />
      <PrivacyContent heading={false} />
      <p className="text-center text-sm font-bold">
        <Link to="/" className="underline">
          Back to PAWtastic Games
        </Link>
      </p>
    </main>
  );
}
