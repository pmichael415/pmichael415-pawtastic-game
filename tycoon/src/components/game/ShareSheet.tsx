// One Share sheet for every PAWtastic screen: invite friends (personal referral link), share what you're
// doing on this screen, or recommend the real PAWtastic Academy (free evaluation form). Nothing is posted
// automatically — the player picks where to share. No discounts or real-world rewards are promised.
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Copy, Share2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  checkAchievements,
  claimReferrals,
  REFERRAL_COINS_EACH,
  REFERRAL_MAX_REWARDED,
} from "@/game/engine";
import { peekSave, updateSave } from "@/game/store";
import { shareCard } from "@/game/share";
import { LOGO_URL } from "@/game/sprites";
import { device, track } from "@/lib/analytics";
import { LOCATIONS, inviteLink, myReferralCode, recommendLink } from "@/lib/referral";

// ---------- tiny shared state: any button can open the sheet; a screen can add its own share action ----------
type Extra = { label: string; run: () => void } | null;
let state: { open: boolean; context: string; extra: Extra } = {
  open: false,
  context: "hub",
  extra: null,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER_STATE = state;
export function openShare() {
  state = { ...state, open: true };
  emit();
}
function closeShare() {
  state = { ...state, open: false };
  emit();
}
/** A screen registers what "share this" means there (e.g. the daycare card). */
export function useShareContext(context: string, extra: Extra) {
  const label = extra?.label;
  const run = extra?.run;
  useEffect(() => {
    state = { ...state, context, extra: label && run ? { label, run } : null };
    emit();
    return () => {
      state = { ...state, context: "hub", extra: null };
      emit();
    };
  }, [context, label, run]);
}

type Stats = { joined: number; completed: number } | "loading" | "unavailable";

export function ShareButton() {
  return (
    <button
      type="button"
      aria-label="Share and invite friends"
      onClick={openShare}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"
    >
      <Share2 className="h-5 w-5" />
    </button>
  );
}

export function ShareSheet() {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
  const [code, setCode] = useState("");
  const [stats, setStats] = useState<Stats>("loading");
  const [rewarded, setRewarded] = useState(0);
  const link = code ? inviteLink(window.location.origin, code, s.context) : "";
  const team = s.open ? peekSave().team : null;

  useEffect(() => {
    if (!s.open) return;
    const c = myReferralCode();
    setCode(c);
    setRewarded(peekSave().referralsRewarded ?? 0);
    setStats("loading");
    if (import.meta.env["VITE_REVIEW_BUILD"]) {
      setStats("unavailable"); // private review builds have no server
      return;
    }
    let cancelled = false;
    fetch(`/api/public/referrals?code=${c}&device=${encodeURIComponent(device().id)}`, {
      headers: { accept: "application/json" },
    })
      .then(async (r) => {
        const body = r.ok ? ((await r.json()) as { joined?: unknown; completed?: unknown }) : null;
        if (cancelled) return;
        if (!body || typeof body.joined !== "number" || typeof body.completed !== "number")
          return setStats("unavailable");
        setStats({ joined: body.joined, completed: body.completed });
        let gained = 0;
        const next = updateSave((g) => {
          const r2 = claimReferrals(g, body.completed as number);
          gained = r2.coins;
          return checkAchievements(r2.state).state;
        });
        setRewarded(next.referralsRewarded);
        if (gained)
          toast.success(
            `🐾 Friends finished their first day! +${gained} daycare coins & the Best Buddy Bandana`,
          );
      })
      .catch(() => !cancelled && setStats("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [s.open]);

  const invite = async () => {
    const res = await shareCard(
      {
        title: "Come play PAWtastic Games",
        big: "🐾",
        lines: ["Run a 3D dog daycare · race Recess Rush", "graduate your pup · free to play"],
        link,
        logoUrl: LOGO_URL,
      },
      "🐾 Come play PAWtastic Games with me — a free dog daycare game, an arcade runner and a puzzle adventure:",
    );
    track("share", { kind: "invite", context: s.context, result: res });
    if (res === "copied" || res === "downloaded")
      toast.success("Invite link copied — paste it to a friend!");
    if (res === "failed") copy(link, "invite");
  };
  const copy = async (text: string, kind: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copied!");
      track("share", { kind, context: s.context, result: "copied" });
    } catch {
      toast.error("Couldn't copy — press and hold the link to copy it.");
    }
  };
  const recommend = async (i: number) => {
    const l = LOCATIONS[i]!;
    const url = recommendLink(l, code);
    const text = `Know a dog who'd love daycare? PAWtastic Academy in ${l.name} (${l.address}) offers daycare, boarding and baths. Start with a free evaluation:`;
    let result = "copied";
    try {
      if (navigator.share) {
        await navigator.share({ title: "PAWtastic Academy", text, url });
        result = "shared";
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success(`${l.name} evaluation link copied!`);
      }
    } catch (e) {
      result = (e as Error).name === "AbortError" ? "cancelled" : "failed";
      if (result === "failed") toast.error("Couldn't share — try Copy instead.");
    }
    track("share", { kind: "recommend", location: l.id, result });
  };

  const completed = typeof stats === "object" ? stats.completed : null;
  return (
    <Sheet open={s.open} onOpenChange={(o) => (o ? openShare() : closeShare())}>
      <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="font-display text-secondary">Share PAWtastic</SheetTitle>
          <SheetDescription>
            You choose where to share — nothing is posted for you.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-secondary">
          <section aria-label="Invite friends">
            <h3 className="font-display text-base font-bold">Invite friends to play</h3>
            <p className="text-xs font-bold text-muted-foreground">
              Your personal link. When a friend who's new to PAWtastic Games finishes their
              first-day tutorial, you get +{REFERRAL_COINS_EACH} daycare coins (up to{" "}
              {REFERRAL_MAX_REWARDED} friends) and the Best Buddy Bandana. Game coins have no cash
              value.
            </p>
            <Button
              className="mt-2 h-12 w-full font-display text-base"
              onClick={invite}
              disabled={!code}
            >
              <Share2 /> Share my invite
            </Button>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={link}
                aria-label="Your invite link"
                className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-border bg-muted px-2 text-xs font-bold"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                className="h-11 shrink-0"
                onClick={() => copy(link, "invite")}
                aria-label="Copy invite link"
              >
                <Copy /> Copy
              </Button>
            </div>
            <p
              className="mt-2 rounded-xl bg-muted p-2 text-xs font-extrabold"
              data-testid="referral-stats"
            >
              {stats === "loading"
                ? "Checking your invites…"
                : stats === "unavailable"
                  ? "Friend counts aren't available right now."
                  : `${stats.joined} friend${stats.joined === 1 ? "" : "s"} joined · ${stats.completed} finished their first day · ${Math.min(rewarded, REFERRAL_MAX_REWARDED)}/${REFERRAL_MAX_REWARDED} rewarded`}
              {completed !== null && completed > REFERRAL_MAX_REWARDED ? " · thank you!" : ""}
            </p>
          </section>

          {s.extra && (
            <section aria-label="Share this screen">
              <Button
                variant="secondary"
                className="h-12 w-full font-display text-base"
                onClick={() => {
                  s.extra!.run();
                }}
              >
                {s.extra.label}
              </Button>
            </section>
          )}

          <section aria-label="Recommend PAWtastic Academy">
            <h3 className="font-display text-base font-bold">Recommend PAWtastic to a dog owner</h3>
            <p className="text-xs font-bold text-muted-foreground">
              Shares PAWtastic Academy's free evaluation form. Only daycare, boarding and baths are
              mentioned — no prices or promotions.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {LOCATIONS.map((l, i) => ({ l, i }))
                .sort((a, b) => Number(b.l.id === team) - Number(a.l.id === team))
                .map(({ l, i }) => (
                  <Button
                    key={l.id}
                    variant={l.id === team ? "default" : "outline"}
                    className="h-12"
                    disabled={!code}
                    onClick={() => recommend(i)}
                  >
                    {l.name}
                    {l.id === team ? " (your team)" : ""}
                  </Button>
                ))}
            </div>
          </section>
          {import.meta.env["VITE_REVIEW_BUILD"] && (
            <p className="rounded-xl bg-accent p-2 text-xs font-extrabold text-accent-foreground">
              Private review build: invite links point here until the game is published, and friend
              counts are off.
            </p>
          )}
          <p className="text-[11px] font-bold text-muted-foreground">
            Your link contains a random code, not your name or contact details. Friends who open it
            are counted anonymously.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
