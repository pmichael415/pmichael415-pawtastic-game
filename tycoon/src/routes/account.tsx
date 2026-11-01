import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Cloud, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useSession } from "@/lib/auth";
import { GameHeader } from "@/components/game/GameHeader";
import { chooseCloud, chooseDevice, fetchCloud, readLocal, saveNow, SaveConflictError, setStatus, summary, unlink, useLink, useSyncStatus, type CloudSave } from "@/game/cloud";
import type { GameState } from "@/game/engine";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account & Cloud Save | PAWtastic Tycoon" },
      { name: "description", content: "Optional free account to back up your PAWtastic Tycoon daycare and play on any device." },
      { property: "og:title", content: "Account & Cloud Save | PAWtastic Tycoon" },
      { property: "og:description", content: "Back up your daycare progress with an optional free account." },
    ],
  }),
  component: Account,
});

function Account() {
  const { user, ready } = useSession();
  return (
    <main className="space-y-4 px-3 pt-3">
      <GameHeader title="Account" subtitle="Profile, cloud saves & purchases" />
      {!ready ? <p className="font-bold text-muted-foreground">Checking sign-in…</p> : user ? <SignedIn userId={user.id} email={user.email ?? ""} /> : <SignInForm />}
      <p className="text-center text-[11px] font-medium text-muted-foreground">Accounts are optional — guest play always works. Game coins have no cash value.</p>
    </main>
  );
}

function SignInForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: `${window.location.origin}/account`, ...(nick.trim() ? { data: { display_name: nick.trim().slice(0, 30) } } : {}) } });
    setBusy(false);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    if (mode === "up" && !r.data.session) setSent(true);
  };

  if (sent) return <p className="rounded-2xl border border-border bg-card p-4 font-medium text-secondary shadow-soft">Check your email to confirm your account, then come back and sign in.</p>;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <h2 className="font-display text-lg font-bold text-secondary">{mode === "in" ? "Sign in" : "Create a free account"}</h2>
      <Button className="mt-3 w-full" variant="outline" size="lg" onClick={async () => {
        const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/account` });
        if (r.error) toast.error("Google sign-in failed");
      }}>Continue with Google</Button>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <Input type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode === "up" && <Input placeholder="Display name (optional)" maxLength={30} autoComplete="nickname" value={nick} onChange={(e) => setNick(e.target.value)} />}
        <Input type="password" required minLength={8} placeholder="Password (8+ characters)" autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</Button>
      </form>
      <button className="mt-2 text-sm font-bold text-primary underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </section>
  );
}

function SignedIn({ userId, email }: { userId: string; email: string }) {
  // undefined = loading, "error" = couldn't reach the server (never treated as "no cloud save")
  const [cloud, setCloud] = useState<CloudSave | undefined | "error">(undefined);
  const [local, setLocal] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const link = useLink();
  const status = useSyncStatus();
  const linked = link?.userId === userId;

  const refresh = async () => {
    setLocal(readLocal());
    setCloud(undefined);
    try {
      setCloud(await fetchCloud(userId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reach cloud saves");
      setCloud("error");
    }
  };
  useEffect(() => { refresh(); }, [userId]);
  useEffect(() => { if (status.kind === "conflict") refresh(); }, [status.kind]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      if (e instanceof SaveConflictError) { setStatus({ kind: "conflict" }); toast.error(e.message + " Choose which progress to keep."); }
      else toast.error(e instanceof Error ? e.message : "Cloud save failed");
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const cloudRev = cloud && cloud !== "error" ? cloud.revision : 0;
  const keepDevice = () => run(() => chooseDevice(userId, cloudRev), "Device progress saved to your account");
  const useCloud = () => cloud && cloud !== "error" && run(async () => chooseCloud(userId, cloud), "Cloud progress loaded on this device");
  const conflict = status.kind === "conflict";

  return (
    <>
      <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Signed in as</div>
          <div className="truncate font-display font-bold text-secondary">{email}</div>
        </div>
        <Button variant="outline" onClick={async () => { unlink(); await supabase.auth.signOut(); }}><LogOut /> Sign out</Button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft" aria-label="Cloud save">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-secondary"><Cloud className="h-5 w-5" /> Cloud save</h2>
        {cloud === undefined ? <p className="text-sm text-muted-foreground">Loading…</p> : cloud === "error" ? (
          <>
            <p className="mt-1 text-sm font-bold text-destructive">Couldn't reach your cloud save, so nothing was changed.</p>
            <Button className="mt-2" variant="outline" onClick={refresh}>Try again</Button>
          </>
        ) : linked && !conflict ? (
          <>
            <p className="mt-1 text-sm font-bold text-success">✓ This device syncs to your account automatically.</p>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {status.kind === "syncing" ? "Saving…" : status.kind === "ok" ? `Last synced ${new Date(status.at).toLocaleTimeString()}` : status.kind === "error" ? `⚠ ${status.message}` : "Waiting for next automatic save"}
            </p>
            {cloud && <p className="text-xs text-muted-foreground">Cloud: {summary(cloud.data)} · {new Date(cloud.updated_at).toLocaleString()}</p>}
            <Button className="mt-2" disabled={busy} onClick={() => run(async () => { const r = await saveNow(userId); if (r.kind === "error") throw new Error(r.message); if (r.kind === "conflict") throw new SaveConflictError(); }, "Saved to your account")}>Save now</Button>
          </>
        ) : cloud && local ? (
          <>
            <p className="mt-1 text-sm font-bold text-secondary">{conflict ? "Your cloud save was updated on another device. Auto-sync is paused until you choose." : "You have progress in two places. Which should we keep?"}</p>
            <div className="mt-2 grid gap-2">
              <Button size="lg" variant="secondary" disabled={busy} className="h-auto flex-col whitespace-normal py-2 text-center" onClick={keepDevice}>Keep this device<span className="text-xs opacity-80">{summary(local)} · replaces cloud</span></Button>
              <Button size="lg" variant="outline" disabled={busy} className="h-auto flex-col whitespace-normal py-2 text-center" onClick={useCloud}>Use cloud save<span className="text-xs opacity-80">{summary(cloud.data)} · replaces this device</span></Button>
            </div>
          </>
        ) : local ? (
          <Button size="lg" className="mt-2 w-full" disabled={busy} onClick={keepDevice}>Import guest progress to my account</Button>
        ) : cloud ? (
          <Button size="lg" className="mt-2 w-full" disabled={busy} onClick={useCloud}>Load my cloud save</Button>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No progress yet — <Link to="/" className="text-primary underline">start playing</Link>.</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <h2 className="font-display text-lg font-bold text-secondary">Purchases</h2>
        <p className="text-sm text-muted-foreground">Cosmetic packs are tied to this account and confirmed by our server. <Link to="/shop" className="text-primary underline">Open the shop</Link> to restore.</p>
      </section>
    </>
  );
}
