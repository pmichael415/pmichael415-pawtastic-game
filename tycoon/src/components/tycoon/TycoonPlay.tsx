// The playable new Daycare Tycoon: status bar, guide, 3D stage with build mode and edit panels, and the list view.
import { useEffect, useMemo, useRef, useState } from "react";
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
import { onGetCoins, setTourControls, tycoonStore, useTycoon, type ActOpts, type ActResult } from "@/tycoon/store";
import { productById } from "@/lib/catalog";
import { liveCollect } from "@/lib/purchases/live";
import { BuySheet } from "@/components/purchases/BuySheet";
import { addedMessage, useCheckoutReturn } from "@/components/purchases/useCheckoutReturn";
import { DaycareShop } from "./DaycareShop";
import { CoachBubble } from "./CoachBubble";
import { FallbackNotice, type FallbackReason } from "./FallbackNotice";
import { GoalsStrip } from "./GoalsStrip";
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
import { DogPanel } from "./DogPanel";
import { EditPanel } from "./EditPanel";
import { GuideCard } from "./GuideCard";
import { WeeklyCard } from "./WeeklyCard";
import { LevelUp } from "./LevelUp";
import { ListView } from "./ListView";
import { PaintSheet } from "./PaintSheet";
import { RunHud } from "./RunHud";
import { TycoonStage, type TycoonStageHandle } from "./TycoonStage";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
type Sel = { kind: "room" | "thing" | "dog"; id: string } | null;

/** Owned paid visuals from fresh server entitlements (never from the save). Empty for guests and on errors. */
function useOwnedPaid(): ReadonlySet<PaidItemId> {
  const ent = useEntitlementsMaybe();
  const key = ent && ent.status === "ready" ? PAID_ITEMS.filter((i) => ent.owned.has(i.pack)).map((i) => i.id).join(",") : "";
  return useMemo(() => new Set(key ? (key.split(",") as PaidItemId[]) : []), [key]);
}

export function TycoonPlay() {
  const { state, act, set, paused, setPaused } = useTycoon();
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
  return <Play state={state} act={act} set={set} paused={paused} setPaused={setPaused} />;
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

function Play({ state, act: rawAct, set, paused, setPaused }: { state: TycoonState; act: Act; set: (fn: (s: TycoonState) => TycoonState) => void; paused: boolean; setPaused: (p: boolean) => void }) {
  const settings = useSettings();
  const [no3d, setNo3d] = useState<FallbackReason | null>(null);
  const [building, setBuilding] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [askSell, setAskSell] = useState(false);
  const [painting, setPainting] = useState<string | null>(null);
  const [finances, setFinances] = useState(false);
  const [shop, setShop] = useState(false);
  const [buyDecor, setBuyDecor] = useState(false);
  // Purchase prompts wait until the guided tour reaches free play (spec §6); the hub Shop tab is always there.
  const holding = tourHolds(state);
  useEffect(() => {
    onGetCoins(holding ? null : () => setShop(true));
    return () => onGetCoins(null);
  }, [holding]);
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
  const fx: FxFn = (k, at) => stage.current?.fx(k, at);
  /** Every action, plus its sound and effect: coins fly at checkout, building thunks, selling pops, upgrades sparkle. */
  const act: Act = (fn, opts) => {
    const before = tycoonStore.getState();
    const r = rawAct(fn, opts);
    if (!r.ok || !before) return r;
    const a = fac(before);
    const z = fac(r.state);
    const count = (x: Facility) => x.rooms.length + x.items.length;
    if (z.stats.checkouts > a.stats.checkouts) {
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
  // Music starts on the first tap (browsers allow audio only after the player interacts) and stops when switched off.
  useEffect(() => {
    if (!settings.music) {
      music.stop();
      return;
    }
    const go = () => music.start();
    document.addEventListener("pointerdown", go, { once: true });
    const hide = () => {
      if (document.hidden) music.stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("pointerdown", go);
      document.removeEventListener("visibilitychange", hide);
      music.stop();
    };
  }, [settings.music]);
  const show3d = settings.view !== "list" && !no3d;
  const controls: Controls = settings.view === "list" ? "list" : no3d ? "map" : "3d";
  useEffect(() => setTourControls(controls), [controls]);
  const ent = useEntitlementsMaybe();
  const star = !!ent?.visuals["navy-star-bandana"];
  const looks = useMemo(() => (star ? { bandana: "#1c2f52" } : {}), [star]);

  const onPick = (p: TPick | null) => {
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
    setSel(p.kind === "dog" ? { kind: "dog", id: p.id } : { kind: p.kind, id: p.uid });
  };

  const pickedDog = sel?.kind === "dog" ? f.dogs.find((d) => d.id === sel.id) ?? null : null;
  const paintTarget = painting ? f.rooms.find((r) => r.uid === painting) ?? null : null;

  return (
    <div className="space-y-3" style={{ paddingBottom: sel ? "min(48svh, 440px)" : undefined }}>
      <RunHud state={state} act={act} paused={paused} setPaused={setPaused} onFinances={() => setFinances(true)} {...(holding ? {} : { onShop: () => setShop(true) })} />
      {isFreshSave(state) && <StartCard onPick={(mode) => set((s) => startTour(s, mode, Date.now()))} />}
      {show3d && (
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
      {show3d && building && <BuildToolbar b={b} state={state} act={act} onBuyPack={() => setBuyDecor(true)} />}
      {!show3d && <FallbackNotice reason={no3d ?? "list"} onRetry={() => (no3d ? setNo3d(null) : setSettings({ view: "overhead" }))} />}
      <div className="relative">
        {show3d ? (
          <TycoonStage
            ref={stage}
            state={state}
            selected={sel?.id ?? null}
            ghost={building ? b.ghost : null}
            looks={looks}
            overlay={building}
            pickMode={building ? b.pickMode : "objects"}
            onPick={onPick}
            onUnavailable={(reason) => setNo3d(reason)}
          />
        ) : (
          no3d && <TycoonMap state={state} selected={sel?.id ?? null} onPick={onPick} />
        )}
        {(show3d || no3d) && !building && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2">
            <div className="pointer-events-auto">
              <CoachBubble state={state} controls={controls} act={act} set={set} />
            </div>
          </div>
        )}
      </div>
      {!show3d && !no3d && <CoachBubble state={state} controls={controls} act={act} set={set} />}
      {sel && (
        <div className="fixed inset-x-0 z-40 mx-auto max-w-xl px-2" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
          <div data-testid="panel-sheet" className="max-h-[min(48svh,440px)] overflow-y-auto overscroll-contain rounded-t-2xl shadow-pop">
      {pickedDog && <DogPanel f={f} dog={pickedDog} act={act} />}
      {sel && sel.kind !== "dog" && (
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
          onClose={() => setSel(null)}
        />
      )}
          </div>
        </div>
      )}
      {!holding && <GoalsStrip state={state} />}
      {!state.tour && <GuideCard state={state} act={act} set={set} controls={controls} />}
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
      <ListView state={state} act={act} compact={show3d} />
      <FinancesSheet open={finances} state={state} act={act} onClose={() => setFinances(false)} />
      <DaycareShop open={shop} onClose={() => setShop(false)} owned={entForShop?.owned ?? new Set()} />
      {buyDecor && <BuySheet product={productById("deluxe-daycare-decor")!} returnTo="/daycare-next" open onClose={() => setBuyDecor(false)} />}
      <DayReport state={state} set={set} onFinances={() => setFinances(true)} />
      <LevelUp
        state={state}
        set={(fn) => {
          set(fn);
          if (!settings.reducedMotion) fx("confetti", "hud");
        }}
      />
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
  );
}
