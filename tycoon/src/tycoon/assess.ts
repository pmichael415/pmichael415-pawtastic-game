// PAWtastic Daycare Tycoon — how a visit went, judged only from what happened (service design, "Satisfaction,
// receipt, complaints"). Pure: the receipt, any complaints, satisfaction and the owner's mood.
import { MOMENT_TIP, activityOf } from "./moments";
import { DESK_GIVES_UP, DESK_IMPATIENT } from "./waiting";
import { roomCleanOf, roomName, roomOfDog } from "./rooms";
import { bathPay } from "./business";
import { funAppeal, tip } from "./effects";
import { visitOf } from "./visit";
import type { ComplaintKind, Facility, IncomeKey, Mood, RemedyKind, TDog } from "./types";

export type { ComplaintKind, Mood, RemedyKind };
export type Complaint = { kind: ComplaintKind; text: string; penalty: number; remedy: RemedyKind | null; resolved: boolean };
export type ReceiptLine = { label: string; amount: number; key?: IncomeKey };
export type Assessment = {
  lines: ReceiptLine[];
  total: number;
  parts: Partial<Record<IncomeKey, number>>;
  satisfaction: number;
  mood: Mood;
  complaints: Complaint[];
  /** What went well, for the owner's words at pickup. */
  praise: string[];
};

export const OWNER_PATIENCE = 30; // game minutes an owner waits at pickup before it's a complaint
export const DIRTY_BELOW = 40;
/** The lowest a calm-room safety move leaves a family's satisfaction (before any real complaint): neutral, no reputation change. */
export const SAFE_FLOOR = 50;

export const moodOf = (sat: number): Mood => (sat >= 80 ? "delighted" : sat >= 60 ? "content" : sat >= 40 ? "disappointed" : "upset");

/** `credit`: a credit owed from a past visit, taken off this bill. `exitBath`: an exit bath chosen at pickup. */
export function assessVisit(f: Facility, dog: TDog, opts: { exitBath?: boolean; credit?: number }): Assessment {
  const v = visitOf(f, dog);
  const now = f.clockMin;
  const placed = dog.place.kind === "room" || dog.place.kind === "bed";
  const safe = dog.place.kind === "calm" && v.safeMove;
  const provided = placed || dog.played > 0;
  const bathBooked = v.requests.includes("bath");
  const prepaidBath = v.prepaid.includes("bath");
  const ownerWait = v.ownerHere === null ? v.waitBefore ?? 0 : Math.max(0, Math.round(now - v.ownerHere));

  // ---- satisfaction ----
  let sat = 0.6 * dog.happiness + 30;
  // A calm-room safety move is never held against you: a pup kept safe all day leaves the family neutral at worst
  // (no charge, no reputation lost). Real problems — a dirty room, a long wait — still count below.
  if (safe) sat = Math.max(sat, SAFE_FLOOR);
  const praise: string[] = [];
  const complaints: Complaint[] = [];
  const add = (kind: ComplaintKind, text: string, penalty: number) => {
    complaints.push({ kind, text, penalty, remedy: v.remedies[kind] ?? null, resolved: false });
    sat -= penalty;
  };
  if (dog.played > 0) {
    sat += 15;
    praise.push(`${dog.name} had playtime`);
  } else if (!safe) sat -= 15;
  if (bathBooked && dog.bathed) praise.push("the bath was done");
  if (bathBooked && !dog.bathed) {
    const still = dog.bathing ? `${dog.name} is still in the bath` : `the bath ${v.owner} booked wasn't done`;
    if (prepaidBath) add("billing", `${v.owner} prepaid a bath, but ${still}.`, 25);
    else add("bath", `${still[0]!.toUpperCase()}${still.slice(1)}.`, 25);
  }
  const own = roomOfDog(f, dog);
  if (roomCleanOf(f, own) < DIRTY_BELOW) add("dirty", `${own ? roomName(f, own) : "The daycare"} looked dirty.`, 15);
  if (ownerWait > OWNER_PATIENCE) add("wait", `${v.owner} waited ${ownerWait} minutes at pickup.`, ownerWait >= 60 ? 25 : 15);
  if (v.waitedLobby > 60) sat -= 10;
  // ignored at the desk (never checked in): a real wait complaint — a turn-away never gets here, it's free
  const deskWait = !dog.checkedIn ? (v.arrivedDay === f.day ? Math.max(0, Math.round(now - v.arrived)) : v.waitedLobby) : 0;
  if (deskWait >= DESK_IMPATIENT) add("wait", `${v.owner} waited ${deskWait} minutes at the front desk and nobody checked ${dog.name} in.`, deskWait >= DESK_GIVES_UP ? 40 : 20);
  if (v.scuffle) sat -= 20;
  if (!safe && (!provided || dog.happiness < 45)) add("attention", provided ? `${dog.name} seemed unhappy — not enough attention.` : dog.checkedIn ? `${dog.name} never got a playroom.` : `${dog.name} was never checked in.`, 0);

  // ---- the player's answers: completing the service, a refund, a credit — or just an explanation ----
  const daycareCharge = safe || !provided ? 0 : Math.round(f.prices.daycare * (0.6 + (0.4 * dog.happiness) / 100));
  const refunds: { label: string; amount: number }[] = [];
  for (const c of complaints) {
    if (c.remedy === "refund") {
      const amt = refundFor(c.kind, v.paid, daycareCharge);
      if (amt > 0) refunds.push({ label: `Refund — ${REFUND_LABEL[c.kind]}`, amount: -amt });
      sat += 20;
      c.resolved = true;
    } else if (c.remedy === "credit") {
      sat += 12;
      c.resolved = true;
    } else if (c.remedy === "explain") {
      if (c.kind === "wait" && ownerWait <= 45) {
        sat += 5;
        c.resolved = true;
      }
    } else if (c.remedy === "finish") c.resolved = false; // still there, so not finished yet
  }
  // a service completed while the owner waited: the complaint is gone, the extra wait is a small cost
  for (const k of ["bath", "billing", "attention", "dirty"] as ComplaintKind[]) {
    if (v.remedies[k] !== "finish" || complaints.some((c) => c.kind === k)) continue;
    sat -= k === "bath" || k === "billing" ? 5 : k === "attention" ? 3 : 0;
    complaints.push({ kind: k, text: FINISHED_TEXT[k], penalty: 0, remedy: "finish", resolved: true });
  }
  // an hour's wait (the owner gave up) is never a pleasant pickup, however happy the pup
  if (ownerWait >= 60) sat = Math.min(sat, 55);
  sat = Math.max(0, Math.min(100, Math.round(sat)));
  const mood = moodOf(sat);

  // ---- the bill ----
  const lines: ReceiptLine[] = [];
  if (safe) lines.push({ label: "Daycare — kept safe in the calm room (no charge)", amount: 0 });
  else if (!provided) lines.push({ label: "Daycare — not provided (no charge)", amount: 0 });
  else lines.push({ label: `Daycare (${Math.round(dog.happiness)}% happy)`, amount: Math.round(f.prices.daycare * (0.6 + (0.4 * dog.happiness) / 100)), key: "daycare" });
  if (bathBooked || dog.bathed) {
    if (dog.bathed && prepaidBath) lines.push({ label: "Bath (prepaid at check-in)", amount: 0 });
    else if (dog.bathed) lines.push({ label: "Bath", amount: bathPay(f), key: "baths" });
    else lines.push({ label: prepaidBath ? "Bath — prepaid, not done" : "Bath — not done (not charged)", amount: 0 });
  }
  if (opts.exitBath) lines.push({ label: "Exit bath", amount: f.prices.exitBath, key: "exitBaths" });
  if (dog.boarding) lines.push(dog.place.kind === "bed" ? { label: "Boarding", amount: f.prices.boarding, key: "boarding" } : { label: "Boarding — no bed provided (no charge)", amount: 0 });
  const t = tip(funAppeal(f).appeal);
  const tipNow = mood === "delighted" ? t : mood === "content" ? Math.floor(t / 2) : 0;
  if (tipNow > 0) lines.push({ label: "Tip", amount: tipNow, key: "tips" });
  // a personal moment you shared: the pup tells the family, and they add a little extra (once per visit)
  if (v.moment?.state === "done") lines.push({ label: `Tip — ${dog.name} told them about ${activityOf(v.moment.kind)} with you`, amount: MOMENT_TIP, key: "tips" });
  const subtotal = lines.reduce((n, l) => n + l.amount, 0);
  const credit = Math.min(subtotal, Math.max(0, Math.round(opts.credit ?? 0)));
  if (credit > 0) lines.push({ label: "Credit from last visit", amount: -credit });
  // refunds never pay out more than the family paid: today's bill (after any credit) plus anything prepaid
  let allowed = Math.max(0, subtotal - credit) + v.paid;
  for (const r of refunds) {
    const amt = Math.min(-r.amount, allowed);
    allowed -= amt;
    if (amt > 0) lines.push({ label: r.label, amount: -amt });
  }
  const refundLines = lines.filter((l) => /^Refund/.test(l.label));
  const refunded = -refundLines.reduce((n, r) => n + r.amount, 0);

  // income parts: the credit and refunds come off daycare first, then the rest (a bigger refund is paid out)
  const parts: Partial<Record<IncomeKey, number>> = {};
  for (const l of lines) if (l.key && l.amount > 0) parts[l.key] = (parts[l.key] ?? 0) + l.amount;
  let owed = credit + refunded;
  for (const k of ["daycare", "baths", "boarding", "exitBaths", "tips"] as IncomeKey[]) {
    if (!owed || !parts[k]) continue;
    const take = Math.min(owed, parts[k]!);
    parts[k] = parts[k]! - take;
    owed -= take;
  }
  return { lines, total: subtotal - credit - refunded, parts, satisfaction: sat, mood, complaints, praise };
}

const REFUND_LABEL: Record<ComplaintKind, string> = { wait: "the wait", bath: "the bath", billing: "prepaid bath not done", attention: "not enough attention", dirty: "dirty rooms" };
const FINISHED_TEXT: Record<ComplaintKind, string> = {
  wait: "",
  bath: "The bath was finished while the owner waited.",
  billing: "The prepaid bath was finished while the owner waited.",
  attention: "A quick playtime before going home.",
  dirty: "The rooms were mopped before pickup.",
};
/** What a refund gives back for each complaint (0 when there's nothing to refund). */
export function refundFor(kind: ComplaintKind, paid: number, daycareCharge: number): number {
  if (kind === "billing") return paid;
  if (kind === "bath") return 0; // nothing was charged for it
  if (kind === "attention") return Math.round(daycareCharge * 0.5);
  return Math.round(daycareCharge * 0.25);
}
