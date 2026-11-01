import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Cloud, CloudOff, Gamepad2, GraduationCap, KeyRound, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useSession } from "@/lib/auth";
import { GameHeader } from "@/components/game/GameHeader";
import {
  chooseCloud, chooseDevice, fetchAll, readLocal, saveAllNow, unlink, useLinks, useStatuses,
  type CloudRows, type SyncStatus,
} from "@/game/cloud";
import { EmailUpdates } from "@/components/game/EmailUpdates";
import { GAME_IDS, GAME_NAMES, hasProgress, parseSlot, summaryOf, type GameId } from "@/game/cloudSlots";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Sign in & cloud saves | PAWtastic Games" },
      { name: "description", content: "Sign in to save Daycare Tycoon, Recess Rush and Graduation Day to your account and load them on any phone." },
      { property: "og:title", content: "Sign in & cloud saves | PAWtastic Games" },
      { property: "og:description", content: "Save each game's progress to your free account and load it on any phone." },
    ],
  }),
  component: Account,
});

const ICONS: Record<GameId, typeof Building2> = { daycare: Building2, recess: Gamepad2, graduation: GraduationCap };

function Account() {
  const { user, ready } = useSession();
  // Opening the link in a password-reset email signs the player in for one purpose: choosing a new password.
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <main className="space-y-3 px-3 pt-3 pb-6">
      <GameHeader title="Account" subtitle="Sign in & cloud saves" />
      {!ready ? (
        <p className="text-sm font-medium text-muted-foreground">Checking sign-in…</p>
      ) : recovery && user ? (
        <NewPassword onDone={() => setRecovery(false)} />
      ) : user ? (
        <SignedIn userId={user.id} email={user.email ?? ""} />
      ) : (
        <SignInForm />
      )}
      <p className="text-center text-[11px] font-medium text-muted-foreground">
        Accounts are free and optional — guest play always works. Saves hold game progress only; game coins have no cash
        value. This account is for PAWtastic Games; the Graduation Day website has its own sign-in.{" "}
        <Link to="/privacy" className="underline">Privacy</Link>
      </p>
    </main>
  );
}

const friendly = (m: string) =>
  /invalid login/i.test(m) ? "That email and password don't match. Try again, or reset your password." :
  /already registered/i.test(m) ? "There's already an account with that email. Sign in instead." :
  /rate limit|too many/i.test(m) ? "Too many tries — please wait a minute and try again." :
  /not confirmed/i.test(m) ? "Please confirm your email first — check your inbox for the link." : m;

function SignInForm() {
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const r = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/account` });
        if (r.error) throw r.error;
        setNotice("If there's an account for that email, we've sent a link to choose a new password. It can take a minute to arrive.");
        return;
      }
      if (mode === "in") {
        const r = await supabase.auth.signInWithPassword({ email, password: pw });
        if (r.error) throw r.error;
        return; // the root loads or saves each game by itself once signed in
      }
      const r = await supabase.auth.signUp({
        email, password: pw,
        options: { emailRedirectTo: `${window.location.origin}/account`, ...(nick.trim() ? { data: { display_name: nick.trim().slice(0, 30) } } : {}) },
      });
      if (r.error) throw r.error;
      if (!r.data.session) setNotice("Check your email to confirm your account, then come back and sign in. Your progress stays on this phone meanwhile.");
    } catch (err) {
      toast.error(friendly(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Sign in" className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="eyebrow">Cloud saves</p>
      <h2 className="text-xl font-bold text-secondary">
        {mode === "up" ? "Create a free account" : mode === "forgot" ? "Reset your password" : "Save & load your progress"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in to save Daycare Tycoon, Recess Rush and Graduation Day to your account — each game separately — and load
        them on any phone.
      </p>
      {notice ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm font-medium text-secondary" role="status">{notice}</p>
      ) : (
        <>
          {mode !== "forgot" && (
            <>
              <Button
                className="mt-3 h-12 w-full text-base"
                size="lg"
                onClick={async () => {
                  const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/account` });
                  if (r.error) toast.error("Google sign-in didn't work. Please try again or use email.");
                }}
              >
                Continue with Google
              </Button>
              <p className="my-3 text-center text-xs font-medium text-muted-foreground">or use email</p>
            </>
          )}
          <form onSubmit={submit} className={`space-y-2 ${mode === "forgot" ? "mt-3" : ""}`}>
            <Input type="email" required placeholder="Email" aria-label="Email" autoComplete="email" className="h-12" value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode === "up" && <Input placeholder="Display name (optional)" aria-label="Display name" maxLength={30} autoComplete="nickname" className="h-12" value={nick} onChange={(e) => setNick(e.target.value)} />}
            {mode !== "forgot" && (
              <Input type="password" required minLength={8} placeholder="Password (8+ characters)" aria-label="Password" autoComplete={mode === "in" ? "current-password" : "new-password"} className="h-12" value={pw} onChange={(e) => setPw(e.target.value)} />
            )}
            <Button type="submit" size="lg" variant="secondary" className="h-12 w-full text-base" disabled={busy}>
              {mode === "forgot" ? <><Mail /> Email me a reset link</> : mode === "in" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </>
      )}
      <div className="mt-2 flex flex-wrap justify-between gap-x-3">
        {mode === "in" ? (
          <>
            <button type="button" className="min-h-11 text-sm font-medium text-primary underline" onClick={() => { setMode("forgot"); setNotice(null); }}>Forgot password?</button>
            <button type="button" className="min-h-11 text-sm font-medium text-primary underline" onClick={() => { setMode("up"); setNotice(null); }}>New here? Create an account</button>
          </>
        ) : (
          <button type="button" className="min-h-11 text-sm font-medium text-primary underline" onClick={() => { setMode("in"); setNotice(null); }}>Back to sign in</button>
        )}
      </div>
    </section>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section aria-label="Choose a new password" className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <h2 className="flex items-center gap-2 text-xl font-bold text-secondary"><KeyRound className="h-5 w-5 text-primary" /> Choose a new password</h2>
      <form
        className="mt-3 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await supabase.auth.updateUser({ password: pw });
          setBusy(false);
          if (r.error) { toast.error(friendly(r.error.message)); return; }
          toast.success("Password changed. You're signed in.");
          onDone();
        }}
      >
        <Input type="password" required minLength={8} placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" className="h-12" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy}>Save new password</Button>
      </form>
    </section>
  );
}

function SignedIn({ userId, email }: { userId: string; email: string }) {
  // undefined = loading, "error" = couldn't reach the server (never treated as "no cloud save")
  const [rows, setRows] = useState<CloudRows | undefined | "error">(undefined);
  const [busy, setBusy] = useState<GameId | "all" | null>(null);
  const links = useLinks();
  const statuses = useStatuses();
  const refresh = useCallback(async () => {
    try { setRows(await fetchAll()); } catch { setRows("error"); }
  }, []);
  const okCount = GAME_IDS.filter((g) => statuses[g].kind === "ok").length;
  useEffect(() => { void refresh(); }, [refresh, okCount]);

  const act = async (game: GameId | "all", fn: () => Promise<unknown>, done: string) => {
    setBusy(game);
    try { await fn(); toast.success(done); } catch (e) { toast.error(e instanceof Error ? e.message : "Cloud save failed"); } finally { setBusy(null); void refresh(); }
  };

  return (
    <>
      <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Signed in as</p>
          <p className="truncate font-bold text-secondary">{email}</p>
        </div>
        <Button variant="secondary" className="h-11" onClick={async () => { unlink(); await supabase.auth.signOut(); toast.success("Signed out. Your progress stays on this phone."); }}>
          <LogOut /> Sign out
        </Button>
      </section>

      <EmailUpdates />

      <section aria-label="Your cloud saves" className="space-y-2">
        <div className="flex items-end justify-between px-1">
          <div>
            <p className="eyebrow">Your cloud saves</p>
            <p className="text-xs text-muted-foreground">Each game is saved on its own, automatically.</p>
          </div>
          <Button size="sm" variant="secondary" className="h-11" disabled={busy !== null} onClick={() => act("all", async () => {
            const res = await saveAllNow(userId);
            if (res.some((r) => r.kind === "error")) throw new Error("Some games couldn't be saved — we'll retry");
          }, "Saved")}>
            <Cloud /> Save now
          </Button>
        </div>
        {rows === "error" && (
          <p className="rounded-xl bg-muted p-3 text-sm font-medium text-destructive">
            Couldn't reach your cloud saves, so nothing was changed. <button type="button" className="min-h-11 underline" onClick={() => void refresh()}>Try again</button>
          </p>
        )}
        {GAME_IDS.map((g) => (
          <GameSave
            key={g}
            game={g}
            row={rows && rows !== "error" ? rows[g] : undefined}
            loading={rows === undefined}
            linked={!!(links && links.userId === userId && links.slots[g])}
            status={statuses[g]}
            busy={busy !== null}
            onKeepPhone={() => act(g, () => chooseDevice(userId, g), `${GAME_NAMES[g]}: this phone's progress saved to your account`)}
            onUseCloud={() => act(g, () => chooseCloud(userId, g), `${GAME_NAMES[g]}: cloud progress loaded on this phone`)}
          />
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <h2 className="text-lg font-bold text-secondary">Purchases</h2>
        <p className="text-sm text-muted-foreground">Cosmetic packs are tied to this account and confirmed by our server. <Link to="/shop" className="text-primary underline">Open the shop</Link> to restore.</p>
      </section>
    </>
  );
}

function GameSave({ game, row, loading, linked, status, busy, onKeepPhone, onUseCloud }: {
  game: GameId;
  row: { data: unknown; revision: number; updated_at: string } | undefined;
  loading: boolean;
  linked: boolean;
  status: SyncStatus;
  busy: boolean;
  onKeepPhone: () => void;
  onUseCloud: () => void;
}) {
  const Icon = ICONS[game];
  const local = readLocal(game);
  const cloud = row ? parseSlot(game, row.data) : null;
  const here = local && hasProgress(game, local) ? summaryOf(game, local) : "Nothing yet";
  const there = loading ? "Loading…" : cloud ? `${summaryOf(game, cloud)} · ${new Date(row!.updated_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "Nothing saved yet";
  return (
    <article aria-label={`${GAME_NAMES[game]} cloud save`} className={`rounded-2xl border bg-card p-4 shadow-soft ${status.kind === "conflict" ? "border-accent" : "border-border"}`}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden /></div>
        <h3 className="flex-1 text-lg font-bold text-secondary">{GAME_NAMES[game]}</h3>
        <StatusBadge status={status} linked={linked} />
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-muted-foreground">This phone</dt><dd className="font-medium text-secondary">{here}</dd>
        <dt className="text-muted-foreground">Your account</dt><dd className="font-medium text-secondary">{there}</dd>
      </dl>
      {status.kind === "conflict" && (
        <div className="mt-3">
          <p className="text-sm font-medium text-secondary">This game has different progress on this phone and in your account. Which should we keep?</p>
          <div className="mt-2 grid gap-2">
            <Button size="lg" variant="secondary" disabled={busy} className="h-auto min-h-12 flex-col whitespace-normal py-2" onClick={onKeepPhone}>
              Keep this phone's progress<span className="text-xs font-normal text-muted-foreground">{here} · replaces your account's save</span>
            </Button>
            <Button size="lg" disabled={busy || !cloud} className="h-auto min-h-12 flex-col whitespace-normal py-2" onClick={onUseCloud}>
              Load my account's progress<span className="text-xs font-normal opacity-90">{cloud ? summaryOf(game, cloud) : ""} · replaces this phone's</span>
            </Button>
          </div>
        </div>
      )}
      {status.kind === "error" && <p className="mt-2 text-sm font-medium text-destructive">⚠ {status.message}</p>}
    </article>
  );
}

function StatusBadge({ status, linked }: { status: SyncStatus; linked: boolean }) {
  const cls = "rounded-full px-2 py-0.5 text-xs font-medium";
  if (status.kind === "conflict") return <span className={`${cls} bg-accent/20 text-accent-foreground`}>Choose</span>;
  if (status.kind === "error") return <span className={`${cls} bg-destructive/10 text-destructive`}><CloudOff className="mr-1 inline h-3 w-3" />Retrying</span>;
  if (status.kind === "syncing") return <span className={`${cls} bg-muted text-muted-foreground`}>Saving…</span>;
  if (linked) return <span className={`${cls} bg-success/15 text-success`}>✓ Saving</span>;
  return <span className={`${cls} bg-muted text-muted-foreground`}>Setting up…</span>;
}
