// PAWtastic Daycare Tycoon — how a visit went, judged only from what happened (service design, "Satisfaction,
// receipt, complaints"). Pure: the receipt, any complaints, satisfaction and the owner's mood.
import { bathPay } from "./business";
import { funAppeal, tip } from "./effects";
import { visitOf } from "./visit";
import type { Facility, IncomeKey, TDog } from "./types";

export type Mood = "delighted" | "content" | "disappointed" | "upset";
export type ComplaintKind = "wait" | "bath" | "billing" | "attention" | "dirty";
export type Complaint = { kind: ComplaintKind; text: string; penalty: number };
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
  const ownerWait = v.ownerHere === null ? 0 : Math.max(0, Math.round(now - v.ownerHere));

  // ---- satisfaction ----
  let sat = 0.6 * dog.happiness + 30;
  const praise: string[] = [];
  const complaints: Complaint[] = [];
  const add = (kind: ComplaintKind, text: string, penalty: number) => {
    complaints.push({ kind, text, penalty });
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
  if (f.cleanliness < DIRTY_BELOW) add("dirty", "The rooms looked dirty.", 15);
  if (ownerWait > OWNER_PATIENCE) add("wait", `${v.owner} waited ${ownerWait} minutes at pickup.`, 15);
  if (v.waitedLobby > 60) sat -= 10;
  if (v.scuffle) sat -= 20;
  if (!safe && (!provided || dog.happiness < 45)) add("attention", provided ? `${dog.name} seemed unhappy — not enough attention.` : `${dog.name} never got a playroom.`, 0);
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
  if (dog.boarding) lines.push({ label: "Boarding", amount: f.prices.boarding, key: "boarding" });
  const t = tip(funAppeal(f).appeal);
  const tipNow = mood === "delighted" ? t : mood === "content" ? Math.floor(t / 2) : 0;
  if (tipNow > 0) lines.push({ label: "Tip", amount: tipNow, key: "tips" });
  const subtotal = lines.reduce((n, l) => n + l.amount, 0);
  const credit = Math.min(subtotal, Math.max(0, Math.round(opts.credit ?? 0)));
  if (credit > 0) lines.push({ label: "Credit from last visit", amount: -credit });

  // income parts (the credit comes off daycare first, then the rest)
  const parts: Partial<Record<IncomeKey, number>> = {};
  for (const l of lines) if (l.key && l.amount > 0) parts[l.key] = (parts[l.key] ?? 0) + l.amount;
  let owed = credit;
  for (const k of ["daycare", "baths", "boarding", "exitBaths", "tips"] as IncomeKey[]) {
    if (!owed || !parts[k]) continue;
    const take = Math.min(owed, parts[k]!);
    parts[k] = parts[k]! - take;
    owed -= take;
  }
  return { lines, total: subtotal - credit, parts, satisfaction: sat, mood, complaints, praise };
}
