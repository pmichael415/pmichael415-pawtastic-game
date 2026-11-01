// The playable new Daycare Tycoon: status bar, guide, 3D stage with build mode and edit panels, and the list view.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Box, Hammer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setSettings, useSettings } from "@/lib/settings";
import { useEntitlementsMaybe } from "@/lib/entitlements";
import { PAID_ITEMS, type PaidItemId } from "@/lib/paidVisuals";
import { setOwnedPaid } from "@/tycoon/paid";
import { paintRoom } from "@/tycoon/build";
import { markPainted } from "@/tycoon/guide";
import { fac } from "@/tycoon/state";
import { tycoonStore, useTycoon, type ActOpts, type ActResult } from "@/tycoon/store";
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
  const [no3d, setNo3d] = useState(false);
  const [building, setBuilding] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [askSell, setAskSell] = useState(false);
  const [painting, setPainting] = useState<string | null>(null);
  const [finances, setFinances] = useState(false);
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
    <div className="space-y-3">
      <RunHud state={state} act={act} paused={paused} setPaused={setPaused} onFinances={() => setFinances(true)} />
      <MoneyBanner state={state} />
      <GuideCard state={state} act={act} set={set} />
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
      {show3d && building && <BuildToolbar b={b} state={state} act={act} />}
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
          onUnavailable={() => setNo3d(true)}
        />
      ) : (
        !no3d && (
          <Button variant="outline" className="h-11 w-full" onClick={() => setSettings({ view: "overhead" })}>
            <Box className="mr-2 h-4 w-4" /> Show the 3D view
          </Button>
        )
      )}
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
