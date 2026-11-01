import { useEffect, useRef, useState } from "react";
import { Bath, BedDouble, ChevronDown, Home, Moon, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FAVORITE_LABEL,
  friendshipLevel,
  personalityOf,
  regularOf,
  GROUPS,
  LOBBY_CAP,
  bath,
  checkout,
  groupName,
  groupOf,
  hasScuffle,
  lobbyDogs,
  lobbyStatus,
  playtime,
  roomAtRisk,
  roomCapacity,
  roomDogs,
  separateDog,
  separateDogs,
  suiteBlockReason,
  suiteCount,
  suiteDog,
  traitLabel,
  createArrival,
  cleanRoom,
  type Dog,
  type GameState,
  type GroupId,
  type Result,
  type SiteId,
} from "@/game/engine";
import { describePlace, primaryAction, roomOptions, type EffectKind } from "@/game/actions";
import { DogSprite } from "@/game/sprites";
import { Meter, Reason, type Looks } from "./parts";

export type Run = (apply: (s: GameState) => Result, effect?: EffectKind, dogId?: string) => Result;
const why = (r: Result) => (r.ok ? null : r.error);

/** Ignore taps for a moment after an action so a double-tap can't fire the *next* step by accident. */
function useTapGuard(ms = 450) {
  const [locked, setLocked] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (t.current) clearTimeout(t.current);
    },
    [],
  );
  const guard =
    <T,>(fn: () => T) =>
    () => {
      if (locked) return;
      setLocked(true);
      t.current = setTimeout(() => setLocked(false), ms);
      fn();
    };
  return { locked, guard };
}

type CareProps = {
  state: GameState;
  dog: Dog;
  looks: Looks;
  run: Run;
  requestRoom: (dog: Dog, g: GroupId) => void;
  requestSuite: (dog: Dog, i: number) => void;
  onClose: () => void;
};

/** Everything you can do for one pup, with the reason beside anything that's unavailable. */
export function CarePanel({
  state,
  dog,
  looks,
  run,
  requestRoom,
  requestSuite,
  onClose,
}: CareProps) {
  const { locked, guard } = useTapGuard();
  const [rooms, setRooms] = useState(false);
  const primary = primaryAction(state, dog);
  const playR = why(playtime(state, dog.id));
  const bathR = why(bath(state, dog.id));
  const outR = why(checkout(state, dog.id, false));
  const exitR = why(checkout(state, dog.id, true));
  const canMove =
    dog.checkedIn &&
    (dog.place.kind === "lobby" || dog.place.kind === "recovery" || dog.place.kind === "room");
  const fight = dog.place.kind === "room" && hasScuffle(state, dog.site, dog.place.group);
  const doPrimary = () => {
    if (!primary.apply) return;
    if (primary.id === "assign" && dog.place.kind !== "room") {
      requestRoom(dog, groupOf(dog));
      return;
    }
    run(primary.apply, primary.effect, dog.id);
  };
  return (
    <section
      aria-label={`Care for ${dog.name}`}
      className="rounded-t-2xl border border-b-0 border-border bg-card p-2.5 shadow-soft"
    >
      <div className="flex items-start gap-2">
        <DogSprite
          breed={dog.breed}
          size={40}
          moving={false}
          bandana={looks.bandana}
          star={looks.star}
          collar={looks.collar}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold leading-tight text-secondary">
            {dog.name}{" "}
            <span className="text-sm text-primary">
              · {traitLabel(dog)}
              {dog.boarding ? " · overnight boarder" : " · daycare"}
            </span>
          </h2>
          <p
            className={`text-[12px] font-bold ${fight ? "text-destructive" : !dog.checkedIn ? "text-secondary" : "text-muted-foreground"}`}
          >
            {describePlace(state, dog)}
          </p>
          <p className="text-[11px] font-bold text-primary">
            {personalityOf(dog).trait} · loves {FAVORITE_LABEL[personalityOf(dog).favorite]}
            {(() => {
              const r = regularOf(state, dog);
              return r
                ? ` · visit #${dog.visits} · ${friendshipLevel(r.friendship).label} 💙`
                : dog.visits > 1
                  ? ` · visit #${dog.visits}`
                  : " · first visit";
            })()}
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Meter label="Happiness" value={dog.happiness} tone="bg-success" />
            <Meter label="Clean" value={dog.clean} />
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <Button
        size="lg"
        className="mt-1.5 h-12 w-full font-display text-base"
        disabled={!primary.apply || locked}
        onClick={guard(doPrimary)}
        data-testid="primary-action"
      >
        {primary.label}
      </Button>
      {!primary.apply && <Reason tone="warn">{primary.reason}</Reason>}
      {fight && (
        <Reason tone="danger">
          Care pauses until everyone is calm. Separating never costs coins, and works even if the
          lobby is closed or full.
        </Reason>
      )}

      {dog.checkedIn && (
        <>
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
            <div>
              <Button
                className="h-11 w-full"
                disabled={!!playR || locked}
                onClick={guard(() => run((s) => playtime(s, dog.id), "play", dog.id))}
              >
                <Sparkles /> Play +15
              </Button>
              <Reason>{playR}</Reason>
            </div>
            <div>
              <Button
                className="h-11 w-full"
                disabled={!!bathR || locked}
                onClick={guard(() => run((s) => bath(s, dog.id), "bath", dog.id))}
              >
                <Bath /> Bath +{state.upgrades.includes("splash") ? 35 : 25}
              </Button>
              <Reason>{bathR}</Reason>
            </div>
            <div>
              <Button
                className="h-11 w-full"
                variant="secondary"
                disabled={!!outR || locked}
                onClick={guard(() => run((s) => checkout(s, dog.id, false), "checkout", dog.id))}
              >
                <Home /> Check out
              </Button>
              <Reason>{outR}</Reason>
            </div>
            <div>
              <Button
                className="h-11 w-full"
                variant="outline"
                disabled={!!exitR || locked}
                onClick={guard(() => run((s) => checkout(s, dog.id, true), "checkout", dog.id))}
              >
                🛁 Exit bath + out
              </Button>
              <Reason>{exitR && exitR !== outR ? exitR : null}</Reason>
            </div>
          </div>
          {canMove && !dog.boarding && (
            <div className="mt-2">
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between rounded-xl bg-muted px-3 text-sm font-bold text-secondary"
                aria-expanded={rooms}
                onClick={() => setRooms(!rooms)}
              >
                Choose a playroom{" "}
                <ChevronDown className={`h-4 w-4 transition ${rooms ? "rotate-180" : ""}`} />
              </button>
              {rooms && (
                <ul className="mt-1 grid gap-1">
                  {roomOptions(state, dog).map((o) => (
                    <li key={o.group}>
                      <button
                        type="button"
                        disabled={o.status === "block" || locked}
                        onClick={guard(() => requestRoom(dog, o.group))}
                        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-1 text-left text-sm font-bold disabled:opacity-60 ${o.status === "fit" ? "border-success" : o.status === "warn" ? "border-accent" : "border-border"}`}
                      >
                        <span>
                          {GROUPS.find((g) => g.id === o.group)!.emoji} {o.name} ·{" "}
                          {roomDogs(state, dog.site, o.group).length}/{roomCapacity(state)}
                        </span>
                        <span className="text-[11px]">
                          {o.status === "fit"
                            ? "✓ Safe match"
                            : o.status === "warn"
                              ? "⚠ Mismatch"
                              : "🔒"}
                        </span>
                      </button>
                      {o.status !== "fit" && (
                        <Reason tone={o.status === "warn" ? "warn" : "muted"}>{o.reason}</Reason>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {canMove && dog.boarding && suiteCount(state) > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-1">
              {Array.from({ length: suiteCount(state) }, (_, i) => {
                const r = suiteBlockReason(state, dog, i);
                const occ = suiteDog(state, dog.site, i);
                return (
                  <Button
                    key={i}
                    variant="outline"
                    className="h-11"
                    disabled={!!r || locked}
                    onClick={guard(() => requestSuite(dog, i))}
                    aria-label={`Suite ${i + 1}${occ ? `, occupied by ${occ.name}` : ", open"}`}
                  >
                    <BedDouble /> {occ ? occ.name : `Suite ${i + 1}`}
                  </Button>
                );
              })}
            </div>
          )}
        </>
      )}
      {dog.place.kind !== "recovery" && (
        <Button
          variant="outline"
          className="mt-1.5 h-11 w-full text-sm"
          onClick={() => run((s) => separateDog(s, dog.id), "separate", dog.id)}
        >
          🫶 Move to recovery room (always available)
        </Button>
      )}
    </section>
  );
}

type DeskProps = {
  state: GameState;
  site: SiteId;
  run: Run;
  onSelect: (id: string) => void;
  admit: (boarding: boolean) => void;
};

/** The front desk: every pup waiting in the lobby with its Check in button right beside it. */
export function FrontDesk({ state, site, run, onSelect, admit }: DeskProps) {
  const { locked, guard } = useTapGuard(350);
  const lobby = lobbyDogs(state, site);
  const open = lobbyStatus(state.clockMin).open;
  const full = lobby.length >= LOBBY_CAP;
  const waiting = lobby.filter((d) => !d.checkedIn);
  const admitR = !open
    ? "Drop-offs pause 12:00–14:00 (game clock). Staff keep caring for pups already inside."
    : full
      ? `Lobby full (${LOBBY_CAP}/${LOBBY_CAP}) — check pups in and move them to rooms first.`
      : null;
  const boardR =
    admitR ??
    (suiteCount(state) === 0
      ? "Build Boarding Suites in Upgrades (800 coins) to take overnight guests."
      : null);
  const mopR = why(cleanRoom(state));
  return (
    <section
      aria-label="Front desk"
      className="rounded-2xl border border-border bg-card p-3 shadow-soft"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-secondary">🛎️ Front desk</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${full ? "bg-destructive text-destructive-foreground" : "bg-muted text-secondary"}`}
        >
          {lobby.length}/{LOBBY_CAP} in lobby
        </span>
      </div>
      {waiting.length > 0 ? (
        <ul className="mt-2 grid gap-2">
          {waiting.map((d) => {
            const a = primaryAction(state, d);
            return (
              <li key={d.id} className="flex items-center gap-2 rounded-2xl bg-sky/60 p-2">
                <button
                  type="button"
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => onSelect(d.id)}
                  aria-label={`${d.name} details`}
                >
                  <DogSprite breed={d.breed} size={d.size === "small" ? 36 : 46} moving={false} />
                  <span className="min-w-0">
                    <span className="block truncate font-display font-bold text-secondary">
                      {d.boarding ? "🌙 " : ""}
                      {d.name}
                    </span>
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      {traitLabel(d)} · just dropped off
                    </span>
                  </span>
                </button>
                <Button
                  className="h-12 shrink-0 px-4 font-display text-base"
                  disabled={locked}
                  onClick={guard(() => run(a.apply!, "checkin", d.id))}
                  data-testid={`checkin-${d.id}`}
                >
                  Check in
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 rounded-2xl bg-sky/50 p-3 text-sm font-bold text-secondary">
          {open
            ? "No one waiting. Customers arrive on their own — or take a walk-in now."
            : "Lobby closed to drop-offs until 14:00. Care continues inside."}
        </p>
      )}
      {lobby.some((d) => d.checkedIn) && (
        <p className="mt-2 text-[12px] font-bold text-secondary">
          Checked in, waiting for a room:{" "}
          {lobby
            .filter((d) => d.checkedIn)
            .map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect(d.id)}
                className="mr-1 min-h-11 rounded-full bg-muted px-3 font-bold underline-offset-2"
              >
                {d.name} → {d.boarding ? "suite" : groupName(groupOf(d))}
              </button>
            ))}
        </p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Button className="h-12 font-display" disabled={!!admitR} onClick={() => admit(false)}>
          <Plus /> Walk-in
        </Button>
        <Button
          className="h-12 font-display"
          variant="secondary"
          disabled={!!boardR}
          onClick={() => admit(true)}
        >
          <Moon /> Boarder
        </Button>
        <Button
          className="h-12 font-display"
          variant="outline"
          disabled={!!mopR}
          onClick={() => run(cleanRoom)}
        >
          🧽 Mop
        </Button>
      </div>
      <Reason>
        {admitR ??
          (boardR && boardR !== admitR ? boardR : null) ??
          (state.cleanliness < 100 ? null : null)}
      </Reason>
    </section>
  );
}

/** Info for a tapped room/area when no pup is selected. */
export function AreaPanel({
  state,
  site,
  area,
  onSelect,
  run,
  onClose,
}: {
  state: GameState;
  site: SiteId;
  area:
    | { kind: "room"; group: GroupId }
    | { kind: "suite"; index: number }
    | { kind: "place"; place: string };
  onSelect: (id: string) => void;
  run: Run;
  onClose: () => void;
}) {
  let title = "";
  let body: React.ReactNode = null;
  if (area.kind === "room") {
    const g = GROUPS.find((x) => x.id === area.group)!;
    const dogs = roomDogs(state, site, g.id);
    const fight = hasScuffle(state, site, g.id);
    const risk = roomAtRisk(state, site, g.id);
    title = `${g.emoji} ${g.name} playroom`;
    body = (
      <>
        <p className="text-sm font-bold text-secondary">
          Accepts: <b>{g.size === "small" ? "small" : "large"}</b> pups · <b>{g.temper}</b> play
          style · {dogs.length}/{roomCapacity(state)} spots used
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {dogs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(d.id)}
              className="min-h-11 rounded-full bg-muted px-3 text-sm font-bold text-secondary"
            >
              {d.name}
              {groupOf(d) !== g.id ? " ⚠" : ""}
            </button>
          ))}
        </div>
        {(fight || risk) && (
          <Button
            className="mt-2 h-12 w-full"
            variant={fight ? "destructive" : "outline"}
            onClick={() =>
              run(
                (s) => separateDogs(s, site, g.id),
                "separate",
                dogs.find((d) => groupOf(d) !== g.id)?.id,
              )
            }
          >
            🫶 {fight ? "Separate dogs now" : "Move the mismatched pup to recovery"}
          </Button>
        )}
        <Reason>
          Tip: select a pup, then tap a green room. Both size and temperament must match to keep a
          room calm.
        </Reason>
      </>
    );
  } else if (area.kind === "suite") {
    const occ = suiteDog(state, site, area.index);
    title = `🌙 Boarding Suite ${area.index + 1}`;
    body =
      area.index >= suiteCount(state) ? (
        <p className="text-sm font-bold text-secondary">
          Not built yet — buy Boarding Suites in Upgrades (800 coins). Each overnight guest gets a
          private room.
        </p>
      ) : occ ? (
        <button
          type="button"
          onClick={() => onSelect(occ.id)}
          className="min-h-11 rounded-full bg-muted px-3 text-sm font-bold text-secondary"
        >
          Occupied by {occ.name} — tap to care or check out
        </button>
      ) : (
        <p className="text-sm font-bold text-secondary">
          Open. Select a checked-in boarder, then tap this suite.
        </p>
      );
  } else {
    const names: Record<string, string> = {
      lobby: "🛎️ Lobby & check-in",
      desk: "🛎️ Front desk",
      bath: "🛁 Bath & exit-bath area",
      recovery: "🫶 Staff-only recovery room",
    };
    title = names[area.place] ?? area.place;
    body = (
      <p className="text-sm font-bold text-secondary">
        {area.place === "bath"
          ? "Select a pup and choose Bath — they'll trot over to the tub. Exit baths happen at checkout."
          : area.place === "recovery"
            ? "A calm space separate from the public lobby. Always open — even when the lobby is closed or full and staff are tired."
            : "Customers drop pups off here. Check them in at the desk, then move them to a matching playroom or suite."}
      </p>
    );
  }
  return (
    <section
      aria-label={title}
      className="rounded-t-2xl border border-b-0 border-border bg-card p-3 shadow-soft"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-secondary">{title}</h2>
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {body}
    </section>
  );
}

export { createArrival };
