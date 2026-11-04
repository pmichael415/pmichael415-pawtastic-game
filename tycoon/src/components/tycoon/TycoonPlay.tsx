// The playable new Daycare Tycoon: status bar, guide, 3D stage with build mode and edit panels, and the list view.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { diagOn, recordUi, setDiag as setDiagnostics } from "@/tycoon/diag";
import { DiagOverlay, TestBanner, TestTools, qualityLabel } from "./TestTools";
import { toast } from "sonner";
import { Hammer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setSettings, useSettings } from "@/lib/settings";
import { useEntitlementsMaybe } from "@/lib/entitlements";
import { PAID_ITEMS, type PaidItemId } from "@/lib/paidVisuals";
import { setOwnedPaid } from "@/tycoon/paid";
import { paintRoom } from "@/tycoon/build";
import { markPainted } from "@/tycoon/guide";
import { fac } from "@/tycoon/state";
import { deskTile } from "@/tycoon/team";
import { onGetCoins, setTourControls, tycoonStore, useTycoon, type ActOpts, type ActResult } from "@/tycoon/store";
import { productById } from "@/lib/catalog";
import { liveCollect } from "@/lib/purchases/live";
import { BuySheet } from "@/components/purchases/BuySheet";
import { addedMessage, useCheckoutReturn } from "@/components/purchases/useCheckoutReturn";
import { DaycareShop } from "./DaycareShop";
import { CoachBubble } from "./CoachBubble";
import { FallbackNotice, type FallbackReason } from "./FallbackNotice";
import type { Diagnostics } from "./TycoonStage";
import { ExpansionCard } from "./ExpansionCard";
import { FrontDesk } from "./FrontDesk";
import { RoomsStrip } from "./RoomsStrip";
import { ExpansionSpotBar } from "./ExpansionSpotBar";
import { expansionSpots, type ExpansionId } from "@/tycoon/expansion";
import { ObjectiveBar } from "./ObjectiveBar";
import { StaffPanel } from "./StaffPanel";
import { TeamSheet } from "./TeamSheet";
import { TodayStrip } from "./TodayStrip";
import { objectives } from "@/tycoon/objectives";
import { groupName, type GroupId } from "@/game/engine";
import { waitStage } from "@/tycoon/waiting";
import { MOMENT_ASK } from "@/tycoon/moments";
import { StartCard } from "./StartCard";
import { TycoonMap } from "./TycoonMap";
import { GUIDE_REWARD } from "@/tycoon/catalog";
import type { Controls } from "@/tycoon/controls";
import { isFreshSave } from "@/tycoon/start";
import { startTour, tourHolds } from "@/tycoon/tour";
import { lobbyDogs } from "@/tycoon/run";
import { music, sound } from "@/tycoon/sound";
import type { Facility, TDog } from "@/tycoon/types";
import type { TPick } from "@/tycoon/render/world";
import type { TResult, TycoonState } from "@/tycoon/types";
import { BuildToolbar, useBuild, type FxFn } from "./BuildToolbar";
import { DayReport } from "./DayReport";
import { FinancesSheet } from "./FinancesSheet";
import { MoneyBanner } from "./MoneyBanner";
import { SignCard } from "./SignCard";
import { CheckoutContext, DogPanel } from "./DogPanel";
import { PickupSheet } from "./PickupSheet";
import { ReceiptCard } from "./ReceiptCard";
import { ReputationSheet } from "./ReputationSheet";
import { BlockersCard } from "./BlockersCard";
import { incomeBlockers } from "@/tycoon/blockers";
import { pickupView } from "@/tycoon/pickup";
import { checkout } from "@/tycoon/run";
import { today } from "@/tycoon/business";
import type { Outcome } from "@/tycoon/types";
import { EditPanel } from "./EditPanel";
import { GuideCard } from "./GuideCard";
import { WeeklyCard } from "./WeeklyCard";
import { LevelUp } from "./LevelUp";
import { StageUp } from "./StageUp";
import { facilityStage } from "@/tycoon/stages";
import { ListView } from "./ListView";
import { PaintSheet } from "./PaintSheet";
import { RunHud } from "./RunHud";
import { TycoonStage, type TycoonStageHandle } from "./TycoonStage";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
type Sel = { kind: "room" | "thing" | "dog" | "staff"; id: string } | null;

/** Owned paid visuals from fresh server entitlements (never from the save). Empty for guests and on errors. */
function useOwnedPaid(): ReadonlySet<PaidItemId> {
  const ent = useEntitlementsMaybe();
  const key = ent && ent.status === "ready" ? PAID_ITEMS.filter((i) => ent.owned.has(i.pack)).map((i) => i.id).join(",") : "";
  return useMemo(() => new Set(key ? (key.split(",") as PaidItemId[]) : []), [key]);
}

export function TycoonPlay() {
  const { state, act, set, paused, setPaused, spectator, playHere } = useTycoon();
  const owned = useOwnedPaid();
  // The engine reads ownership from memory while this page runs; it fails closed when the page goes away.
  setOwnedPaid(owned);
  useEffect(() => () => setOwnedPaid(new Set()), []);
  if (!state)
    return (
      <div className="grid min-h-[40svh] place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading your daycare" />
      </div>
    );
  return <Play state={state} act={act} set={set} paused={paused} setPaused={setPaused} spectator={spectator} playHere={playHere} />;
}

/** Where a pup is, as a square (for effects). */
function dogTile(f: Facility, d: TDog): { c: number; r: number } | null {
  if (d.place.kind === "bed") {
    const bed = f.items.find((i) => i.uid === (d.place as { bed: string }).bed);
    return bed ? { c: bed.c, r: bed.r } : null;
  }
  const room = d.place.kind === "lobby" ? f.rooms.find((r) => r.type === "lobby") : f.rooms.find((r) => r.uid === (d.place as { room: string }).room);
  return room ? { c: room.c + Math.floor(room.w / 2), r: room.r + Math.floor(room.d / 2) } : null;
}

function Play({ state, act: rawAct, set, paused, setPaused, spectator = false, playHere = () => {} }: { state: TycoonState; act: Act; set: (fn: (s: TycoonState) => TycoonState) => void; paused: boolean; setPaused: (p: boolean) => void; spectator?: boolean; playHere?: () => void }) {
  const settings = useSettings();
  const [no3d, setNo3d] = useState<FallbackReason | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [stageKey, setStageKey] = useState(0); // "Try 3D again" mounts a fresh 3D view
  const [building, setBuilding] = useState(false);
  // private diagnostics: how long this screen takes to render (measured only when Diagnostics is on)
  const renderStart = diagOn() ? performance.now() : 0;
  useLayoutEffect(() => {
    if (renderStart) recordUi(performance.now() - renderStart);
  });
  const [sel, setSel] = useState<Sel>(null);
  const [askSell, setAskSell] = useState(false);
  const [painting, setPainting] = useState<string | null>(null);
  const [finances, setFinances] = useState(false);
  const [shop, setShop] = useState(false);
  const [buyDecor, setBuyDecor] = useState(false);
  // Purchase prompts wait until the guided tour reaches free play (spec §6); the hub Shop tab is always there.
  const holding = tourHolds(state);
  // Before a start is picked, only the start card asks for anything (no checklist, shop, coin buttons or Build).
  const preTour = isFreshSave(state);
  const quiet = holding || preTour;
  useEffect(() => {
    onGetCoins(quiet ? null : () => setShop(true));
    return () => onGetCoins(null);
  }, [quiet]);
  const tourDone = !!state.tour?.done;
  const wasDone = useRef(tourDone);
  useEffect(() => {
    if (tourDone && !wasDone.current) {
      toast.success(`Guide complete! +${GUIDE_REWARD} coins — drop-offs and the day clock start now.`);
      if (!settings.reducedMotion) fx("confetti", "hud");
    }
    wasDone.current = tourDone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourDone]);
  // When the tour starts, bring the coach (and the daycare right below it) into view.
  const coachRef = useRef<HTMLDivElement>(null);
  const touring = !!state.tour;
  const wasTouring = useRef(touring);
  useEffect(() => {
    const el = coachRef.current?.querySelector<HTMLElement>('section[aria-label="Guide"]');
    if (touring && !wasTouring.current && el) {
      // land just below the sticky status bar
      const hud = document.querySelector('section[aria-label="Daycare status"]')?.getBoundingClientRect().height ?? 0;
      el.style.scrollMarginTop = `${Math.round(hud) + 12}px`;
      el.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
    wasTouring.current = touring;
  }, [touring]);
  useCheckoutReturn("daycare-next");
  // Purchases waiting for this game are collected when a signed-in player opens it (not on a return from Stripe,
  // which useCheckoutReturn handles and reports).
  const [returning] = useState(() => typeof window !== "undefined" && /[?&]checkout=/.test(window.location.search));
  const entForShop = useEntitlementsMaybe();
  const signedIn = !!entForShop && entForShop.status !== "guest" && entForShop.status !== "loading";
  useEffect(() => {
    if (!signedIn || returning) return;
    let live = true;
    liveCollect("daycare-next")
      .then((r) => {
        if (live && r.added.some((x) => x.sign === 1)) toast.success(addedMessage(r.added));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [signedIn, returning]);
  const [sign, setSign] = useState<string | null>(null);
  const stage = useRef<TycoonStageHandle>(null);
  const f = fac(state);
  // A panel whose pup went home (or whose room or item is gone) closes instead of staying empty.
  const selGone = !!sel && (sel.kind === "dog" ? !f.dogs.some((d) => d.id === sel.id) : sel.kind === "staff" ? !f.staff.some((x) => x.id === sel.id) : sel.kind === "room" ? !f.rooms.some((r) => r.uid === sel.id) : !f.items.some((i) => i.uid === sel.id));
  useEffect(() => {
    if (selGone) setSel(null);
  }, [selGone]);
  // ---- pickup: the sheet for complaints, a receipt for every visit that ends, the owner's arrival ----
  const [pickup, setPickup] = useState<{ id: string; exitBath: boolean } | null>(null);
  const [repOpen, setRepOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [diagUi, setDiagUi] = useState(diagOn());
  // A new facility stage is celebrated once: worked out from the layout, compared with the highest seen since the
  // screen opened (so loading a grown daycare, or reopening a closed room, isn't celebrated again).
  const stageNow = facilityStage(fac(state));
  const bestStage = useRef(stageNow.index);
  const [stageUp, setStageUp] = useState(false);
  useEffect(() => {
    if (stageNow.index > bestStage.current) setStageUp(true);
    bestStage.current = Math.max(bestStage.current, stageNow.index);
  }, [stageNow.index]);
  // Choosing where a new room goes: which option, and which of its offered spots is shown.
  const [placing, setPlacing] = useState<{ id: ExpansionId; i: number } | null>(null);
  // A level-up, a new stage, the day's report or choosing a spot covers the screen: time stops until it's done (no one
  // waits while you can't act or are deciding).
  // Building pauses the day too (empire §3), and leaving restores whatever it was before.
  const blocking = (!tourHolds(state) && (state.pendingLevel != null || stageUp || placing !== null || building)) || !!fac(state).report;
  // A hold, not a pause (audit finding 1): time waits whatever the Pause/Resume button says, and the player's own
  // pause choice is untouched, so leaving restores it.
  useEffect(() => {
    tycoonStore.hold("screen", blocking);
  }, [blocking]);
  useEffect(() => () => tycoonStore.leaveHeld(), []);
  const holdWhy = building ? "you build" : placing !== null ? "you choose a spot" : fac(state).report ? "you read the day's report" : "this is open";
  // A family kindly rescheduled: say so once, and what to do next time.
  const courtesyKeyOf = (c: ReturnType<typeof fac>["courtesy"]) => (c ? `${c.day}:${c.why}:${c.names.join(",")}` : "none");
  const courtesyKey = useRef(courtesyKeyOf(fac(state).courtesy)); // what was already there on load isn't repeated
  useEffect(() => {
    const c = fac(state).courtesy;
    const key = courtesyKeyOf(c);
    if (courtesyKey.current === key) return;
    courtesyKey.current = key;
    if (!c) return;
    const who = c.names.at(-1)!;
    if (c.why === "intro") toast.info(`${who}'s family was kindly rescheduled — no charge, no hard feelings on your first day. Next time, check families in within 60 game minutes, or tap "Can't take today" if there's no spot.`);
    else toast.info(`${who}'s family was still waiting at closing — rescheduled for another day, no charge.`);
  }, [state]);
  const [expandOpen, setExpandOpen] = useState(false);
  const spots = placing ? expansionSpots(state, placing.id) : [];
  // the same spot the bar shows (its index is kept inside the list if the list gets shorter)
  const spotIndex = placing ? Math.min(placing.i, Math.max(0, spots.length - 1)) : 0;
  const spot = placing ? (spots[spotIndex] ?? null) : null;
  const stageWrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!spot) return;
    stage.current?.focus?.(spot.c + Math.floor(spot.w / 2), spot.r + Math.floor(spot.d / 2)); // (no 3D view: the 2D map shows the whole lot)
    stageWrap.current?.scrollIntoView?.({ block: "center", behavior: settings.reducedMotion ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing?.id, spot?.c, spot?.r]);
  const [expandSaved, setExpandSaved] = useState(false);
  // Fair warnings for families kept waiting (staff design §4), and staff who need the player — each said once.
  const warned = useRef(new Map<string, string>());
  useEffect(() => {
    if (tourHolds(state)) return;
    const g = fac(state);
    for (const d of g.dogs) {
      const w = waitStage(g, d);
      if (!w || w.stage === "waiting") continue;
      const key = `${w.kind}:${w.stage}`;
      if (warned.current.get(d.id) === key) continue;
      warned.current.set(d.id, key);
      const owner = d.visit?.owner ?? "A family";
      const first = g.introDay === g.day;
      const msg =
        w.kind === "dropoff"
          ? w.stage === "impatient"
            ? `${owner} has waited ${w.minutes} game min to drop off ${d.name} — tap ${d.name}, then Check in (or "Can't take today").`
            : `${owner} is upset — check ${d.name} in or turn them away. ${first ? `On your first day they'll be rescheduled, not upset, in ${w.leavesIn} game min.` : `They'll leave in ${w.leavesIn} game min.`}`
          : w.stage === "impatient" ? `${owner} has waited ${w.minutes} game min for ${d.name} — tap ${d.name}, then Check out.` : `${owner} will leave in ${w.leavesIn} game min — check ${d.name} out.`;
      if (w.stage === "upset") toast.warning(msg);
      else toast(msg);
    }
    for (const st of g.staff) {
      if (!st.note || !/needs you/.test(st.note)) continue;
      const key = `note:${st.note}`;
      if (warned.current.get(st.id) === key) continue;
      warned.current.set(st.id, key);
      toast.info(`${st.name}: ${st.note}`);
    }
  }, [state]);
  const [receipt, setReceipt] = useState<Outcome | null>(null);
  // keyed on the latest outcome itself (the record keeps only the last 30, so its length stops growing)
  const lastOut = f.outcomes?.at(-1) ?? null;
  const lastKey = lastOut ? `${lastOut.dog}|${lastOut.day}|${lastOut.min}|${lastOut.how}|${lastOut.total}|${(f.outcomes ?? []).length}` : "";
  const seenOutcome = useRef<string | null>(null);
  /** When the player's own tap last paid a checkout (its coins already flew from the pup). */
  const playerPaid = useRef(0);
  useEffect(() => {
    if (seenOutcome.current !== null && lastKey && lastKey !== seenOutcome.current) {
      setReceipt(lastOut);
      // a payment staff took (or a family collected at closing): coins fly at the desk, as when you check out
      if (lastOut && lastOut.total > 0 && Date.now() - playerPaid.current > 400) {
        fx("coins", deskTile(fac(tycoonStore.getState()!)));
        sound.play("coins");
      }
    }
    seenOutcome.current = lastKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey]);
  // The receipt waits while a panel, the pickup sheet or the spot bar is open (it would cover their buttons on a phone).
  const showReceipt = !!receipt && !sel && !placing && !pickup;
  useEffect(() => {
    if (!showReceipt) return;
    const t = setTimeout(() => setReceipt(null), 6000);
    return () => clearTimeout(t);
  }, [receipt, showReceipt]);
  const ownersHere = f.dogs.filter((d) => d.visit?.ownerHere != null).map((d) => d.id).join(",");
  const seenOwners = useRef<Set<string> | null>(null);
  useEffect(() => {
    const here = new Set(ownersHere ? ownersHere.split(",") : []);
    if (seenOwners.current)
      for (const id of here)
        if (!seenOwners.current.has(id)) {
          const d = f.dogs.find((x) => x.id === id);
          if (d?.visit) {
            toast(`${d.visit.owner} is here to pick up ${d.name}`);
            sound.play("checkin");
          }
        }
    seenOwners.current = here;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownersHere]);
  // A pup asks for you (personal moments): said once per moment, with a way straight to the pup. Moments already
  // open when the screen loads aren't repeated — the ✨ over the pup shows them.
  const momentsOpen = f.dogs.filter((d) => d.visit?.moment?.state === "open").map((d) => `${d.id}@${d.visit!.moment!.day}:${d.visit!.moment!.at}`).join(",");
  const seenMoments = useRef<Set<string> | null>(null);
  const asking = f.dogs.filter((d) => d.visit?.moment?.state === "open");
  const kept = (() => {
    const all = f.dogs.map((d) => ({ d, w: waitStage(f, d) })).filter((x): x is { d: TDog; w: NonNullable<ReturnType<typeof waitStage>> } => !!x.w && x.w.stage !== "waiting" && !!x.d.visit);
    return all.sort((a, b) => (b.w.stage === "upset" ? 1 : 0) - (a.w.stage === "upset" ? 1 : 0) || b.w.minutes - a.w.minutes)[0] ?? null;
  })();
  useEffect(() => {
    const here = new Set(momentsOpen ? momentsOpen.split(",") : []);
    if (seenMoments.current)
      for (const key of here)
        if (!seenMoments.current.has(key)) {
          const id = key.split("@")[0]!;
          const d = f.dogs.find((x) => x.id === id);
          const m = d?.visit?.moment;
          if (d && m) {
            toast(`✨ ${d.name} ${MOMENT_ASK[m.kind]}`, { action: { label: `Go to ${d.name}`, onClick: () => { setPlacing(null); setSel({ kind: "dog", id: d.id }); } } });
            sound.play("sparkle");
          }
        }
    seenMoments.current = here;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentsOpen]);
  // Families who asked for a kind of pup you have no playroom for: said once per kind a day, with the way to grow.
  const askedKeys = (() => {
    const a = f.asked && f.asked.day === f.day ? f.asked.groups : {};
    return (Object.keys(a) as GroupId[]).filter((g) => (a[g] ?? 0) > 0).map((g) => `${f.day}:${g}`).join(",");
  })();
  const seenAsked = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = askedKeys ? askedKeys.split(",") : [];
    if (seenAsked.current)
      for (const k of keys)
        if (!seenAsked.current.has(k)) {
          const g = groupName(k.split(":")[1] as GroupId);
          toast(`A ${g} family asked about daycare — you have no ${g} playroom yet, so they booked elsewhere.`, { action: { label: "See options", onClick: () => setExpandOpen(true) } });
        }
    seenAsked.current = new Set([...(seenAsked.current ?? []), ...keys]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedKeys]);
  const onCheckout = (id: string, exitBath: boolean) => {
    const st = tycoonStore.getState();
    if (!st || !fac(st).dogs.some((d) => d.id === id)) return;
    const view = pickupView(st, id, exitBath);
    if (view.assessment.complaints.some((c) => !c.remedy)) setPickup({ id, exitBath });
    else act((s) => checkout(s, id, exitBath));
  };
  const blockers = incomeBlockers(state);
  const stalled = blockers.length > 0 && (state.coins < 0 || blockers.some((b) => /^(group-|full-|lobby-full)/.test(b.id)) || (f.open && f.clockMin >= 10 * 60 && Object.values(today(f).income).every((n) => !n)));

  const fx: FxFn = (k, at) => stage.current?.fx(k, at);
  /** After an expansion: close the card and show what was built or improved (its panel opens, confetti on it). */
  const showBuilt = (room: string | null) => {
    setExpandSaved(true);
    setExpandOpen(false);
    const r = room ? fac(tycoonStore.getState()!).rooms.find((x) => x.uid === room) : null;
    if (r) {
      setSel({ kind: "room", id: r.uid });
      if (!settings.reducedMotion) fx("confetti", { c: r.c + Math.floor(r.w / 2), r: r.r + Math.floor(r.d / 2) });
    }
  };
  /** Every action, plus its sound and effect: coins fly at checkout, building thunks, selling pops, upgrades sparkle. */
  const act: Act = (fn, opts) => {
    const before = tycoonStore.getState();
    const r = rawAct(fn, opts);
    if (!r.ok) {
      if (!opts?.quiet) sound.play("error"); // a soft bonk, never harsh
      return r;
    }
    if (!before) return r;
    const a = fac(before);
    const z = fac(r.state);
    const count = (x: Facility) => x.rooms.length + x.items.length;
    // care sounds: a doorbell at check-in, a boing at playtime, bubbles at a bath, a chime in the calm-down room
    const calmNow = (x: Facility) => x.dogs.filter((d) => d.place.kind === "calm").length;
    if (z.stats.admitted > a.stats.admitted) sound.play("checkin");
    if (z.stats.plays > a.stats.plays) sound.play("playtime");
    if (z.stats.baths > a.stats.baths && z.stats.checkouts === a.stats.checkouts) sound.play("bath");
    if (calmNow(z) > calmNow(a)) sound.play("calm");
    // a moment answered: hearts over the pup and a happy chime
    const answered = z.dogs.find((d) => d.visit?.moment?.state === "done" && a.dogs.find((x) => x.id === d.id)?.visit?.moment?.state === "open");
    if (answered) {
      const at = dogTile(z, answered);
      if (at) fx("hearts", at);
      sound.play("playtime");
      sound.play("sparkle");
    }
    if (z.stats.checkouts > a.stats.checkouts) {
      playerPaid.current = Date.now();
      const gone = a.dogs.find((d) => !z.dogs.some((x) => x.id === d.id));
      const at = gone ? dogTile(a, gone) : null;
      if (at) fx("coins", at);
      sound.play("coins");
    } else if (z.items.some((i) => (a.items.find((x) => x.uid === i.uid)?.level ?? i.level) < i.level)) sound.play("sparkle");
    else if (count(z) > count(a)) sound.play("thunk");
    else if (count(z) < count(a)) sound.play("pop");
    if (r.unlocked?.length) {
      sound.play("sparkle");
      fx("sparkle", "hud");
    }
    return r;
  };
  const b = useBuild(state, act, fx);

  // Rush hour: 3+ pups waiting picks up the music and shows a badge; clearing it fast pays "Smooth operator!".
  const waiting = lobbyDogs(f).length;
  const wasRush = useRef(false);
  useEffect(() => {
    const rush = waiting >= 3;
    if (rush && !wasRush.current) toast("Rush hour! Get those pups settled.");
    wasRush.current = rush;
    music.setIntensity(rush ? 1 : 0);
  }, [waiting]);
  // "Daycare Day" while this screen is open. The engine starts it with the first tap (browsers require one), stops
  // it when Music is switched off, and pauses it while the tab is hidden.
  useEffect(() => {
    music.start();
    return () => music.stop();
  }, []);
  // A little yip when a new pup arrives at the lobby (not for pups already there when the game opens).
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(f.dogs.map((d) => d.id));
    if (known.current && f.dogs.some((d) => d.place.kind === "lobby" && !known.current!.has(d.id))) sound.play("arrive");
    known.current = ids;
  }, [f.dogs]);
  const show3d = settings.view !== "list" && !no3d;
  const controls: Controls = settings.view === "list" ? "list" : no3d ? "map" : "3d";
  useEffect(() => setTourControls(controls), [controls]);
  const ent = useEntitlementsMaybe();
  const star = !!ent?.visuals["navy-star-bandana"];
  const looks = useMemo(() => (star ? { bandana: "#1c2f52" } : {}), [star]);

  const onPick = (p: TPick | null) => {
    if (placing) return; // choosing a spot: the bar below does the choosing, taps just look around
    if (building && b.onPick(p)) return;
    if (building && b.ui.tool === "paint") {
      if (p?.kind === "room") setPainting(p.uid);
      return;
    }
    setAskSell(building && b.ui.tool === "sell");
    if (!p || p.kind === "tile" || p.kind === "edge") return setSel(null);
    if (!building && p.kind === "thing" && f.items.find((i) => i.uid === p.uid)?.kind === "sign") {
      setSel(null);
      return setSign(p.uid);
    }
    setSel(p.kind === "dog" || p.kind === "staff" ? { kind: p.kind, id: p.id } : { kind: p.kind, id: p.uid });
    sound.play("select");
  };

  const pickedDog = sel?.kind === "dog" ? f.dogs.find((d) => d.id === sel.id) ?? null : null;
  const pickedStaff = sel?.kind === "staff" ? f.staff.find((x) => x.id === sel.id) ?? null : null;
  // selecting a pup shows where it is: the camera goes to it (once per selection, not on every tick)
  const pickedTile = pickedDog ? dogTile(f, pickedDog) : null;
  useEffect(() => {
    if (pickedTile) stage.current?.focus?.(pickedTile.c, pickedTile.r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedDog?.id]);
  const paintTarget = painting ? f.rooms.find((r) => r.uid === painting) ?? null : null;

  return (
    <CheckoutContext.Provider value={onCheckout}>
    <div className="space-y-3" style={{ paddingBottom: sel ? "min(48svh, 440px)" : undefined }}>
      {spectator && (
        <section aria-label="Open in another tab" className="flex items-center gap-3 rounded-2xl border border-accent bg-card p-3 shadow-soft">
          <p className="min-w-0 flex-1 text-sm text-secondary">Your daycare is open in another tab, so time and costs run there — not here.</p>
          <Button className="h-11 shrink-0" onClick={playHere}>Play here</Button>
        </section>
      )}
      <TestBanner state={state} />
      {paused && !blocking && !spectator && (
        <section aria-label="Paused" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-secondary shadow-soft">
          <p className="min-w-0 flex-1">Paused — game time stops while you're away, so nothing can go wrong.</p>
          <Button className="h-11 shrink-0" onClick={() => setPaused(false)}>Resume</Button>
        </section>
      )}
      <RunHud state={state} act={act} paused={paused} setPaused={setPaused} {...(blocking ? { holdWhy } : {})} onFinances={() => setFinances(true)} onReputation={() => setRepOpen(true)} onTeam={() => setTeamOpen(true)} {...(quiet ? {} : { onShop: () => setShop(true) })} />
      {!quiet && <TodayStrip state={state} onOpen={() => setFinances(true)} />}
      {isFreshSave(state) && <StartCard onPick={(mode) => set((s) => startTour(s, mode, Date.now()))} />}
      {/* Build is always there once you've started (empire milestone §2: step into building whenever you like). */}
      {show3d && !preTour && (
        <Button
          variant={building ? "default" : "outline"}
          className="h-11 w-full"
          onClick={() => {
            setBuilding(!building);
            b.setTool(null);
            setSel(null);
          }}
        >
          <Hammer className="mr-2 h-4 w-4" />
          {building ? "Done building" : "Build"}
        </Button>
      )}
      {/* Building from scratch: the current building step stays on screen while you build. */}
      {show3d && building && holding && state.tour?.beat === "meet" && <CoachBubble state={state} controls={controls} act={act} set={set} compact />}
      {show3d && building && <BuildToolbar b={b} state={state} act={act} onBuyPack={() => setBuyDecor(true)} hidePaid={holding} />}
      {!show3d && (
        <FallbackNotice
          reason={no3d ?? "list"}
          details={diag}
          onRetry={() => {
            if (!no3d) return setSettings({ view: "overhead" });
            setNo3d(null);
            setDiag(null);
            setStageKey((k) => k + 1);
          }}
        />
      )}
      {/* The coach sits right above the daycare (never over it) — on a phone it would hide the pups. */}
      {!building && (
        <div ref={coachRef} className="scroll-mt-2">
          <CoachBubble state={state} controls={controls} act={act} set={set} />
        </div>
      )}
      {/* the old game's flow, on the world screen: who's at the desk, and the rooms at a glance */}
      {show3d && !building && !placing && !isFreshSave(state) && (
        <div className="space-y-1.5">
          <FrontDesk f={f} act={act} onSelect={(id) => setSel({ kind: "dog", id })} onCheckout={onCheckout} />
          <RoomsStrip f={f} dog={pickedDog} act={act} onSelectRoom={(uid) => setSel({ kind: "room", id: uid })} />
        </div>
      )}
      <div className="relative" ref={stageWrap}>
        {show3d ? (
          <TycoonStage
            key={`${stageKey}-${settings.lowPower ? "saver" : "standard"}`}
            ref={stage}
            state={state}
            selected={sel?.id ?? null}
            ghost={building ? b.ghost : spot ? { kind: "room", c: spot.c, r: spot.r, w: spot.w, d: spot.d, ok: true, label: `Spot ${spotIndex + 1}` } : null}
            looks={looks}
            overlay={building}
            pickMode={building ? b.pickMode : "objects"}
            onPick={onPick}
            onUnavailable={(reason, details) => {
              setNo3d(reason);
              setDiag(details);
            }}
          />
        ) : (
          no3d && <TycoonMap state={state} selected={sel?.id ?? null} onPick={onPick} preview={spot ? { ...spot, label: `Spot ${spotIndex + 1}` } : null} />
        )}
        {/* the most urgent thing only you can sort out: a family kept waiting first (they can't wait forever), then a
            pup asking for you (a moment fades at no cost) */}
        {!building && !sel && !placing && kept && (
          <button
            type="button"
            className={`absolute left-2 top-2 z-10 min-h-11 rounded-full border-2 bg-background/95 px-3 text-sm font-semibold text-secondary shadow-soft ${kept.w.stage === "upset" ? "border-destructive" : "border-amber-500"}`}
            onClick={() => setSel({ kind: "dog", id: kept.d.id })}
          >
            ⏳ {kept.d.visit!.owner} is waiting to {kept.w.kind === "pickup" ? "pick up" : "drop off"} {kept.d.name}
          </button>
        )}
        {!building && !sel && !placing && !kept && asking.length > 0 && (
          <button
            type="button"
            className="absolute left-2 top-2 z-10 min-h-11 rounded-full border-2 border-primary bg-background/95 px-3 text-sm font-semibold text-secondary shadow-soft"
            onClick={() => setSel({ kind: "dog", id: asking[0]!.id })}
          >
            ✨ {asking[0]!.name}{asking.length > 1 ? ` + ${asking.length - 1} more` : ""} {asking.length > 1 ? "are" : "is"} asking for you
          </button>
        )}
      </div>
      {sel && (
        <div className="fixed inset-x-0 z-40 mx-auto max-w-xl px-2" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
          <div data-testid="panel-sheet" className="relative max-h-[min(48svh,440px)] overflow-y-auto overscroll-contain rounded-t-2xl shadow-pop">
      {(pickedDog || pickedStaff) && (
        <button type="button" aria-label="Close panel" onClick={() => setSel(null)} className="absolute right-1 top-1 z-10 grid h-11 w-11 place-items-center rounded-full text-xl text-muted-foreground hover:bg-muted">
          ×
        </button>
      )}
      {pickedDog && <DogPanel f={f} dog={pickedDog} act={act} />}
      {pickedStaff && (
        <StaffPanel
          f={f}
          st={pickedStaff}
          onManage={() => {
            setSel(null);
            setTeamOpen(true);
          }}
        />
      )}
      {sel && sel.kind !== "dog" && sel.kind !== "staff" && (
        <EditPanel
          state={state}
          sel={{ kind: sel.kind, id: sel.id }}
          act={act}
          askSell={askSell}
          fx={fx}
          onMoveThing={(t) => {
            setBuilding(true);
            setSel(null);
            b.startMoveThing(t);
          }}
          onMoveRoom={(r) => {
            setBuilding(true);
            setSel(null);
            b.startMoveRoom(r);
          }}
          onPaint={(r) => setPainting(r.uid)}
          onFurnish={(r) => {
            setBuilding(true);
            setSel(null);
            b.furnish(r.uid);
          }}
          onClose={() => setSel(null)}
        />
      )}
          </div>
        </div>
      )}
      {stalled && !holding && <BlockersCard blockers={blockers} />}
      {!quiet && (
        <ObjectiveBar
          state={state}
          onAction={(a) => {
            setSel(null); // a pup's panel would cover what opens (found in the play session)
            if (a === "team") setTeamOpen(true);
            else if (a === "expand") setExpandOpen(true);
            else if (a === "finances") setFinances(true);
            else setBuilding(true);
          }}
        />
      )}
      {!quiet && (expandOpen || (objectives(state).next.action === "expand" && !expandSaved)) && (
        <ExpansionCard
          state={state}
          act={act}
          onSave={() => {
            setExpandSaved(true);
            setExpandOpen(false);
          }}
          onBought={showBuilt}
          onChooseSpot={(id) => {
            setExpandSaved(true);
            setExpandOpen(false);
            setSel(null);
            setPlacing({ id, i: 0 });
          }}
        />
      )}
      {placing && (
        <ExpansionSpotBar
          state={state}
          act={act}
          id={placing.id}
          spots={spots}
          index={spotIndex}
          onIndex={(i) => setPlacing({ ...placing, i })}
          onCancel={() => {
            setPlacing(null);
            setExpandOpen(true); // back to the options
          }}
          onBought={(room) => {
            const at = spot;
            setPlacing(null);
            showBuilt(room);
            if (!room && at) {
              // the yard is outside (no room): show the new play yard and celebrate on the spot
              const yard = fac(tycoonStore.getState()!).items.find((i) => i.kind === "play_yard" && i.c === at.c && i.r === at.r);
              if (yard) setSel({ kind: "thing", id: yard.uid });
              if (!settings.reducedMotion) fx("confetti", { c: at.c + 1, r: at.r + 1 });
            }
          }}
        />
      )}
      {!state.tour && !preTour && <GuideCard state={state} act={act} set={set} controls={controls} />}
      <WeeklyCard state={state} act={act} />
      <MoneyBanner state={state} />
      <PaintSheet
        room={paintTarget}
        onClose={() => setPainting(null)}
        onApply={(floor, wall) => {
          const uid = painting!;
          const r = act(
            (s) => {
              const res = paintRoom(s, uid, floor, wall);
              return res.ok ? { ...res, state: markPainted(res.state) } : res;
            },
            { event: { name: "tycoon_build", props: { kind: "room", action: "paint" } } },
          );
          if (r.ok) {
            const room = f.rooms.find((x) => x.uid === uid);
            if (room) fx("sparkle", { c: room.c + Math.floor(room.w / 2), r: room.r + Math.floor(room.d / 2) });
            setPainting(null);
          }
        }}
      />
      {/* with the 3D view, the front desk and rooms strip above it replace the long list (no scrolling to find a pup) */}
      {!show3d && <ListView state={state} act={act} />}
      <TestTools
        diag={diagUi}
        onDiag={(v) => {
          setDiagnostics(v);
          setDiagUi(v);
        }}
      />
      {diagUi && <DiagOverlay debug={() => (stage.current?.debug() as Parameters<typeof DiagOverlay>[0] extends { debug: () => infer D } ? D : never) ?? null} quality={qualityLabel(settings.lowPower)} />}
      <FinancesSheet open={finances} state={state} act={act} onClose={() => setFinances(false)} />
      <DaycareShop open={shop} onClose={() => setShop(false)} owned={entForShop?.owned ?? new Set()} />
      {buyDecor && <BuySheet product={productById("deluxe-daycare-decor")!} returnTo="/daycare-next" open onClose={() => setBuyDecor(false)} />}
      <DayReport state={state} set={set} onFinances={() => setFinances(true)} />
      {pickup && <PickupSheet state={state} dogId={pickup.id} exitBath={pickup.exitBath} act={act} onClose={() => setPickup(null)} />}
      {repOpen && <ReputationSheet f={f} onClose={() => setRepOpen(false)} />}
      {teamOpen && <TeamSheet state={state} act={act} onClose={() => setTeamOpen(false)} />}
      {showReceipt && <ReceiptCard outcome={receipt} onClose={() => setReceipt(null)} />}
      {/* Held during the guided tour (the level and its coins are already earned): nothing covers the first pup. */}
      {/* after any level-up, so two celebrations never stack */}
      {!holding && stageUp && state.pendingLevel == null && (
        <StageUp
          stage={stageNow}
          onClose={() => {
            setStageUp(false);
            if (!settings.reducedMotion) fx("confetti", "hud");
          }}
        />
      )}
      {!holding && <LevelUp
        state={state}
        set={(fn) => {
          set(fn);
          if (!settings.reducedMotion) fx("confetti", "hud");
        }}
      />}
      <SignCard
        open={!!sign}
        onClose={() => setSign(null)}
        onEdit={() => {
          const uid = sign;
          setSign(null);
          if (uid) setSel({ kind: "thing", id: uid });
        }}
      />
    </div>
    </CheckoutContext.Provider>
  );
}
