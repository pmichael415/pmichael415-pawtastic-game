// Tapping a room or an item (no tool active): what it is, what it does, and Upgrade, Move, Rotate, Change type,
// Close/Open, Paint and Sell (with the refund shown before selling).
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GROUPS, groupName } from "@/game/engine";
import { ROOM_TYPE_NAMES, SELL_RATE, furnitureDef, outdoorDef, upgradePrice } from "@/tycoon/catalog";
import { connectRoom, connectionPlan, moveThing, sellRoom, sellThing, setClosed, setRoomType, upgradeThing } from "@/tycoon/build";
import { upkeepOf } from "@/tycoon/business";
import { roomCleanOf, wayIn } from "@/tycoon/rooms";
import { applyStaffPlan, roomReadiness, roomServes, staffPlanFor } from "@/tycoon/roomCare";
import { clean } from "@/tycoon/run";
import { roomStatus } from "@/tycoon/connect";
import { isActive } from "@/tycoon/paid";
import { fac } from "@/tycoon/state";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { Placed, Room, RoomType, Rot, TResult, TycoonState } from "@/tycoon/types";
import type { FxFn } from "./BuildToolbar";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;

const roomTitle = (r: Room) => (r.type ? ROOM_TYPE_NAMES[r.type] : "room");

function thingEffect(t: Placed): { now: string; next: string | null } {
  const od = outdoorDef(t.kind);
  if (od) {
    const at = (lv: number) => [od.fun ? `Fun ${od.fun[lv - 1]}` : "", od.appeal ? `Appeal ${od.appeal[lv - 1]}` : ""].filter(Boolean).join(" · ") || "decoration";
    return { now: at(t.level), next: od.levels === 3 && t.level < 3 ? at(t.level + 1) : null };
  }
  const fd = furnitureDef(t.kind);
  if (!fd) return { now: "", next: null };
  const parts = [fd.required ? "required in the Lobby" : "", fd.spots ? `+${fd.spots} dog spot` : "", fd.waiting ? `+${fd.waiting} waiting spots` : "", fd.boarder ? "+1 boarder" : "", fd.tub ? (fd.tub === "deluxe" ? "baths, +10 bath pay" : "enables baths") : "", fd.staffBoost ? "staff rest +50%" : "", fd.fun ? `Fun +${fd.fun}` : "", fd.appeal ? `Appeal +${fd.appeal}` : ""];
  return { now: parts.filter(Boolean).join(" · "), next: null };
}

export function EditPanel({
  state,
  sel,
  act,
  askSell,
  fx,
  onMoveThing,
  onMoveRoom,
  onPaint,
  onFurnish,
  onClose,
}: {
  state: TycoonState;
  sel: { kind: "room" | "thing"; id: string };
  act: Act;
  askSell: boolean;
  fx: FxFn;
  onMoveThing: (t: Placed) => void;
  onMoveRoom: (r: Room) => void;
  onPaint: (r: Room) => void;
  /** Furnish this room: build mode with the room already chosen. */
  onFurnish?: (r: Room) => void;
  onClose: () => void;
}) {
  const f = fac(state);
  const [confirm, setConfirm] = useState(askSell);
  const [typing, setTyping] = useState(false);
  const [groupPick, setGroupPick] = useState(false);
  useEffect(() => {
    setConfirm(askSell);
    setTyping(false);
    setGroupPick(false);
  }, [sel.id, askSell]);

  const room = sel.kind === "room" ? f.rooms.find((r) => r.uid === sel.id) ?? null : null;
  const thing = sel.kind === "thing" ? f.items.find((i) => i.uid === sel.id) ?? null : null;
  if (!room && !thing) return null;

  const close = (
    <Button size="icon" variant="ghost" className="h-11 w-11" aria-label="Close panel" onClick={onClose}>
      <X className="h-5 w-5" />
    </Button>
  );

  if (room) {
    const status = roomStatus(f, room);
    const contents = f.items.filter((i) => i.room === room.uid);
    const refund = Math.floor(SELL_RATE * (room.spent + contents.reduce((a, i) => a + i.spent, 0)));
    const dogs = f.dogs.filter((d) => d.place.kind !== "lobby" && (d.place as { room: string }).room === room.uid).length + (room.type === "lobby" ? f.dogs.filter((d) => d.place.kind === "lobby").length : 0);
    const title = room.type === "playroom" && room.group ? `Playroom · ${groupName(room.group)}` : room.type ? ROOM_TYPE_NAMES[room.type] : "New room";
    const sell = () => {
      const r = act((s) => sellRoom(s, room.uid), { event: { name: "tycoon_build", props: { kind: "room", action: "sell" } } });
      if (r.ok) {
        fx("puff", { c: room.c + Math.floor(room.w / 2), r: room.r + Math.floor(room.d / 2) });
        onClose();
      }
    };
    return (
      <section aria-label={`Edit ${title}`} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-secondary">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {room.w} × {room.d} · {dogs} pup{dogs === 1 ? "" : "s"} inside · upkeep {upkeepOf(room)}/day
            </p>
            {room.type && room.type !== "lobby" && (
              // connected, furnished, staffed, operating — four states, told apart (milestone §3)
              <ol aria-label="Room readiness" className="mt-1 space-y-0.5 text-xs">
                {roomReadiness(f, room).map((x) => (
                  <li key={x.step} className={x.done ? "text-success" : "font-semibold text-secondary"}>
                    {x.done ? "✓" : "○"} {x.text}
                  </li>
                ))}
              </ol>
            )}
            {status.reason && <p className="mt-1 text-sm font-semibold text-destructive">{status.reason}</p>}
            {(() => {
              // How you get in — or why you can't, with a one-tap fix (empire milestone §2).
              const way = wayIn(f, room);
              const fix = way.ok ? null : connectionPlan(f, room.uid);
              return (
                <>
                  <p className={`mt-1 text-sm ${way.ok ? "text-success" : "text-secondary"}`}>{way.ok ? `✓ ${way.text}` : way.text}</p>
                  {fix?.blocked && <p className="text-sm font-semibold text-destructive">{fix.blocked}</p>}
                  {fix && !fix.blocked && (
                    <Button
                      size="sm"
                      className="mt-1 h-11"
                      disabled={state.coins < fix.cost}
                      onClick={() => act((s) => connectRoom(s, room.uid, fix), { event: { name: "tycoon_build", props: { kind: "door", action: "connect" } } })}
                    >
                      Connect it · {fix.cost}
                    </Button>
                  )}
                </>
              );
            })()}
          </div>
          {close}
        </div>
        {confirm ? (
          <div className="mt-2 space-y-2">
            <p className="font-semibold text-secondary">Sell the {roomTitle(room)} and everything in it for {refund} coins?</p>
            <div className="flex gap-2">
              <Button variant="destructive" className="h-11 flex-1" onClick={sell}>
                Yes, sell
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setConfirm(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : typing ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {(groupPick ? GROUPS.map((g) => ({ id: g.id, label: g.name })) : (["lobby", "playroom", "calm", "bath", "boarding", "staff"] as RoomType[]).map((t) => ({ id: t, label: ROOM_TYPE_NAMES[t] }))).map((o) => (
              <Button
                key={o.id}
                variant="outline"
                className="h-11"
                onClick={() => {
                  if (!groupPick && o.id === "playroom") return setGroupPick(true);
                  const r = groupPick ? act((s) => setRoomType(s, room.uid, "playroom", o.id as (typeof GROUPS)[number]["id"])) : act((s) => setRoomType(s, room.uid, o.id as RoomType));
                  if (r.ok) setTyping(false);
                }}
              >
                {o.label}
              </Button>
            ))}
          </div>
        ) : (
          <>
          {room.type && (() => {
            // Running it (empire milestone §6): what it does for families, who looks after it — one tap to get someone on it.
            const staff = staffPlanFor(f, room);
            return (
              <div className="mt-2 space-y-1 rounded-xl bg-muted p-2 text-sm">
                <p className="text-secondary">{roomServes(f, room)}</p>
                {/* who runs it is in the readiness list above once it's covered; here only when there's a step to take */}
                {(staff.kind === "assign" || staff.kind === "hire") && <p className="text-secondary">{staff.text}</p>}
                {(staff.kind === "assign" || staff.kind === "hire") && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="h-11"
                      disabled={staff.kind === "hire" && state.coins < staff.cost}
                      onClick={() => act((s) => applyStaffPlan(s, staff))}
                    >
                      {staff.label}
                    </Button>
                    {staff.kind === "hire" && <span className="text-xs text-muted-foreground">then {staff.wage} coins a day</span>}
                  </div>
                )}
              </div>
            );
          })()}
          <div className="mt-2 flex flex-wrap gap-2">
            {onFurnish && room.type && (
              <Button className="h-11" onClick={() => onFurnish(room)}>
                Furnish it
              </Button>
            )}
            {roomCleanOf(f, room.uid) < 100 && (
              <Button variant="secondary" className="h-11" onClick={() => act(clean)}>
                Mop floors
              </Button>
            )}
            <Button variant="outline" className="h-11" onClick={() => setTyping(true)}>
              Change type
            </Button>
            <Button variant="outline" className="h-11" onClick={() => onPaint(room)}>
              Paint
            </Button>
            <Button variant="outline" className="h-11" onClick={() => onMoveRoom(room)}>
              Move
            </Button>
            <Button variant="outline" className="h-11" onClick={() => act((s) => setClosed(s, room.uid, !room.closed))}>
              {room.closed ? "Open" : "Close"}
            </Button>
            <Button variant="outline" className="h-11 text-destructive" onClick={() => setConfirm(true)}>
              Sell
            </Button>
          </div>
          </>
        )}
      </section>
    );
  }

  const t = thing!;
  const od = outdoorDef(t.kind);
  const name = (furnitureDef(t.kind) ?? od)?.name ?? t.kind;
  const eff = thingEffect(t);
  const refund = Math.floor(SELL_RATE * t.spent);
  const nextPrice = od && od.levels === 3 && t.level < 3 ? upgradePrice(od.price, (t.level + 1) as 2 | 3) : null;
  const entrance = t.uid === "entrance";
  return (
    <section aria-label={`Edit ${name}`} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-secondary">{entrance ? "Entrance" : name}</h3>
          <p className="text-xs text-muted-foreground">
            {od && od.levels === 3 ? `Level ${t.level} of 3 · ` : ""}
            {eff.now}
            {entrance ? "Where customers arrive. It stays." : ` · upkeep ${upkeepOf(t)}/day`}
            {t.closed ? " · closed" : ""}
          </p>
          {eff.next && <p className="text-xs text-primary">Next level: {eff.next}</p>}
          {!isActive(t.kind) && <p className="mt-1 text-sm font-semibold text-destructive">Pack no longer active — it counts for nothing, and you can sell it.</p>}
        </div>
        {close}
      </div>
      {entrance ? null : confirm ? (
        <div className="mt-2 space-y-2">
          <p className="font-semibold text-secondary">Sell the {name} for {refund} coins?</p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="h-11 flex-1"
              onClick={() => {
                const r = act((s) => sellThing(s, t.uid), { event: { name: "tycoon_build", props: { kind: t.kind, action: "sell" } } });
                if (r.ok) {
                  fx("puff", { c: t.c, r: t.r });
                  onClose();
                }
              }}
            >
              Yes, sell
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {nextPrice !== null && (
            <Button
              className="h-11"
              onClick={() => {
                const r = act((s) => upgradeThing(s, t.uid), { event: { name: "tycoon_build", props: { kind: t.kind, action: "upgrade" } } });
                if (r.ok) fx("sparkle", { c: t.c, r: t.r });
              }}
            >
              Upgrade · {nextPrice}
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => onMoveThing(t)}>
            Move
          </Button>
          <Button variant="outline" className="h-11" onClick={() => act((s) => moveThing(s, t.uid, t.c, t.r, ((t.rot + 1) % 4) as Rot), { event: { name: "tycoon_build", props: { kind: t.kind, action: "move" } } })}>
            Rotate
          </Button>
          <Button variant="outline" className="h-11" onClick={() => act((s) => setClosed(s, t.uid, !t.closed))}>
            {t.closed ? "Open" : "Close"}
          </Button>
          <Button variant="outline" className="h-11 text-destructive" onClick={() => setConfirm(true)}>
            Sell
          </Button>
        </div>
      )}
    </section>
  );
}
