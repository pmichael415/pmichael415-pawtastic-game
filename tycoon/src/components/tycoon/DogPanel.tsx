// One pup and everything staff can do for it right now.

import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { BREEDS, FAVORITE_LABEL, groupName, groupOf, personalityOf, traitLabel } from "@/game/engine";
import { bathPay, checkoutPay } from "@/tycoon/business";
import { caps } from "@/tycoon/connect";
import { assignBed, assignRoom, bath, checkIn, checkout, inActiveScuffle, playtime, roomDogs, toCalm, turnAway } from "@/tycoon/run";
import { fmtTime, visitOf } from "@/tycoon/visit";
import { ROOM_TYPE_NAMES } from "@/tycoon/catalog";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { Facility, TDog, TResult, TycoonState } from "@/tycoon/types";
import { assessVisit } from "@/tycoon/assess";
import { roomCleanOf, roomName, roomOfDog } from "@/tycoon/rooms";
import { responsibleFor } from "@/tycoon/team";
import { STAGE_WORDS, waitStage } from "@/tycoon/waiting";
import { MOMENT_ACTION, MOMENT_ASK, MOMENT_TIP, activityOf, answerMoment } from "@/tycoon/moments";

/** How the playing screen checks a pup out (the pickup sheet when there's a complaint); falls back to checking out. */
export const CheckoutContext = createContext<((dogId: string, exitBath: boolean) => void) | null>(null);

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;

function placeLabel(f: Facility, d: TDog): string {
  if (d.place.kind === "lobby") return d.checkedIn ? "Waiting in the lobby" : "Just dropped off";
  const room = f.rooms.find((r) => r.uid === (d.place as { room: string }).room);
  if (d.place.kind === "bed") return "In a boarding bed";
  if (d.place.kind === "calm") return room ? "Calming down" : "Calming down at the desk";
  return room?.group ? `In ${groupName(room.group)}` : room?.type ? ROOM_TYPE_NAMES[room.type] : "In a room";
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="w-14">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary" style={{ width: `${Math.round(value)}%` }} />
      </div>
    </div>
  );
}

export function DogPanel({ f, dog, act }: { f: Facility; dog: TDog; act: Act }) {
  const [confirmRoom, setConfirmRoom] = useState<string | null>(null);
  const onCheckout = useContext(CheckoutContext);
  const leave = (exitBath: boolean) => (onCheckout ? onCheckout(dog.id, exitBath) : act((s) => checkout(s, dog.id, exitBath)));
  const v = visitOf(f, dog);
  const personality = personalityOf(dog);
  const moment = v.moment ?? null;
  const waited = v.ownerHere === null ? 0 : Math.max(0, Math.round(f.clockMin - v.ownerHere));
  // the honest total, the same as the bill (no tip for an unhappy family, baths only if done, credits off)
  const credit = f.guestBook.find((g) => g.name === dog.name && g.breed === dog.breed)?.credit ?? 0;
  const billFor = (exitBath: boolean) => (dog.checkedIn ? assessVisit(f, dog, { exitBath, credit }).total : 0);
  const c = caps(f);
  const scuffle = inActiveScuffle(f, dog);
  const placed = dog.place.kind === "room" || dog.place.kind === "bed";
  const btn = "h-11";
  const wait = waitStage(f, dog);
  const room = roomOfDog(f, dog);
  const needs = [
    !dog.checkedIn && "check-in",
    dog.checkedIn && !placed && dog.place.kind !== "calm" && (dog.boarding ? "a boarding bed" : "a playroom"),
    placed && !dog.bathing && (dog.played === 0 || dog.happiness < 70) && "play",
    v.requests.includes("bath") && !dog.bathed && !dog.bathing && "a bath (booked)",
  ].filter((x): x is string => !!x);

  const assign = (roomUid: string, confirm = false) => {
    const r = act((s) => assignRoom(s, dog.id, roomUid, confirm));
    setConfirmRoom(!r.ok && r.error.includes("Confirm to place anyway") ? roomUid : null);
  };

  return (
    <article aria-label={dog.name} className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-baseline gap-2">
        <h4 className="font-semibold text-secondary">{dog.name}</h4>
        <span className="text-xs text-muted-foreground">
          {BREEDS[dog.breed]?.name} · {traitLabel(dog)}
          {dog.boarding ? " · overnight" : ""}
          {dog.visits > 1 ? ` · visit #${dog.visits}` : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Loves {FAVORITE_LABEL[personality.favorite]} · {personality.trait}
      </p>
      {moment?.state === "open" && (
        <section aria-label={`${dog.name} is asking for you`} className="mt-1 rounded-lg border-2 border-primary/60 bg-primary/10 px-2 py-1.5">
          <p className="text-sm font-semibold text-secondary">
            ✨ {dog.name} {MOMENT_ASK[moment.kind]}
          </p>
          <p className="text-[11px] text-muted-foreground">Only you can do this — your team leaves it for you. No rush: if you miss it, nothing is lost.</p>
          <Button className="mt-1 h-11" onClick={() => act((s) => answerMoment(s, dog.id))}>
            {MOMENT_ACTION[moment.kind](dog.name)}
          </Button>
        </section>
      )}
      {moment?.state === "done" && (
        <p className="mt-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-secondary">
          ✨ You shared {activityOf(moment.kind)} with {dog.name} — the family will hear about it at pickup (+{MOMENT_TIP} tip)
        </p>
      )}
      <p className="text-xs text-secondary">
        Booked {v.requests.join(" + ")}
        {v.prepaid.length ? ` (${v.prepaid.join(", ")} prepaid)` : ""} · {v.owner} · pickup {v.pickupDay > f.day ? "tomorrow " : ""}{fmtTime(v.pickup)}
      </p>
      {v.ownerHere !== null && (
        <p className="mt-1 rounded-lg bg-accent/40 px-2 py-1 text-xs font-semibold text-secondary">
          {v.owner} is here for pickup{waited ? ` — waiting ${waited} min` : ""}
        </p>
      )}
      {v.finishing && <p className="mt-1 rounded-lg bg-sky px-2 py-1 text-xs font-semibold text-secondary">{v.owner} is waiting for the bath to finish</p>}
      {!!dog.bathing && <p className="mt-1 text-xs text-muted-foreground">In the bath — {Math.ceil(dog.bathing)} min left</p>}
      {wait && wait.stage !== "waiting" && (
        <p role="note" className={`mt-1 rounded-lg px-2 py-1 text-xs font-semibold ${wait.stage === "upset" ? "bg-destructive/15 text-destructive" : "bg-accent/40 text-secondary"}`}>
          {wait.kind === "dropoff" ? `${v.owner}: ${STAGE_WORDS[wait.stage].toLowerCase()} at the desk — ${wait.minutes} game min` : `${v.owner}: ${STAGE_WORDS[wait.stage].toLowerCase()} at pickup — ${wait.minutes} game min`}
          {wait.stage === "upset" ? ` · ${f.introDay === f.day && wait.kind === "dropoff" ? "rescheduled" : "leaves"} in ${wait.leavesIn} game min` : ""}
          {wait.kind === "dropoff" ? " · Next: Check in, or Can't take today" : " · Next: Check out"}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{placeLabel(f, dog)}{scuffle ? " · ⚠️ scuffle" : ""}</p>
      <p className="text-xs text-secondary">
        {room ? `${roomName(f, room)} · ${Math.round(roomCleanOf(f, room))}% clean · ` : ""}Needs: {needs.length ? needs.join(", ") : "nothing right now"}
      </p>
      <p className="text-xs text-secondary">Looked after by {responsibleFor(f, dog)}</p>
      <div className="mt-1 space-y-0.5">
        <Meter label="Happy" value={dog.happiness} />
        <Meter label="Clean" value={dog.clean} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {!dog.checkedIn && (
          <Button className={btn} onClick={() => act((s) => checkIn(s, dog.id))}>
            Check in {dog.name}
          </Button>
        )}
        {!dog.checkedIn && (
          <Button variant="ghost" className={btn} onClick={() => act((s) => turnAway(s, dog.id))}>
            Can't take today
          </Button>
        )}
        {dog.checkedIn && !dog.boarding && dog.place.kind !== "room" &&
          c.playrooms.map((p) => (
            <Button key={p.room.uid} variant={p.group === groupOf(dog) ? "default" : "outline"} className={btn} onClick={() => assign(p.room.uid)}>
              To {groupName(p.group)} ({roomDogs(f, p.room.uid).length}/{p.spots})
            </Button>
          ))}
        {confirmRoom && (
          <Button variant="destructive" className={btn} onClick={() => assign(confirmRoom, true)}>
            Place anyway (scuffle risk)
          </Button>
        )}
        {dog.checkedIn && dog.boarding && dog.place.kind !== "bed" && (() => {
          const free = c.beds.find((b) => !f.dogs.some((x) => x.place.kind === "bed" && x.place.bed === b.bed));
          return free ? (
            <Button className={btn} onClick={() => act((s) => assignBed(s, dog.id, free.bed))}>
              To a boarding bed
            </Button>
          ) : (
            <span className="self-center text-xs text-muted-foreground">No free boarding bed</span>
          );
        })()}
        {placed && (
          <Button variant="secondary" className={btn} onClick={() => act((s) => playtime(s, dog.id))}>
            Playtime
          </Button>
        )}
        {dog.checkedIn && placed && !dog.bathed && c.bath && (
          <Button variant="secondary" className={btn} aria-label="Bath" onClick={() => act((s) => bath(s, dog.id))}>
            Bath <span className="ml-1 text-xs opacity-80">+{bathPay(f)}</span>
          </Button>
        )}
        {dog.checkedIn && dog.place.kind !== "calm" && (placed || scuffle) && (
          <Button variant="outline" className={btn} onClick={() => act((s) => toCalm(s, dog.id))}>
            Calm down
          </Button>
        )}
        {dog.checkedIn && (
          <Button variant="outline" className={btn} aria-label={placed ? "Check out" : "Check out (nothing to charge)"} disabled={!!v.finishing} onClick={() => leave(false)}>
            {placed ? (
              <>
                Check out <span className="ml-1 text-xs text-primary">+{billFor(false)}</span>
              </>
            ) : (
              "Check out (nothing to charge)"
            )}
          </Button>
        )}
        {dog.checkedIn && placed && c.bath && !v.finishing && (
          <Button variant="outline" className={btn} aria-label="Exit bath + check out" onClick={() => leave(true)}>
            Exit bath + check out <span className="ml-1 text-xs text-primary">+{billFor(true)}</span>
          </Button>
        )}
      </div>
    </article>
  );
}
