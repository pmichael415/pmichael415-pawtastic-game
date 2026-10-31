import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Bath, BedDouble, Clock, Coins, Gamepad2, Home, Lock, Pause, Play, Plus, RotateCcw, Share2, Sparkles, Moon, X } from "lucide-react";
import room from "@/assets/daycare-room.jpg";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ACHIEVEMENTS, DECOR, GROUPS, LOBBY_CAP, MAX_STAFF, SITES, UPGRADES, admitDog, assignRoom, assignSuite, bath, buyDecor, buyUpgrade, checkout, claimMission, cleanRoom, dailyMissions, daycareScore, groupName, groupOf, hireCost, hireStaff, lobbyDogs, recoveryDogs, lobbyStatus, fmtClock, fmtDur, roomHardBlock, mismatchWarning, roomAtRisk, hasScuffle, separateDogs, separateDog, checkIn, inActiveScuffle, missionProgress, playtime, roomCapacity, roomDogs, sites, suiteBlockReason, suiteCount, suiteDog, traitLabel, type Dog, type GroupId,
} from "@/game/engine";
import { resetSave, todayKey, useGame } from "@/game/store";
import { useEntitlements } from "@/lib/entitlements";
import { NAVY_STAR } from "@/lib/paidVisuals";
import { DogSprite, LOGO_URL, Logo, StaffSprite, bandanaColor } from "@/game/sprites";
import { SHARE_LINES, shareCard } from "@/game/share";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PAWtastic Tycoon — Run Your Own Dog Daycare" },
      { name: "description", content: "Free dog daycare tycoon game from PAWtastic Academy. Check pups in at the lobby, group them into playrooms, run boarding suites and grow to two locations." },
      { property: "og:title", content: "PAWtastic Tycoon — Run Your Own Dog Daycare" },
      { property: "og:description", content: "Lobby check-in, playrooms by size & temperament, private boarding suites. Free to play, instantly." },
    ],
  }),
  component: Tycoon,
});

const TUTORIAL = [
  "Welcome, Phil! Tap “Admit pup” — new arrivals wait in the lobby for check-in.",
  "Tap the waiting pup, then tap the green playroom matching its size & temperament (or drag it). Mismatched rooms show ⚠ — you can place anyway, but it risks a scuffle. If one starts, tap “Separate dogs”.",
  "Now tap the pup in its playroom and choose Play.",
  "Give a bath — tap a pup and choose Bath.",
  "Send a happy pup home with Check out. Happier pups pay more!",
];

function Meter({ label, value, tone = "bg-primary" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-[11px] font-extrabold text-secondary">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="mt-0.5 h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${value < 35 ? "bg-destructive" : tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Tycoon() {
  const { state, act, set, paused, setPaused } = useGame();
  const { visuals: paidVisuals } = useEntitlements();
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ dog: Dog; g: GroupId; warn: string } | null>(null);
  const prevScuffles = useRef(0);
  useEffect(() => {
    const n = state?.scuffles.length ?? 0;
    if (n > prevScuffles.current) toast.warning("💥 Scuffle in a playroom! Tap “Separate dogs” to calm things down.");
    prevScuffles.current = n;
  }, [state?.scuffles.length]);
  const [tab, setTab] = useState<"upgrades" | "decor" | "staff" | "missions" | "awards">("missions");
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dropRef = useRef<(id: string, kind: string, val: string) => void>(() => {});
  useEffect(() => {
    const up = (e: PointerEvent) => {
      const dr = dragRef.current;
      dragRef.current = null;
      if (!dr || Math.hypot(e.clientX - dr.x, e.clientY - dr.y) < 20) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-drop]");
      if (!el) return;
      const [kind = "", val = ""] = (el.dataset["drop"] ?? "").split(":");
      dropRef.current(dr.id, kind, val);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  const day = todayKey();
  const missions = useMemo(() => dailyMissions(day), [day]);

  // tutorial progression
  useEffect(() => {
    if (!state || state.tutorial < 0) return;
    const s = state.stats;
    const t = state.tutorial;
    const inRoom = state.dogs.some((d) => d.place.kind !== "lobby");
    const next = t === 0 && s.admitted > 0 ? 1 : t === 1 && (inRoom || s.plays > 0) ? 2 : t === 2 && s.plays > 0 ? 3 : t === 3 && s.baths > 0 ? 4 : t === 4 && s.checkouts > 0 ? -1 : t;
    if (next !== t) {
      set((x) => ({ ...x, tutorial: next }));
      if (next === -1) toast.success("Tutorial complete! Explore upgrades, missions & Recess Rush.");
    }
  }, [state?.stats, state?.dogs]);

  if (!state) return <div className="grid min-h-dvh place-items-center font-display text-2xl text-primary">Opening the daycare…</div>;

  const site = sites(state).includes(state.site) ? state.site : "hawthorne";
  const roomCap = roomCapacity(state);
  const nSuites = suiteCount(state);
  const lobby = lobbyDogs(state, site);
  const avgHappy = state.dogs.length ? state.dogs.reduce((a, d) => a + d.happiness, 0) / state.dogs.length : 100;
  const avgEnergy = state.staff.reduce((a, s) => a + s.energy, 0) / state.staff.length;
  const selected = state.dogs.find((d) => d.id === sel) ?? null;
  const pv = paidVisuals; // server-verified + player-enabled only
  const bandana = pv["navy-star-bandana"] ? NAVY_STAR : bandanaColor(state.equipped);
  const siteName = SITES.find((x) => x.id === site)!.name;

  const lobbyNow = lobbyStatus(state.clockMin);
  const toRoom = (dog: Dog, g: GroupId) => {
    const warn = !roomHardBlock(state, dog, g) && mismatchWarning(dog, g);
    if (warn) { setConfirm({ dog, g, warn }); return false; }
    return act((s) => assignRoom(s, dog.id, g));
  };
  const toSuite = (dog: Dog, i: number) => act((s) => assignSuite(s, dog.id, i));

  // drag a pup onto any [data-drop] target
  const onDogDown = (e: React.PointerEvent, d: Dog) => {
    if (paused) return;
    dragRef.current = { id: d.id, x: e.clientX, y: e.clientY };
  };
  dropRef.current = (id, kind, val) => {
    const dog = state.dogs.find((x) => x.id === id);
    if (!dog) return;
    if (kind === "room") toRoom(dog, val as GroupId);
    if (kind === "suite") toSuite(dog, Number(val));
  };

  const DogChip = ({ d, passive = false }: { d: Dog; passive?: boolean }) => (
    <button
      aria-label={`${d.name}, ${traitLabel(d)}, happiness ${Math.round(d.happiness)}%`}
      aria-pressed={sel === d.id}
      onPointerDown={(e) => onDogDown(e, d)}
      onClick={(e) => { e.stopPropagation(); setSel(sel === d.id ? null : d.id); }}
      className={`flex touch-none flex-col items-center rounded-xl p-0.5 ${passive ? "pointer-events-none" : ""} ${sel === d.id ? "bg-primary/15 ring-2 ring-primary" : ""}`}
    >
      <DogSprite breed={d.breed} size={d.size === "small" ? 40 : 54} bandana={bandana} star={pv["navy-star-bandana"]} collar={pv["ribbon-collar"]} moving={!paused} />
      <span className="whitespace-nowrap rounded-full bg-card px-1.5 text-[10px] font-extrabold text-secondary">
        {d.boarding && "🌙"}{d.name}{d.happiness < 35 ? " 😢" : d.clean < 35 ? " 🟤" : ""}
      </span>
      <span className="text-[9px] font-extrabold text-muted-foreground">{d.size === "small" ? "S" : "L"} · {d.temper === "gentle" ? "🧸 gentle" : "⚡ active"}</span>
    </button>
  );

  const share = async () => {
    const score = daycareScore(state);
    const link = `${window.location.origin}/recess?challenge=${score}&seed=${day}&utm_source=game_share&utm_medium=share&utm_campaign=pawtastic_tycoon`;
    const line = SHARE_LINES[score % SHARE_LINES.length]!;
    const res = await shareCard(
      { title: "My PAWtastic Daycare Score", big: String(score), lines: [line, `${state.stats.admitted} pups · ${state.staff.length} staff · ${state.upgrades.length} upgrades`], link, logoUrl: LOGO_URL },
      `🐾 My PAWtastic Tycoon daycare scored ${score}! ${line} Can you beat it?`,
    );
    if (res === "cancelled" || res === "failed") return;
    act((s) => ({ ok: true, state: { ...s, stats: { ...s.stats, shares: s.stats.shares + 1 } } }));
    if (res === "downloaded") toast.success("Card downloaded & challenge link copied!");
    if (res === "copied") toast.success("Challenge link copied!");
  };

  return (
    <main className="px-3 pt-3">
      <header className="flex items-center gap-2">
        <Logo className="h-11 w-auto" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold leading-none text-secondary">PAWtastic Tycoon</h1>
          <p className="text-[11px] font-bold text-muted-foreground">Guest mode · saved on this device</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 font-display text-lg font-bold text-secondary shadow-soft" aria-label="Coins">
          <Coins className="h-5 w-5 text-accent" aria-hidden /> {state.coins}
        </div>
        <Button size="icon" variant="secondary" aria-label={paused ? "Resume" : "Pause"} onClick={() => setPaused(!paused)}>
          {paused ? <Play /> : <Pause />}
        </Button>
      </header>

      <section className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-card p-3 shadow-soft">
        <Meter label="Happiness" value={avgHappy} tone="bg-success" />
        <Meter label="Cleanliness" value={state.cleanliness} />
        <Meter label="Staff energy" value={avgEnergy} tone="bg-accent" />
        <div className="text-[11px] font-extrabold text-secondary">
          Pups on site <span className="font-display text-lg">{state.dogs.length}</span>
        </div>
      </section>

      <section aria-label="Game clock" className={`mt-3 flex items-center gap-3 rounded-2xl p-3 shadow-soft ${lobbyNow.open ? "bg-card" : "bg-secondary text-secondary-foreground"}`}>
        <Clock className="h-7 w-7 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-bold leading-none">{fmtClock(state.clockMin)} <span className="text-xs font-extrabold opacity-70">Game clock · Day {state.gameDay}</span></div>
          <div className={`mt-0.5 text-xs font-extrabold ${lobbyNow.open ? "text-success" : ""}`}>
            {lobbyNow.open
              ? state.clockMin < 720 ? `🟢 Lobby OPEN · midday break in ${fmtDur(lobbyNow.minutesToChange)}` : `🟢 Lobby OPEN · day ends in ${fmtDur(lobbyNow.minutesToChange)}`
              : `🔒 Lobby CLOSED 12:00–14:00 · reopens in ${fmtDur(lobbyNow.minutesToChange)}`}
          </div>
        </div>
        <div className="text-right text-[10px] font-extrabold">Reputation<div className="font-display text-lg">{Math.round(state.reputation)}</div></div>
      </section>
      <p className="mt-1 px-1 text-[10px] font-bold text-muted-foreground">Game-only schedule (open 07:00–18:00, break 12–2). Real hours & bookings are on the Visit Us tab.</p>

      {state.tutorial >= 0 && (
        <div role="status" className="mt-3 rounded-2xl border-2 border-primary bg-card p-3 text-sm font-bold text-secondary">
          <span className="mr-1 font-display text-primary">Tip {state.tutorial + 1}/{TUTORIAL.length}:</span>
          {TUTORIAL[state.tutorial]}
          <button className="ml-2 text-xs text-muted-foreground underline" onClick={() => set((s) => ({ ...s, tutorial: -1 }))}>Skip</button>
        </div>
      )}

      {sites(state).length > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-card p-1 shadow-soft" role="tablist" aria-label="Location">
          {SITES.map((x) => (
            <button key={x.id} role="tab" aria-selected={site === x.id} onClick={() => { set((s) => ({ ...s, site: x.id })); setSel(null); }} className={`rounded-full py-2 font-display font-bold ${site === x.id ? "bg-secondary text-secondary-foreground" : "text-secondary"}`}>
              {x.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative mt-3 space-y-3 select-none" onClick={() => setSel(null)}>
        {/* LOBBY */}
        <section aria-label={`${siteName} lobby`} className="rounded-3xl border-4 border-secondary bg-card p-3 shadow-pop">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-secondary">🛎️ {siteName} Lobby · {lobbyNow.open ? "Check-in" : "CLOSED 12–2"}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${lobby.length >= LOBBY_CAP ? "bg-destructive text-destructive-foreground" : "bg-muted text-secondary"}`}>{lobby.length}/{LOBBY_CAP} waiting</span>
          </div>
          <div className="mt-2 flex min-h-20 flex-wrap items-end gap-1 rounded-2xl bg-sky/60 p-2">
            <div className="pointer-events-none flex gap-1">
              {state.staff.slice(0, 2).map((s) => <StaffSprite key={s.id} name={s.name} tired={s.energy < 15} />)}
            </div>
            {lobby.map((d) => <DogChip key={d.id} d={d} />)}
            {!lobby.length && <p className="self-center text-xs font-bold text-muted-foreground">{lobbyNow.open ? "No one waiting. Admit a pup to start check-in." : "No drop-offs until 14:00. Care continues in the playrooms."}</p>}
            {state.decor.map((id) => <span key={id} className="pointer-events-none self-center text-2xl">{DECOR.find((d) => d.id === id)?.emoji}</span>)}
            {pv["deluxe-decor"] && <span data-testid="deluxe-lobby" aria-label="Deluxe decor: paw-print rug and bubble machine" className="pointer-events-none self-center text-2xl">🐾🫧</span>}
          </div>
        </section>

        {/* PLAYROOMS */}
        <section aria-label="Playrooms">
          <h2 className="px-1 font-display text-lg font-bold text-secondary">🎾 Playrooms <span className="text-xs text-muted-foreground">grouped by size + temperament</span></h2>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {GROUPS.map((g) => {
              const dogs = roomDogs(state, site, g.id);
              const hard = selected ? roomHardBlock(state, selected, g.id) : null;
              const warn = selected && !hard ? mismatchWarning(selected, g.id) : null;
              const fits = selected && !hard && !warn;
              const why = hard ?? warn;
              const risk = roomAtRisk(state, site, g.id);
              const fight = hasScuffle(state, site, g.id);
              return (
                <div
                  key={g.id}
                  data-drop={`room:${g.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${g.name} playroom, ${dogs.length} of ${roomCap}${selected ? (fits ? ", tap to move " + selected.name + " here" : ", not available") : ""}`}
                  onClick={(e) => { e.stopPropagation(); if (selected) { if (toRoom(selected, g.id)) setSel(null); } }}
                  className={`relative min-h-36 overflow-hidden rounded-2xl border-4 bg-card p-2 transition ${fight ? "animate-shake border-destructive" : fits ? "border-success ring-4 ring-success/40" : warn ? "border-accent" : selected ? "border-border opacity-60" : risk ? "border-accent" : "border-primary"}`}
                >
                  <img src={room} alt="" aria-hidden width={1024} height={1024} loading="lazy" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" />
                  <div className="relative flex items-center justify-between">
                    <span className="font-display text-sm font-bold leading-tight text-secondary">{g.emoji} {g.name}</span>
                    <span className={`rounded-full px-1.5 text-[11px] font-extrabold ${dogs.length >= roomCap ? "bg-destructive text-destructive-foreground" : "bg-card text-secondary"}`}>{dogs.length}/{roomCap}</span>
                  </div>
                  <div className="relative mt-1 flex flex-wrap items-end gap-0.5">
                    {dogs.map((d) => <DogChip key={d.id} d={d} passive={!!selected && selected.id !== d.id} />)}
                    {pv["deluxe-decor"] && <span aria-hidden className="pointer-events-none absolute bottom-1 right-1 text-lg">☁️🗼</span>}
                    {state.cleanliness < 50 && dogs.length > 0 && <span className="pointer-events-none text-xl">💩</span>}
                  </div>
                  {risk && !fight && <p className="relative mt-1 rounded-lg bg-accent p-1 text-[10px] font-extrabold text-accent-foreground"><AlertTriangle className="inline h-3 w-3" /> Tension — mismatched group</p>}
                  {fight && (
                    <div className="relative mt-1 rounded-lg bg-destructive p-1.5 text-center text-destructive-foreground">
                      <div className="font-display text-sm font-bold">💨💥 Scuffle! 💥💨</div>
                      <Button size="sm" variant="secondary" className="mt-1 w-full" onClick={(e) => { e.stopPropagation(); act((s) => separateDogs(s, site, g.id)); }}>Separate dogs</Button>
                    </div>
                  )}
                  {risk && !fight && !selected && (
                    <Button size="sm" variant="outline" className="relative mt-1 w-full" onClick={(e) => { e.stopPropagation(); act((s) => separateDogs(s, site, g.id)); }}>Move mismatch to lobby</Button>
                  )}
                  {selected && (
                    <p className={`relative mt-1 rounded-lg bg-card/90 p-1 text-[10px] font-extrabold ${fits ? "text-success" : warn ? "text-secondary" : "text-muted-foreground"}`}>
                      {fits ? "✓ Safe match — tap to move here" : warn ? <>⚠ {why} Tap to place anyway.</> : <><Lock className="inline h-3 w-3" /> {why}</>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* RECOVERY (staff-only, independent of the public lobby) */}
        {recoveryDogs(state, site).length > 0 && (
          <section aria-label="Recovery space" className="rounded-3xl border-4 border-dashed border-accent bg-card p-3">
            <h2 className="font-display text-base font-bold text-secondary">🫧 Staff recovery space <span className="text-xs text-muted-foreground">calm-down area, always open</span></h2>
            <p className="text-[11px] font-bold text-muted-foreground">Pups rest here after a separation. Tap one, then pick its matching (green) playroom.</p>
            <div className="mt-1 flex flex-wrap gap-1">{recoveryDogs(state, site).map((d) => <DogChip key={d.id} d={d} />)}</div>
          </section>
        )}

        {/* BOARDING */}
        <section aria-label="Boarding suites" className="rounded-3xl bg-secondary p-3 shadow-soft">
          <h2 className="font-display text-lg font-bold text-secondary-foreground">🌙 Boarding Suites <span className="text-xs opacity-80">one pup per private room</span></h2>
          {nSuites === 0 ? (
            <p className="mt-2 flex items-center gap-2 rounded-2xl bg-card p-3 text-sm font-bold text-secondary"><Lock className="h-4 w-4" /> Build Boarding Suites in Upgrades (800 coins) to host overnight guests.</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {Array.from({ length: nSuites }).map((_, i) => {
                const occ = suiteDog(state, site, i);
                const why = selected ? suiteBlockReason(state, selected, i) : null;
                const fits = selected && !why;
                return (
                  <div
                    key={i}
                    data-drop={`suite:${i}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Suite ${i + 1}, ${occ ? "occupied by " + occ.name : "vacant"}`}
                    onClick={(e) => { e.stopPropagation(); if (selected && !occ) { if (toSuite(selected, i)) setSel(null); } else if (selected && why) toast.error(why); }}
                    className={`flex min-h-32 flex-col items-center justify-between rounded-2xl border-4 bg-card p-1.5 ${fits ? "border-success ring-4 ring-success/40" : "border-primary"}`}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-extrabold text-secondary"><BedDouble className="h-3.5 w-3.5" /> Suite {i + 1}</span>
                    {occ ? <DogChip d={occ} passive={!!selected && selected.id !== occ.id} /> : <span className="text-xs font-bold text-muted-foreground">Vacant</span>}
                    <span className={`rounded-full px-1.5 text-[10px] font-extrabold ${occ ? "bg-destructive text-destructive-foreground" : "bg-success text-primary-foreground"}`}>{occ ? "Occupied" : "Open"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="px-1 text-[10px] font-bold text-muted-foreground">Game layout inspired by PAWtastic's lobby → playrooms → boarding flow at {sites(state).length > 1 ? "Hawthorne & Hillsdale" : "Hawthorne (Hillsdale unlocks later)"}. Groups and room counts are simplified for play — not a floor plan or actual facility rules.</p>

        {paused && (
          <div className="absolute inset-0 z-40 grid place-items-center rounded-3xl bg-secondary/60">
            <Button size="lg" onClick={() => setPaused(false)} className="font-display text-xl"><Play /> Resume</Button>
          </div>
        )}
      </div>

      {selected ? (
        <section className="mt-3 rounded-2xl border-2 border-primary bg-card p-3 shadow-soft" aria-label={`Care for ${selected.name}`}>
          <div className="flex items-center gap-2">
            <DogSprite breed={selected.breed} size={44} moving={false} bandana={bandana} star={pv["navy-star-bandana"]} collar={pv["ribbon-collar"]} />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold leading-tight text-secondary">{selected.name} <span className="text-sm text-primary">· {traitLabel(selected)}{selected.boarding ? " · boarder" : ""}</span></h2>
              <p className="text-[11px] font-bold text-muted-foreground">
                {!selected.checkedIn ? "Just dropped off → staff check-in needed" : selected.place.kind === "recovery" ? `Calming down in recovery → best fit: ${selected.boarding ? "an open suite" : groupName(groupOf(selected))}` : selected.place.kind === "lobby" ? (selected.boarding ? "Waiting in lobby → tap an open suite" : `Waiting in lobby → best fit: ${groupName(groupOf(selected))}`) : selected.place.kind === "room" ? `In ${groupName(selected.place.group)} playroom` : `Sleeping in Suite ${selected.place.index + 1}`}
              </p>
              <div className="grid grid-cols-2 gap-2"><Meter label="Happy" value={selected.happiness} tone="bg-success" /><Meter label="Clean" value={selected.clean} /></div>
            </div>
            <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setSel(null)}><X /></Button>
          </div>
          {!selected.checkedIn ? (
            <Button size="lg" className="mt-2 w-full" disabled={!lobbyNow.open} onClick={() => act((s) => checkIn(s, selected.id))}>
              🛎️ {lobbyNow.open ? `Check in +${Math.round((selected.boarding ? 40 : 20) * (state.upgrades.includes("hillsdale") ? 1.25 : 1))}` : "Check-in desk closed until 14:00"}
            </Button>
          ) : (
            <>
              {(selected.place.kind === "lobby" || selected.place.kind === "recovery") && !selected.boarding && (
                <Button size="lg" className="mt-2 w-full" variant="secondary" onClick={() => toRoom(selected, groupOf(selected)) && setSel(null)}>Move to {groupName(groupOf(selected))}</Button>
              )}
              {(selected.place.kind === "lobby" || selected.place.kind === "recovery") && selected.boarding && nSuites > 0 && (
                <Button size="lg" className="mt-2 w-full" variant="secondary" onClick={() => {
                  const free = Array.from({ length: nSuites }, (_, i) => i).find((i) => !suiteDog(state, site, i));
                  if (free === undefined) toast.error("All suites are occupied — check a boarder out first.");
                  else if (toSuite(selected, free)) setSel(null);
                }}>Settle into an open suite</Button>
              )}
              {selected.place.kind !== "recovery" && (
                <Button size="sm" className="mt-2 w-full" variant="outline" onClick={() => act((s) => separateDog(s, selected.id))}>🫶 Move to staff recovery space</Button>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="lg" disabled={selected.place.kind === "lobby" || selected.place.kind === "recovery" || inActiveScuffle(state, selected)} onClick={() => act((s) => playtime(s, selected.id))}><Sparkles /> Play +15</Button>
                <Button size="lg" disabled={inActiveScuffle(state, selected)} onClick={() => act((s) => bath(s, selected.id))}><Bath /> Bath +{state.upgrades.includes("splash") ? 35 : 25}</Button>
                <Button size="lg" variant="secondary" disabled={inActiveScuffle(state, selected)} onClick={() => act((s) => checkout(s, selected.id, false)) && setSel(null)}><Home /> Check out</Button>
                <Button size="lg" variant="outline" disabled={inActiveScuffle(state, selected)} onClick={() => act((s) => checkout(s, selected.id, true)) && setSel(null)}>🛁 Exit bath + out</Button>
              </div>
              {inActiveScuffle(state, selected) && <p className="mt-1 text-xs font-bold text-destructive">Separate the scuffle first — care pauses until everyone is calm.</p>}
            </>
          )}
        </section>
      ) : (
        <section className="mt-3 grid grid-cols-3 gap-2">
          <Button size="lg" className="h-14 font-display text-base" disabled={paused || !lobbyNow.open || lobby.length >= LOBBY_CAP} onClick={() => act((s) => admitDog(s, Math.random, false, site))}><Plus /> {lobbyNow.open ? "Admit pup" : "Closed"}</Button>
          <Button size="lg" variant="secondary" className="h-14 font-display text-base" disabled={paused || !lobbyNow.open || nSuites === 0 || lobby.length >= LOBBY_CAP} onClick={() => act((s) => admitDog(s, Math.random, true, site))}><Moon /> Boarder</Button>
          <Button size="lg" variant="outline" className="h-14 font-display text-base" disabled={paused} onClick={() => act(cleanRoom)}>🧽 Mop</Button>
        </section>
      )}

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-full bg-card p-1 shadow-soft" role="tablist">
        {(["missions", "upgrades", "decor", "staff", "awards"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-full px-3 py-2 text-sm font-extrabold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-secondary"}`}>{t}</button>
        ))}
      </div>

      <section className="mt-3 space-y-2">
        {tab === "missions" && missions.map((m) => {
          const p = missionProgress(state, m);
          const claimed = state.missionsClaimed.includes(m.id);
          return (
            <Row key={m.id} title={m.label} sub={`${p}/${m.target} · reward ${m.reward} coins`}>
              <Button disabled={claimed || p < m.target} onClick={() => act((s) => claimMission(s, m))}>{claimed ? "Done ✓" : "Claim"}</Button>
            </Row>
          );
        })}
        {tab === "upgrades" && UPGRADES.map((u) => {
          const owned = state.upgrades.includes(u.id);
          const locked = !!u.requires && !state.upgrades.includes(u.requires);
          return (
            <Row key={u.id} title={u.name} sub={locked ? `Requires ${UPGRADES.find((x) => x.id === u.requires)?.name}` : u.desc}>
              <Button disabled={owned || locked || state.coins < u.cost} onClick={() => act((s) => buyUpgrade(s, u.id))}>{owned ? "Owned" : `${u.cost} 🪙`}</Button>
            </Row>
          );
        })}
        {tab === "decor" && DECOR.map((d) => (
          <Row key={d.id} title={`${d.emoji} ${d.name}`} sub="Pups stay happy longer">
            <Button disabled={state.decor.includes(d.id) || state.coins < d.cost} onClick={() => act((s) => buyDecor(s, d.id))}>{state.decor.includes(d.id) ? "Placed" : `${d.cost} 🪙`}</Button>
          </Row>
        ))}
        {tab === "staff" && (
          <>
            {state.staff.map((s) => <Row key={s.id} title={s.name} sub={`Energy ${Math.round(s.energy)}%`}><span className="text-2xl">{s.energy < 15 ? "😮‍💨" : "😄"}</span></Row>)}
            <Row title="Hire a team member" sub={state.staff.length >= MAX_STAFF ? "Fully staffed" : "More hands = more care"}>
              <Button disabled={state.staff.length >= MAX_STAFF || state.coins < hireCost(state.staff.length)} onClick={() => act(hireStaff)}>{hireCost(state.staff.length)} 🪙</Button>
            </Row>
          </>
        )}
        {tab === "awards" && ACHIEVEMENTS.map((a) => (
          <Row key={a.id} title={`${state.achievements.includes(a.id) ? "🏆" : "🔒"} ${a.label}`} sub={state.achievements.includes(a.id) ? "Unlocked" : "Keep playing"} />
        ))}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2">
        <Button size="lg" className="h-14 bg-brand-gradient font-display text-base" onClick={share}><Share2 /> Share score card</Button>
        <Button size="lg" variant="secondary" className="h-14 font-display text-base" asChild><Link to="/recess"><Gamepad2 /> Recess Rush</Link></Button>
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠ Mismatched playgroup</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.warn} Mixing groups can lead to a scuffle (a game risk, not a certainty). Matching size + temperament keeps rooms safe.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them safe</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const c = confirm; setConfirm(null); if (c && act((s) => assignRoom(s, c.dog.id, c.g, true))) setSel(null); }}>Place anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <footer className="mt-6 space-y-3 pb-4 text-center text-[11px] font-bold text-muted-foreground">
        <p>Game coins are free, have no cash value and are not connected to PAWtastic customer rewards. Progress is stored on this device only.</p>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost" size="sm"><RotateCcw /> Reset progress</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start over?</AlertDialogTitle>
              <AlertDialogDescription>This erases your daycare, coins, missions and earned bandanas on this device. It can't be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep playing</AlertDialogCancel>
              <AlertDialogAction onClick={() => { resetSave(); window.location.reload(); }}>Yes, reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </footer>
    </main>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
      <div className="min-w-0 flex-1">
        <div className="font-display font-bold text-secondary">{title}</div>
        <div className="text-xs font-bold text-muted-foreground">{sub}</div>
      </div>
      {children}
    </div>
  );
}
