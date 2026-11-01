// The playable new Daycare Tycoon: status bar, guide, 3D stage with build mode and edit panels, and the list view.
import { useRef, useState } from "react";
import { Box, Hammer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setSettings, useSettings } from "@/lib/settings";
import { paintRoom } from "@/tycoon/build";
import { markPainted } from "@/tycoon/guide";
import { fac } from "@/tycoon/state";
import { useTycoon, type ActOpts, type ActResult } from "@/tycoon/store";
import type { TPick } from "@/tycoon/render/world";
import type { TResult, TycoonState } from "@/tycoon/types";
import { BuildToolbar, useBuild, type FxFn } from "./BuildToolbar";
import { DogPanel } from "./DogPanel";
import { EditPanel } from "./EditPanel";
import { GuideCard } from "./GuideCard";
import { ListView } from "./ListView";
import { PaintSheet } from "./PaintSheet";
import { RunHud } from "./RunHud";
import { TycoonStage, type TycoonStageHandle } from "./TycoonStage";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
type Sel = { kind: "room" | "thing" | "dog"; id: string } | null;

export function TycoonPlay() {
  const { state, act, set, paused, setPaused } = useTycoon();
  if (!state)
    return (
      <div className="grid min-h-[40svh] place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading your daycare" />
      </div>
    );
  return <Play state={state} act={act} set={set} paused={paused} setPaused={setPaused} />;
}

function Play({ state, act, set, paused, setPaused }: { state: TycoonState; act: Act; set: (fn: (s: TycoonState) => TycoonState) => void; paused: boolean; setPaused: (p: boolean) => void }) {
  const settings = useSettings();
  const [no3d, setNo3d] = useState(false);
  const [building, setBuilding] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [askSell, setAskSell] = useState(false);
  const [painting, setPainting] = useState<string | null>(null);
  const stage = useRef<TycoonStageHandle>(null);
  const fx: FxFn = (k, at) => stage.current?.fx(k, at);
  const b = useBuild(state, act, fx);
  const f = fac(state);
  const show3d = settings.view !== "list" && !no3d;

  const onPick = (p: TPick | null) => {
    if (building && b.onPick(p)) return;
    if (building && b.ui.tool === "paint") {
      if (p?.kind === "room") setPainting(p.uid);
      return;
    }
    setAskSell(building && b.ui.tool === "sell");
    if (!p || p.kind === "tile" || p.kind === "edge") return setSel(null);
    setSel(p.kind === "dog" ? { kind: "dog", id: p.id } : { kind: p.kind, id: p.uid });
  };

  const pickedDog = sel?.kind === "dog" ? f.dogs.find((d) => d.id === sel.id) ?? null : null;
  const paintTarget = painting ? f.rooms.find((r) => r.uid === painting) ?? null : null;

  return (
    <div className="space-y-3">
      <RunHud state={state} act={act} paused={paused} setPaused={setPaused} />
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
    </div>
  );
}
