import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BedDouble,
  Box,
  Clock,
  Coins,
  Gamepad2,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ACHIEVEMENTS,
  DECOR,
  FAVORITE_LABEL,
  adventureStatus,
  claimChapter,
  siteName as nameOfSite,
  upgradeInfo,
  GROUPS,
  claimWeekly,
  friendshipLevel,
  nextGoal,
  personalityOf,
  weekKey,
  weeklyChallenge,
  weeklyProgress,
  LOBBY_CAP,
  MAX_STAFF,
  SITES,
  UPGRADES,
  admitDog,
  assignRoom,
  assignSuite,
  bath,
  buyDecor,
  buyUpgrade,
  claimMission,
  createArrival,
  dailyMissions,
  daycareScore,
  fmtClock,
  fmtDur,
  groupOf,
  hasScuffle,
  hireCost,
  hireStaff,
  lobbyDogs,
  lobbyStatus,
  mismatchWarning,
  missionProgress,
  recoveryDogs,
  roomAtRisk,
  roomCapacity,
  roomDogs,
  roomHardBlock,
  separateDog,
  separateDogs,
  sites,
  suiteBlockReason,
  suiteCount,
  suiteDog,
  type Dog,
  type GameState,
  type GroupId,
  type Result,
} from "@/game/engine";
import { primaryAction, roomOptions, type EffectKind } from "@/game/actions";
import { resetSave, todayKey, useGame } from "@/game/store";
import { useEntitlements } from "@/lib/entitlements";
import { NAVY_STAR } from "@/lib/paidVisuals";
import { LOGO_URL, StaffSprite, bandanaColor } from "@/game/sprites";
import { SHARE_LINES, shareCard } from "@/game/share";
import { DogChip, Reason, Row, Meter, type Looks } from "@/components/game/parts";
import { AreaPanel, CarePanel, FrontDesk, type Run } from "@/components/game/CarePanel";
import { DaycareStage, type FocusPrompt, type StageHandle } from "@/components/game/DaycareStage";
import { GameHeader } from "@/components/game/GameHeader";
import type { FocusTarget, RoomHint, WorldPick } from "@/world/renderer";
import { setSettings, useSettings } from "@/lib/settings";
import { useShareContext } from "@/components/game/ShareSheet";
import { TEAM_COLORS, maybeAskForTeam, openTeamPicker } from "@/components/game/TeamPicker";
import { addTeamPoints } from "@/lib/team";
import { myReferralCode } from "@/lib/referral";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/daycare")({
  // ?preview=deluxe|ribbon shows a paid pack on your own daycare for a look. It's visual only, clearly
  // labelled, never saved, and never counts as owning the pack.
  validateSearch: (s: Record<string, unknown>): { preview?: "deluxe" | "ribbon" } =>
    s["preview"] === "deluxe" || s["preview"] === "ribbon" ? { preview: s["preview"] } : {},
  head: () => ({
    meta: [
      { title: "PAWtastic Daycare Tycoon — Run Your Own Dog Daycare" },
      {
        name: "description",
        content:
          "Free dog daycare sim from PAWtastic Academy. Check pups in, group them into playrooms by size and temperament, run private boarding suites and grow to two locations.",
      },
      { property: "og:title", content: "PAWtastic Daycare Tycoon" },
      {
        property: "og:description",
        content:
          "Walk your own 3D dog daycare: lobby check-in, playrooms by size & temperament, private boarding suites. Free to play.",
      },
    ],
  }),
  component: Daycare,
});

export const TUTORIAL = [
  "A customer just dropped off a pup! Tap “Check in” next to their name (the yellow bar), or tap the pup itself.",
  "Now move them to the playroom that matches BOTH their size and temperament — tap the pup, then “Move to …” (or tap the green ✓ room).",
  "Playtime! Tap the pup in its room and choose Play.",
  "Freshen them up — choose Bath. They'll trot over to the tub.",
  "Send a happy pup home with Check out. Happier pups pay more!",
  "Spend your coins on something you can see: open Decor and place a Leafy Plant (60 coins), or buy an Upgrade.",
];

type AreaSel =
  | { kind: "room"; group: GroupId }
  | { kind: "suite"; index: number }
  | { kind: "place"; place: string };

function tutorialNext(s: GameState): number {
  const t = s.tutorial;
  const st = s.stats;
  if (t === 0 && st.admitted > 0) return 1;
  if (
    t === 1 &&
    s.dogs.some((d) => d.checkedIn && (d.place.kind === "room" || d.place.kind === "suite"))
  )
    return 2;
  if (t === 1 && st.plays > 0) return 2;
  if (t === 2 && st.plays > 0) return 3;
  if (t === 3 && st.baths > 0) return 4;
  if (t === 4 && st.checkouts > 0) return 5;
  if (t === 5 && (s.decor.length > 0 || s.upgrades.length > 0)) return -1;
  return t;
}

function Daycare() {
  const { preview } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { state, act, set, paused, setPaused } = useGame();
  const settings = useSettings();
  // A preview is a short look, not an unlock: it ends on its own.
  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => navigate({ search: {} }), 90_000);
    return () => clearTimeout(t);
  }, [preview, navigate]);
  const { visuals: pv } = useEntitlements();
  const [sel, setSel] = useState<string | null>(null);
  const [area, setArea] = useState<AreaSel | null>(null);
  const [confirm, setConfirm] = useState<{ dog: Dog; g: GroupId; warn: string } | null>(null);
  const [focus, setFocus] = useState<FocusTarget>(null);
  const [tab, setTab] = useState<
    "missions" | "upgrades" | "decor" | "staff" | "regulars" | "awards"
  >("missions");
  const [no3d, setNo3d] = useState(false);
  // The header's Share sheet offers "Share my daycare card" while you're here.
  const shareRef = useRef<() => void>(() => {});
  const runShare = useCallback(() => shareRef.current(), []);
  useShareContext("daycare", { label: "📸 Share my daycare card", run: runShare });
  const stage = useRef<StageHandle>(null);
  const prevScuffles = useRef(0);
  const day = todayKey();
  const missions = useMemo(() => dailyMissions(day), [day]);

  const run: Run = useCallback(
    (apply, effect, dogId) => {
      const r = act(apply);
      if (r.ok && effect && dogId) stage.current?.effect(effect, dogId);
      if (r.ok && effect === "checkin") track("checkin_success", { tutorial: r.state.tutorial });
      // Team points for real care (capped per day); scuffle separations never earn points.
      if (r.ok && (effect === "checkin" || effect === "play" || effect === "bath" || effect === "checkout"))
        addTeamPoints(r.state.team, 1, effect);
      return r;
    },
    [act],
  );

  // Scuffle alert
  useEffect(() => {
    const n = state?.scuffles.length ?? 0;
    if (n > prevScuffles.current)
      toast.warning("💥 Scuffle in a playroom! Tap the pup or room and choose “Separate dogs”.");
    prevScuffles.current = n;
  }, [state?.scuffles.length]);

  // Tutorial progression (+ first-cycle measurement)
  useEffect(() => {
    if (!state || state.tutorial < 0) return;
    const next = tutorialNext(state);
    if (next !== state.tutorial) {
      set((x) => ({ ...x, tutorial: next }));
      track(next === -1 ? "tutorial_complete" : "tutorial_step", { step: next });
      if (state.tutorial === 4) track("first_care_cycle", {});
      if (next === -1)
        toast.success("Tutorial complete! Missions, upgrades and Recess Rush are waiting.");
    }
  }, [state, set]);

  // A brand-new daycare gets its first customer right away, so the first minute is never empty.
  const seeded = useRef(false);
  useEffect(() => {
    if (!state || seeded.current) return;
    seeded.current = true;
    // New players pick their team first — their daycare opens at that location.
    if (!state.team && state.stats.admitted === 0) maybeAskForTeam();
    if (state.tutorial === 0 && state.dogs.length === 0 && lobbyStatus(state.clockMin).open)
      act((s) => createArrival(s, Math.random), { quiet: true });
  }, [state, act]);

  const site = state && sites(state).includes(state.site) ? state.site : (state?.home ?? "hawthorne");
  const looks: Looks & { deluxe: boolean } = useMemo(
    () => ({
      bandana:
        pv["navy-star-bandana"] || preview === "ribbon"
          ? NAVY_STAR
          : bandanaColor(state?.equipped ?? null),
      star: pv["navy-star-bandana"] || preview === "ribbon",
      collar: pv["ribbon-collar"] || preview === "ribbon",
      deluxe: pv["deluxe-decor"] || preview === "deluxe",
    }),
    [pv, state?.equipped, preview],
  );
  const selected = state?.dogs.find((d) => d.id === sel) ?? null;

  const roomHints = useMemo(() => {
    const out: Partial<Record<GroupId, RoomHint>> = {};
    if (state && selected && selected.checkedIn && !selected.boarding)
      for (const o of roomOptions(state, selected)) out[o.group] = o.status;
    return out;
  }, [state, selected]);
  const suiteHints = useMemo(() => {
    if (!state) return [];
    return Array.from(
      { length: 3 },
      (_, i) =>
        (selected && selected.boarding && selected.checkedIn
          ? suiteBlockReason(state, selected, i)
            ? "block"
            : "fit"
          : null) as RoomHint | null,
    );
  }, [state, selected]);

  const requestRoom = useCallback(
    (dog: Dog, g: GroupId) => {
      const s = state;
      if (!s) return;
      const hard = roomHardBlock(s, dog, g);
      if (hard) {
        toast.error(hard);
        return;
      }
      const warn = mismatchWarning(dog, g);
      if (warn) {
        setConfirm({ dog, g, warn });
        return;
      }
      const r = run((x) => assignRoom(x, dog.id, g), "assign", dog.id);
      if (r.ok) setSel(null);
    },
    [state, run],
  );
  const requestSuite = useCallback(
    (dog: Dog, i: number) => {
      const r = run((x) => assignSuite(x, dog.id, i), "assign", dog.id);
      if (r.ok) setSel(null);
    },
    [run],
  );

  const selectDog = useCallback((id: string) => {
    setArea(null);
    setSel((cur) => (cur === id ? null : id));
  }, []);

  const onPick = useCallback(
    (p: WorldPick | null) => {
      if (!state) return;
      const cur = state.dogs.find((d) => d.id === sel) ?? null;
      if (!p) {
        setSel(null);
        setArea(null);
        return;
      }
      if (p.kind === "dog") {
        setArea(null);
        setSel(p.id);
        return;
      }
      if (p.kind === "room") {
        if (
          cur &&
          cur.checkedIn &&
          !cur.boarding &&
          !(cur.place.kind === "room" && cur.place.group === p.group)
        ) {
          requestRoom(cur, p.group);
          return;
        }
        setSel(null);
        setArea(p);
        return;
      }
      if (p.kind === "suite") {
        if (cur && cur.boarding && cur.checkedIn) {
          const why = suiteBlockReason(state, cur, p.index);
          if (why) toast.error(why);
          else requestSuite(cur, p.index);
          return;
        }
        setSel(null);
        setArea(p);
        return;
      }
      if (p.place === "desk") {
        const next = lobbyDogs(state, site).find((d) => !d.checkedIn);
        if (next) {
          setArea(null);
          setSel(next.id);
          return;
        }
      }
      if (p.place === "recovery" && cur && cur.place.kind !== "recovery") {
        run((s) => separateDog(s, cur.id), "separate", cur.id);
        return;
      }
      if (p.place === "bath" && cur && cur.checkedIn) {
        run((s) => bath(s, cur.id), "bath", cur.id);
        return;
      }
      setSel(null);
      setArea({ kind: "place", place: p.place });
    },
    [state, sel, site, requestRoom, requestSuite, run],
  );

  if (!state)
    return (
      <div className="grid min-h-dvh place-items-center font-display text-2xl text-primary">
        Opening the daycare…
      </div>
    );

  const lobbyNow = lobbyStatus(state.clockMin);
  const siteName = SITES.find((x) => x.id === site)!.name;
  const avgHappy = state.dogs.length
    ? state.dogs.reduce((a, d) => a + d.happiness, 0) / state.dogs.length
    : 100;
  const avgEnergy = state.staff.reduce((a, s) => a + s.energy, 0) / state.staff.length;
  const roomCap = roomCapacity(state);
  const nSuites = suiteCount(state);
  const lobby = lobbyDogs(state, site);
  const show3d = settings.view !== "list" && !no3d;
  const sheetOpen = !!selected || !!area;

  const doPrimary = (d: Dog) => {
    const a = primaryAction(state, d);
    if (!a.apply) return;
    if (a.id === "assign") {
      requestRoom(d, groupOf(d));
      return;
    }
    run(a.apply, a.effect as EffectKind, d.id);
  };

  // First-person contextual prompt
  let prompt: FocusPrompt = null;
  if (focus?.kind === "dog") {
    const d = state.dogs.find((x) => x.id === focus.id);
    if (d) {
      const a = primaryAction(state, d);
      prompt = {
        title: d.name,
        sub: `${d.size === "small" ? "Small" : "Large"} · ${d.temper} · ${Math.round(d.happiness)}% happy${d.checkedIn ? "" : " · not checked in"}`,
        label: a.label,
        disabled: !a.apply,
        ...(a.reason ? { reason: a.reason } : {}),
        run: () => doPrimary(d),
        more: () => selectDog(d.id),
      };
    }
  } else if (focus?.kind === "room") {
    const g = GROUPS.find((x) => x.id === focus.group)!;
    const n = roomDogs(state, site, g.id).length;
    if (hasScuffle(state, site, g.id) || roomAtRisk(state, site, g.id)) {
      prompt = {
        title: `${g.emoji} ${g.name}`,
        sub: "Mismatched group inside",
        label: "🫶 Separate dogs",
        run: () =>
          run(
            (s) => separateDogs(s, site, g.id),
            "separate",
            roomDogs(state, site, g.id).find((d) => groupOf(d) !== g.id)?.id,
          ),
      };
    } else if (
      selected &&
      selected.checkedIn &&
      !selected.boarding &&
      !(selected.place.kind === "room" && selected.place.group === g.id)
    ) {
      const hard = roomHardBlock(state, selected, g.id);
      prompt = {
        title: `${g.emoji} ${g.name} · ${n}/${roomCap}`,
        sub: mismatchWarning(selected, g.id) ?? "✓ Safe match",
        label: `Bring ${selected.name} here`,
        disabled: !!hard,
        ...(hard ? { reason: hard } : {}),
        run: () => requestRoom(selected, g.id),
      };
    } else {
      prompt = {
        title: `${g.emoji} ${g.name} · ${n}/${roomCap}`,
        sub: `Accepts ${g.size} · ${g.temper} pups`,
        label: "Room details",
        run: () => setArea({ kind: "room", group: g.id }),
      };
    }
  } else if (focus?.kind === "place" && focus.place === "desk") {
    const next = lobby.find((d) => !d.checkedIn);
    prompt = next
      ? {
          title: "Front desk",
          sub: `${lobby.filter((d) => !d.checkedIn).length} waiting`,
          label: `🛎️ Check in ${next.name}`,
          run: () => run(primaryAction(state, next).apply!, "checkin", next.id),
          more: () => selectDog(next.id),
        }
      : {
          title: "Front desk",
          sub: lobbyNow.open ? "No one waiting right now" : "Closed to drop-offs until 14:00",
          label: "Take a walk-in",
          disabled: !lobbyNow.open || lobby.length >= LOBBY_CAP,
          run: () => act((s) => admitDog(s, Math.random, false, site)),
        };
  } else if (focus?.kind === "suite") {
    const occ = suiteDog(state, site, focus.index);
    if (selected?.boarding && selected.checkedIn && !occ) {
      const why = suiteBlockReason(state, selected, focus.index);
      prompt = {
        title: `Suite ${focus.index + 1}`,
        sub: "Open",
        label: `🌙 Settle ${selected.name} here`,
        disabled: !!why,
        ...(why ? { reason: why } : {}),
        run: () => requestSuite(selected, focus.index),
      };
    } else
      prompt = {
        title: `Suite ${focus.index + 1}`,
        sub:
          focus.index >= nSuites ? "Not built yet" : occ ? `${occ.name} is staying here` : "Open",
        label: occ ? `Care for ${occ.name}` : "Suite details",
        run: () => (occ ? selectDog(occ.id) : setArea({ kind: "suite", index: focus.index })),
      };
  } else if (focus?.kind === "place") {
    const place = focus.place;
    if (selected && place === "bath")
      prompt = {
        title: "Bath area",
        label: `🛁 Bath for ${selected.name}`,
        run: () => run((s) => bath(s, selected.id), "bath", selected.id),
      };
    else if (selected && place === "recovery" && selected.place.kind !== "recovery")
      prompt = {
        title: "Recovery room",
        sub: "Always open",
        label: `🫶 Bring ${selected.name} to recovery`,
        run: () => run((s) => separateDog(s, selected.id), "separate", selected.id),
      };
    else
      prompt = {
        title: place === "bath" ? "Bath area" : place === "recovery" ? "Recovery room" : "Lobby",
        sub: "Select a pup first for actions here",
        label: "Area details",
        run: () => setArea({ kind: "place", place }),
      };
  }

  const goal = nextGoal(state);
  const wk = weekKey();
  const weekly = weeklyChallenge(wk);
  const weeklyP = weeklyProgress(state, weekly);

  const share = async () => {
    const score = daycareScore(state);
    const link = `${window.location.origin}/recess?challenge=${score}&seed=${day}&ref=${myReferralCode()}&utm_source=game_share&utm_medium=share&utm_campaign=pawtastic_tycoon`;
    const line = SHARE_LINES[score % SHARE_LINES.length]!;
    const res = await shareCard(
      {
        title: "My PAWtastic Daycare Score",
        big: String(score),
        lines: [
          line,
          `${state.stats.admitted} pups · ${state.staff.length} staff · ${state.upgrades.length} upgrades`,
        ],
        link,
        logoUrl: LOGO_URL,
      },
      `🐾 My PAWtastic daycare scored ${score}! ${line} Can you beat it?`,
    );
    if (res === "cancelled" || res === "failed") return;
    act((s) => ({ ok: true, state: { ...s, stats: { ...s.stats, shares: s.stats.shares + 1 } } }), {
      quiet: true,
    });
    track("share", { kind: "daycare_card", result: res });
    if (res === "downloaded") toast.success("Card downloaded & challenge link copied!");
    if (res === "copied") toast.success("Challenge link copied!");
  };

  shareRef.current = share;

  const mouseDrag = (id: string, x: number, y: number) => {
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointerup", up);
      if (Math.hypot(e.clientX - x, e.clientY - y) < 20) return;
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-drop]");
      const dog = state.dogs.find((d) => d.id === id);
      if (!el || !dog) return;
      const [kind = "", val = ""] = (el.dataset["drop"] ?? "").split(":");
      if (kind === "room") requestRoom(dog, val as GroupId);
      if (kind === "suite") requestSuite(dog, Number(val));
    };
    window.addEventListener("pointerup", up);
  };

  const chip = (d: Dog, passive = false) => (
    <DogChip
      key={d.id}
      dog={d}
      selected={sel === d.id}
      passive={passive}
      looks={looks}
      moving={!paused && !settings.reducedMotion}
      onSelect={selectDog}
      onMouseDrag={mouseDrag}
    />
  );

  return (
    <main
      className="px-3 pt-3"
      style={{ paddingBottom: sheetOpen ? "min(62svh, 560px)" : undefined }}
    >
      <GameHeader title="Daycare" subtitle={`${siteName} · rep ${Math.round(state.reputation)}`} />

      {preview && (
        <div
          role="status"
          className="sticky top-1 z-30 mt-2 flex items-center gap-2 rounded-2xl bg-accent p-2 pl-3 text-sm font-extrabold text-accent-foreground shadow-soft"
        >
          <span className="flex-1">
            👀 Previewing {preview === "deluxe" ? "Deluxe Daycare Decor" : "Blue Ribbon Style Pack"}{" "}
            for 90 seconds — not owned, not saved.
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="h-11"
            onClick={() => navigate({ search: {} })}
          >
            End preview
          </Button>
        </div>
      )}

      {paused && (
        <div
          role="status"
          className="sticky top-1 z-30 mt-2 flex items-center gap-2 rounded-2xl bg-secondary p-2 pl-3 text-sm font-bold text-secondary-foreground shadow-soft"
        >
          <span className="flex-1">
            ⏸ Clock paused — pups are safe. You can still check in and care for everyone.
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="h-11 bg-card text-secondary"
            onClick={() => setPaused(false)}
          >
            <Play /> Resume
          </Button>
        </div>
      )}

      <section
        aria-label="Game clock"
        className={`mt-2 flex items-center gap-2 rounded-2xl px-3 py-1.5 shadow-soft ${lobbyNow.open ? "bg-card" : "bg-secondary text-secondary-foreground"}`}
      >
        <Clock className="h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 leading-tight">
          <span className="font-display text-lg font-bold">{fmtClock(state.clockMin)}</span>{" "}
          <span className="text-[11px] font-extrabold opacity-70">
            Day {state.gameDay} · game clock
          </span>
          <div className={`text-[11px] font-extrabold ${lobbyNow.open ? "text-success" : ""}`}>
            {lobbyNow.open
              ? state.clockMin < 720
                ? `🟢 Drop-offs open · break in ${fmtDur(lobbyNow.minutesToChange)}`
                : `🟢 Drop-offs open · day ends in ${fmtDur(lobbyNow.minutesToChange)}`
              : `🔒 No drop-offs 12–2 · reopens in ${fmtDur(lobbyNow.minutesToChange)} · care continues`}
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-1 rounded-full bg-card px-2.5 py-1 font-display text-base font-bold text-secondary"
          aria-label={`${state.coins} coins`}
        >
          <Coins className="h-4 w-4 text-accent" aria-hidden /> {state.coins}
        </div>
        <Button
          size="icon"
          variant="secondary"
          className="h-11 w-11 shrink-0"
          aria-label={paused ? "Resume game clock" : "Pause game clock"}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
      </section>

      {sites(state).length > 1 && (
        <div
          className="mt-2 grid grid-cols-2 gap-1 rounded-full bg-card p-1 shadow-soft"
          role="tablist"
          aria-label="Location"
        >
          {sites(state).map((id) => ({ id, name: nameOfSite(id) })).map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={site === x.id}
              onClick={() => {
                set((s) => ({ ...s, site: x.id }));
                setSel(null);
                setArea(null);
              }}
              className={`min-h-11 rounded-full font-display font-bold ${site === x.id ? "bg-secondary text-secondary-foreground" : "text-secondary"}`}
            >
              {x.name}
            </button>
          ))}
        </div>
      )}

      {state.tutorial >= 0 && (
        <div
          role="status"
          className="mt-2 flex items-start gap-1 rounded-2xl border-2 border-primary bg-card py-1.5 pl-2.5 text-[13px] font-bold leading-snug text-secondary"
        >
          <p className="flex-1 py-1">
            <span className="mr-1 font-display text-primary">
              Step {state.tutorial + 1}/{TUTORIAL.length}
            </span>
            {TUTORIAL[state.tutorial]}
          </p>
          <button
            type="button"
            aria-label="Skip tutorial"
            title="Skip tutorial"
            className="grid h-11 w-11 shrink-0 place-items-center text-lg text-muted-foreground"
            onClick={() => set((s) => ({ ...s, tutorial: -1 }))}
          >
            ×
          </button>
        </div>
      )}

      {lobby.some((d) => !d.checkedIn) && (
        <section
          aria-label="Waiting for check-in"
          className="mt-2 flex gap-2 overflow-x-auto rounded-2xl bg-accent/90 p-1.5 shadow-soft"
        >
          {lobby
            .filter((d) => !d.checkedIn)
            .map((d) => (
              <div
                key={d.id}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-card py-1 pl-3 pr-1"
              >
                <button
                  type="button"
                  className="min-h-11 text-left text-sm font-extrabold text-secondary"
                  onClick={() => selectDog(d.id)}
                >
                  🛎️ {d.name}
                  <span className="block text-[10px] text-muted-foreground">
                    {d.size} · {d.temper}
                    {d.boarding ? " · boarder" : ""}
                  </span>
                </button>
                <Button
                  className="h-11 px-3 font-display"
                  onClick={() => run(primaryAction(state, d).apply!, "checkin", d.id)}
                  data-testid={`quick-checkin-${d.id}`}
                >
                  Check in
                </Button>
              </div>
            ))}
        </section>
      )}

      <div className="mt-2">
        {show3d ? (
          <DaycareStage
            ref={stage}
            state={state}
            site={site}
            selected={sel}
            looks={looks}
            roomHints={roomHints}
            suiteHints={suiteHints}
            onPick={onPick}
            onFocus={setFocus}
            prompt={prompt}
            onUnavailable={() => setNo3d(true)}
          />
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-3 shadow-soft">
            <p className="text-sm font-bold text-secondary">
              {no3d
                ? "3D view unavailable on this device — the list view below has every action."
                : "List view. Everything is below."}
            </p>
            {!no3d && (
              <Button className="h-11" onClick={() => setSettings({ view: "overhead" })}>
                <Box /> Show 3D
              </Button>
            )}
          </div>
        )}
      </div>

      <section className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl bg-card p-3 shadow-soft">
        <Meter label="Avg happiness" value={avgHappy} tone="bg-success" />
        <Meter label="Cleanliness" value={state.cleanliness} />
        <Meter label="Staff energy" value={avgEnergy} tone="bg-accent" />
        <div className="text-[11px] font-extrabold text-secondary">
          Pups here{" "}
          <span className="font-display text-lg">
            {state.dogs.filter((d) => d.site === site).length}
          </span>
        </div>
      </section>

      <div className="mt-2">
        <FrontDesk
          state={state}
          site={site}
          run={run}
          onSelect={selectDog}
          admit={(b) => act((s) => admitDog(s, Math.random, b, site))}
        />
      </div>

      {/* LIST VIEW — the accessible overview of every room (same state as the 3D world) */}
      <div className="mt-3 space-y-3 select-none" onClick={() => setSel(null)}>
        <section aria-label={`${siteName} lobby`} className="rounded-3xl bg-card p-3 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-secondary">🛎️ Lobby</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-extrabold text-secondary">
              {lobby.length}/{LOBBY_CAP}
            </span>
          </div>
          <div className="mt-2 flex min-h-16 flex-wrap items-end gap-1 rounded-2xl bg-sky/60 p-2">
            <div className="pointer-events-none flex gap-1">
              {state.staff.slice(0, 2).map((s) => (
                <StaffSprite key={s.id} name={s.name} tired={s.energy < 15} />
              ))}
            </div>
            {lobby.map((d) => chip(d))}
            {!lobby.length && (
              <p className="self-center text-xs font-bold text-muted-foreground">Lobby is empty.</p>
            )}
          </div>
        </section>

        <section aria-label="Playrooms">
          <h2 className="px-1 font-display text-lg font-bold text-secondary">
            🎾 Playrooms{" "}
            <span className="text-xs text-muted-foreground">grouped by size + temperament</span>
          </h2>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {GROUPS.map((g) => {
              const dogs = roomDogs(state, site, g.id);
              const hint = roomHints[g.id];
              const opt =
                selected && hint
                  ? roomOptions(state, selected).find((o) => o.group === g.id)
                  : null;
              const risk = roomAtRisk(state, site, g.id);
              const fight = hasScuffle(state, site, g.id);
              return (
                <div
                  key={g.id}
                  data-drop={`room:${g.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${g.name} playroom, accepts ${g.size} ${g.temper} pups, ${dogs.length} of ${roomCap}${selected && hint ? (hint === "fit" ? `, safe match for ${selected.name}` : hint === "warn" ? ", mismatch" : ", unavailable") : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selected && hint) requestRoom(selected, g.id);
                    else setArea({ kind: "room", group: g.id });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (selected && hint) requestRoom(selected, g.id);
                    }
                  }}
                  className={`relative min-h-32 rounded-2xl border-4 bg-card p-2 transition ${fight ? "border-destructive" : hint === "fit" ? "border-success ring-4 ring-success/40" : hint === "warn" ? "border-accent" : hint === "block" ? "border-border opacity-60" : risk ? "border-accent" : "border-primary"}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-display text-sm font-bold leading-tight text-secondary">
                      {fight ? (
                        <span className="inline-block animate-shake" aria-hidden>
                          💨
                        </span>
                      ) : (
                        g.emoji
                      )}{" "}
                      {g.name}
                    </span>
                    <span
                      className={`rounded-full px-1.5 text-[11px] font-extrabold ${dogs.length >= roomCap ? "bg-destructive text-destructive-foreground" : "bg-muted text-secondary"}`}
                    >
                      {dogs.length}/{roomCap}
                    </span>
                  </div>
                  <p className="text-[10px] font-extrabold text-muted-foreground">
                    Accepts {g.size} · {g.temper}
                  </p>
                  <div className="mt-1 flex flex-wrap items-end gap-0.5">
                    {dogs.map((d) => chip(d, !!selected && selected.id !== d.id))}
                    {state.cleanliness < 50 && dogs.length > 0 && (
                      <span className="pointer-events-none text-xl" aria-label="Needs mopping">
                        💩
                      </span>
                    )}
                  </div>
                  {risk && !fight && (
                    <p className="mt-1 rounded-lg bg-accent p-1 text-[10px] font-extrabold text-accent-foreground">
                      <AlertTriangle className="inline h-3 w-3" /> Tension — mismatched group
                    </p>
                  )}
                  {(fight || (risk && !selected)) && (
                    <Button
                      size="sm"
                      variant={fight ? "destructive" : "outline"}
                      className="mt-1 min-h-11 w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        run(
                          (s) => separateDogs(s, site, g.id),
                          "separate",
                          dogs.find((d) => groupOf(d) !== g.id)?.id,
                        );
                      }}
                    >
                      {fight ? "💨 Separate dogs" : "Move mismatch to recovery"}
                    </Button>
                  )}
                  {opt && opt.status !== "fit" && (
                    <p className="mt-1 text-[10px] font-extrabold text-secondary">
                      {opt.status === "warn" ? "⚠ " : <Lock className="inline h-3 w-3" />}{" "}
                      {opt.reason}
                    </p>
                  )}
                  {opt && opt.status === "fit" && (
                    <p className="mt-1 text-[10px] font-extrabold text-success">
                      ✓ Safe match — tap to move {selected!.name} here
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-label="Recovery room"
          className="rounded-3xl border-4 border-dashed border-accent bg-card p-3"
        >
          <h2 className="font-display text-base font-bold text-secondary">
            🫶 Staff recovery room{" "}
            <span className="text-xs text-muted-foreground">calm space · always open</span>
          </h2>
          <p className="text-[11px] font-bold text-muted-foreground">
            Separate from the public lobby. Works when the lobby is closed or full and when staff
            are tired.
          </p>
          <div className="mt-1 flex min-h-11 flex-wrap gap-1">
            {recoveryDogs(state, site).map((d) => chip(d))}
            {!recoveryDogs(state, site).length && (
              <span className="text-xs font-bold text-muted-foreground">
                Empty — everyone's calm.
              </span>
            )}
          </div>
        </section>

        <section aria-label="Boarding suites" className="rounded-3xl bg-secondary p-3 shadow-soft">
          <h2 className="font-display text-lg font-bold text-secondary-foreground">
            🌙 Boarding Suites <span className="text-xs opacity-80">one pup per private room</span>
          </h2>
          {nSuites === 0 ? (
            <p className="mt-2 flex items-center gap-2 rounded-2xl bg-card p-3 text-sm font-bold text-secondary">
              <Lock className="h-4 w-4" /> Build Boarding Suites in Upgrades (800 coins) to host
              overnight guests.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {Array.from({ length: nSuites }).map((_, i) => {
                const occ = suiteDog(state, site, i);
                const why = selected ? suiteBlockReason(state, selected, i) : null;
                const fits = !!selected && !why;
                return (
                  <div
                    key={i}
                    data-drop={`suite:${i}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Suite ${i + 1}, ${occ ? "occupied by " + occ.name : "open"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selected && fits) requestSuite(selected, i);
                      else if (selected && why && !occ) toast.error(why);
                      else setArea({ kind: "suite", index: i });
                    }}
                    className={`flex min-h-32 flex-col items-center justify-between rounded-2xl border-4 bg-card p-1.5 ${fits ? "border-success ring-4 ring-success/40" : "border-primary"}`}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-extrabold text-secondary">
                      <BedDouble className="h-3.5 w-3.5" /> Suite {i + 1}
                    </span>
                    {occ ? (
                      chip(occ, !!selected && selected.id !== occ.id)
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">Vacant</span>
                    )}
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-extrabold ${occ ? "bg-destructive text-destructive-foreground" : "bg-success text-primary-foreground"}`}
                    >
                      {occ ? "Occupied" : "Open"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="px-1 text-[10px] font-bold text-muted-foreground">
          Fictional game layout inspired by PAWtastic's lobby → playrooms → boarding flow. Room
          sizes, counts and positions are invented for play — not a floor plan of Hawthorne or
          Hillsdale, and not actual facility rules.
        </p>
      </div>

      <TeamAdventure state={state} onClaim={() => act(claimChapter)} />

      <section
        aria-label="Next goal"
        className="mt-4 rounded-2xl border-2 border-accent bg-card p-3 shadow-soft"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-secondary">
            🎯 Next goal: {goal.label}
          </h2>
          <span className="text-xs font-extrabold text-muted-foreground">
            {Math.round(goal.progress * 100)}%
          </span>
        </div>
        <p className="text-xs font-bold text-muted-foreground">{goal.detail}</p>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${goal.progress * 100}%` }}
          />
        </div>
      </section>

      <div
        className="mt-3 flex gap-1 overflow-x-auto rounded-full bg-card p-1 shadow-soft"
        role="tablist"
      >
        {(["missions", "upgrades", "decor", "staff", "regulars", "awards"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 flex-1 rounded-full px-3 text-sm font-extrabold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-secondary"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <section className="mt-3 space-y-2">
        {tab === "missions" && (
          <Row
            title={`🗓️ ${weekly.label}`}
            sub={`${weeklyP}/${weekly.target} · weekly reward ${weekly.reward} coins · new challenge every Monday`}
          >
            <Button
              className="h-11"
              disabled={state.weekClaimed || weeklyP < weekly.target}
              onClick={() => act((s) => claimWeekly(s, wk))}
            >
              {state.weekClaimed ? "Done ✓" : "Claim"}
            </Button>
          </Row>
        )}
        {tab === "missions" &&
          missions.map((m) => {
            const p = missionProgress(state, m);
            const claimed = state.missionsClaimed.includes(m.id);
            return (
              <Row key={m.id} title={m.label} sub={`${p}/${m.target} · reward ${m.reward} coins`}>
                <Button
                  className="h-11"
                  disabled={claimed || p < m.target}
                  onClick={() => act((s) => claimMission(s, m))}
                >
                  {claimed ? "Done ✓" : "Claim"}
                </Button>
              </Row>
            );
          })}
        {tab === "upgrades" &&
          UPGRADES.map((u) => {
            const owned = state.upgrades.includes(u.id);
            const locked = !!u.requires && !state.upgrades.includes(u.requires);
            return (
              <Row
                key={u.id}
                title={upgradeInfo(state, u).name}
                sub={
                  locked
                    ? `Requires ${UPGRADES.find((x) => x.id === u.requires)?.name}`
                    : owned
                      ? `${upgradeInfo(state, u).desc} · built — look for it in the 3D view`
                      : !owned && state.coins < u.cost
                        ? `${upgradeInfo(state, u).desc} · need ${u.cost - state.coins} more coins`
                        : upgradeInfo(state, u).desc
                }
              >
                <Button
                  className="h-11"
                  disabled={owned || locked || state.coins < u.cost}
                  onClick={() => act((s) => buyUpgrade(s, u.id))}
                >
                  {owned ? "Owned" : `${u.cost} 🪙`}
                </Button>
              </Row>
            );
          })}
        {tab === "decor" &&
          DECOR.map((d) => (
            <Row
              key={d.id}
              title={`${d.emoji} ${d.name}`}
              sub={
                state.decor.includes(d.id)
                  ? "Placed — visible in your rooms"
                  : state.coins < d.cost
                    ? `Need ${d.cost - state.coins} more coins · pups stay happy longer`
                    : "Pups stay happy longer"
              }
            >
              <Button
                className="h-11"
                disabled={state.decor.includes(d.id) || state.coins < d.cost}
                onClick={() => act((s) => buyDecor(s, d.id))}
              >
                {state.decor.includes(d.id) ? "Placed" : `${d.cost} 🪙`}
              </Button>
            </Row>
          ))}
        {tab === "staff" && (
          <>
            {state.staff.map((s) => (
              <Row
                key={s.id}
                title={s.name}
                sub={`Energy ${Math.round(s.energy)}% · rests on their own`}
              >
                <span className="text-2xl" aria-hidden>
                  {s.energy < 15 ? "😮‍💨" : "😄"}
                </span>
              </Row>
            ))}
            <Row
              title="Hire a team member"
              sub={
                state.staff.length >= MAX_STAFF
                  ? "Fully staffed"
                  : state.coins < hireCost(state.staff.length)
                    ? `Need ${hireCost(state.staff.length) - state.coins} more coins`
                    : "More hands = more care between rests"
              }
            >
              <Button
                className="h-11"
                disabled={
                  state.staff.length >= MAX_STAFF || state.coins < hireCost(state.staff.length)
                }
                onClick={() => act(hireStaff)}
              >
                {hireCost(state.staff.length)} 🪙
              </Button>
            </Row>
          </>
        )}
        {tab === "regulars" &&
          (state.guestBook.length ? (
            state.guestBook.map((g) => {
              const lvl = friendshipLevel(g.friendship);
              const p = personalityOf(g);
              return (
                <Row
                  key={`${g.name}-${g.breed}`}
                  title={`${g.name} · ${g.size} · ${g.temper}`}
                  sub={`${lvl.label} (${g.friendship}/100) · ${g.visits} visit${g.visits === 1 ? "" : "s"} · ${p.trait} · loves ${FAVORITE_LABEL[p.favorite]}`}
                />
              );
            })
          ) : (
            <Row
              title="No regulars yet"
              sub="Send happy pups home — their families come back, and friendship grows with every great visit."
            />
          ))}
        {tab === "awards" &&
          ACHIEVEMENTS.map((a) => (
            <Row
              key={a.id}
              title={`${state.achievements.includes(a.id) ? "🏆" : "🔒"} ${a.label}`}
              sub={state.achievements.includes(a.id) ? "Unlocked" : "Keep playing"}
            />
          ))}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2">
        <Button size="lg" className="h-14 bg-brand-gradient font-display text-base" onClick={share}>
          <Share2 /> Share daycare card
        </Button>
        <Button size="lg" variant="secondary" className="h-14 font-display text-base" asChild>
          <Link to="/recess">
            <Gamepad2 /> Recess Rush
          </Link>
        </Button>
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠ Mismatched playgroup</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.warn} Mixing groups can lead to a scuffle (a game risk, not a certainty —
              never based on breed). Matching size + temperament keeps rooms calm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep them safe</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c) {
                  const r = run((s) => assignRoom(s, c.dog.id, c.g, true), "assign", c.dog.id);
                  if (r.ok) setSel(null);
                }
              }}
            >
              Place anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!state.report}
        onOpenChange={(o) => {
          if (!o) set((s) => ({ ...s, report: null }));
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🌙 Day {state.report?.day} wrap-up</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm font-bold text-secondary">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted p-2">
                    <div className="font-display text-xl">{state.report?.admitted}</div>checked in
                  </div>
                  <div className="rounded-xl bg-muted p-2">
                    <div className="font-display text-xl">{state.report?.checkouts}</div>went home
                  </div>
                  <div className="rounded-xl bg-muted p-2">
                    <div className="font-display text-xl">{state.report?.earned}</div>coins
                  </div>
                  <div className="rounded-xl bg-muted p-2">
                    <div className="font-display text-xl">{state.report?.plays}</div>playtimes
                  </div>
                  <div className="rounded-xl bg-muted p-2">
                    <div className="font-display text-xl">{state.report?.baths}</div>baths
                  </div>
                  <div className="rounded-xl bg-muted p-2">
                    <div className="font-display text-xl">{state.report?.scuffles}</div>scuffles
                  </div>
                </div>
                <p>
                  {state.report && state.report.scuffles === 0
                    ? "A calm day — every room stayed matched. 🏅"
                    : "Tip: matching size + temperament prevents scuffles."}
                  {state.report?.bestPup ? ` Happiest pup: ${state.report.bestPup}.` : ""}
                </p>
                <p>
                  🎯 Next: {goal.label} — {goal.detail}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="min-h-11"
              onClick={() => {
                void share();
              }}
            >
              Share daycare card
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => set((s) => ({ ...s, report: null }))}
            >
              Start day {state.gameDay}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <footer className="mt-6 space-y-3 pb-4 text-center text-[11px] font-bold text-muted-foreground">
        <p>
          Game coins are free virtual currency with no cash value. They can't be exchanged for
          money, discounts or daycare credit and aren't connected to PAWtastic customer rewards.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="min-h-11">
              <RotateCcw /> Reset progress
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start over?</AlertDialogTitle>
              <AlertDialogDescription>
                This erases your daycare, coins, missions and earned bandanas on this device. Paid
                packs stay on your account. It can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep playing</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  resetSave();
                  setSel(null);
                }}
              >
                Yes, reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </footer>

      {sheetOpen && (
        <div
          className="fixed inset-x-0 z-40 mx-auto max-w-xl px-2"
          style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          <div
            data-testid="sheet"
            className="max-h-[min(62svh,540px)] overflow-y-auto overscroll-contain rounded-t-3xl"
          >
            {selected ? (
              <CarePanel
                state={state}
                dog={selected}
                looks={looks}
                run={run}
                requestRoom={requestRoom}
                requestSuite={requestSuite}
                onClose={() => setSel(null)}
              />
            ) : area ? (
              <AreaPanel
                state={state}
                site={site}
                area={area}
                onSelect={selectDog}
                run={run}
                onClose={() => setArea(null)}
              />
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}

export type { Result };

/** The player's team adventure (fictional chapters), or a prompt to pick a team. */
function TeamAdventure({ state, onClaim }: { state: GameState; onClaim: () => void }) {
  const st = adventureStatus(state);
  if (!state.team || !st) {
    return (
      <section aria-label="Team adventure" className="mt-4 flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
        <p className="min-w-0 flex-1 text-sm font-bold text-secondary">Pick Team Hawthorne or Team Hillsdale to start your team adventure.</p>
        <Button className="h-11 shrink-0" onClick={openTeamPicker}>Pick team</Button>
      </section>
    );
  }
  const c = TEAM_COLORS[state.team];
  return (
    <section aria-label="Team adventure" className={`mt-4 rounded-2xl border-2 bg-card p-3 shadow-soft ring-2 ${c.ring}`}>
      <p className={`text-xs font-extrabold uppercase tracking-wide ${c.text}`}>Team {nameOfSite(state.team)} adventure · fictional story</p>
      <h2 className="font-display text-base font-bold text-secondary">
        “{st.adventure.title}”{st.done ? " — complete! 🏅" : ` · chapter ${st.chapter + 1}/${st.adventure.chapters.length}: ${st.current!.title}`}
      </h2>
      {st.current ? (
        <>
          <p className="text-xs font-bold text-muted-foreground">{st.chapter === 0 ? `${st.adventure.intro} ` : ""}{st.current.story}</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${c.bg}`} style={{ width: `${(st.progress / st.current.target) * 100}%` }} />
            </div>
            <span className="text-xs font-extrabold text-secondary">{st.progress}/{st.current.target}</span>
            <Button className="h-11" disabled={st.progress < st.current.target} onClick={onClaim} data-testid="claim-chapter">
              {st.progress < st.current.target ? `+${st.current.reward}` : `Claim +${st.current.reward}`}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs font-bold text-muted-foreground">You earned the Team {nameOfSite(state.team)} Bandana — equip it in the Style Shop.</p>
      )}
    </section>
  );
}
