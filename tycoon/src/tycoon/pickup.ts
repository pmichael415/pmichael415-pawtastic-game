// PAWtastic Daycare Tycoon — answering a complaint at pickup (service design, "Complaints"): finish the service
// while the owner waits, a game-coin refund, or explain (no credit for next time). One answer per complaint; an
// explanation alone never clears a bath, billing or attention complaint.
import { freeTub } from "./rooms";
import { assessVisit, refundFor, type Assessment } from "./assess";
import { caps } from "./connect";
import { BATH_MIN, bath, clean, playtime } from "./run";
import { DAY_CLOSE } from "@/game/engine";
import { fac, withFac } from "./state";
import { visitOf, logVisit, fmtTime } from "./visit";
import type { ComplaintKind, RemedyKind, TResult, TycoonState } from "./types";
import { refuses } from "./business";

export type PickupView = { assessment: Assessment; options: Partial<Record<ComplaintKind, RemedyKind[]>> };

/** The bill and complaints as they stand, and the answers available for each complaint. */
export function pickupView(s: TycoonState, dogId: string, exitBath: boolean): PickupView {
  const f = fac(s);
  const dog = f.dogs.find((d) => d.id === dogId);
  if (!dog) throw new Error("That pup already went home.");
  const v = visitOf(f, dog);
  const assessment = assessVisit(f, dog, { exitBath });
  const daycare = assessment.lines.find((l) => l.key === "daycare")?.amount ?? 0;
  const energy = Math.max(0, ...f.staff.map((x) => x.energy));
  const placed = dog.place.kind === "room" || dog.place.kind === "bed";
  const options: PickupView["options"] = {};
  for (const c of assessment.complaints) {
    if (c.remedy) continue; // already answered
    const o: RemedyKind[] = [];
    // finishing the bath only when it can be done before closing (18:00)
    const fits = f.clockMin + (dog.bathing || BATH_MIN) <= DAY_CLOSE;
    if ((c.kind === "bath" || c.kind === "billing") && fits && (dog.bathing || (placed && !!freeTub(f) && energy >= 15 && !refuses("bath", f)))) o.push("finish");
    if (c.kind === "attention" && placed && !dog.bathing && energy >= 10) o.push("finish");
    if (c.kind === "dirty" && energy >= 10) o.push("finish");
    if (refundFor(c.kind, v.paid, daycare) > 0) o.push("refund");
    o.push("explain");
    options[c.kind] = o;
  }
  return { assessment, options };
}

/** Applies the player's answer to one complaint and returns the owner's reaction. */
export function remedy(s: TycoonState, dogId: string, kind: ComplaintKind, choice: RemedyKind): TResult {
  const f = fac(s);
  const dog = f.dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  const v = visitOf(f, dog);
  if (v.remedies[kind]) return { ok: false, error: `You've already answered ${v.owner} about that.` };
  const view = pickupView(s, dogId, false);
  const complaint = view.assessment.complaints.find((c) => c.kind === kind);
  if (!complaint) return { ok: false, error: "There's no such complaint." };
  if (!view.options[kind]?.includes(choice)) return { ok: false, error: "That answer isn't possible right now." };
  let out = s;
  let reaction = "";
  if (choice === "finish") {
    if (kind === "bath" || kind === "billing") {
      if (!dog.bathing) {
        const r = bath(out, dogId);
        if (!r.ok) return r;
        out = r.state;
      }
      reaction = `${v.owner}: "OK, I'll wait for the bath." ${dog.name} goes home as soon as it's done.`;
    } else if (kind === "attention") {
      const r = playtime(out, dogId);
      if (!r.ok) return r;
      out = r.state;
      reaction = `${v.owner}: "Thanks — that's what we come here for."`;
    } else {
      const r = clean(out);
      if (!r.ok) return r;
      out = r.state;
      reaction = `${v.owner}: "That's better, thank you."`;
    }
  } else if (choice === "refund") {
    reaction = `${v.owner}: "Thank you — that's fair."`;
  } else {
    const minor = kind === "wait" && complaint && v.ownerHere !== null && f.clockMin - v.ownerHere <= 45;
    reaction = minor ? `${v.owner}: "No problem — thanks for letting me know."` : `${v.owner}: "An apology isn't enough — ${kind === "wait" ? "I waited a long time" : kind === "dirty" ? "the rooms were dirty" : kind === "attention" ? "my dog needed attention" : "I booked a bath"}."`;
  }
  const g = fac(out);
  const waiting = choice === "finish" && (kind === "bath" || kind === "billing");
  out = withFac(out, {
    ...g,
    dogs: g.dogs.map((d) =>
      d.id === dogId
        ? {
            ...d,
            visit: logVisit(
              {
                ...visitOf(g, d),
                remedies: { ...visitOf(g, d).remedies, [kind]: choice },
                // they agree to wait: the wait so far still counts (and any remedy for it stands); no more piles up
                ...(waiting ? { finishing: "bath" as const, ownerHere: null, waitBefore: visitOf(g, d).ownerHere === null ? visitOf(g, d).waitBefore : Math.max(0, Math.round(g.clockMin - visitOf(g, d).ownerHere!)) } : {}),
              },
              `${fmtTime(g.clockMin)} — ${choice} (${kind})`,
            ),
          }
        : d,
    ),
  });
  return { ok: true, state: out, msg: reaction };
}
