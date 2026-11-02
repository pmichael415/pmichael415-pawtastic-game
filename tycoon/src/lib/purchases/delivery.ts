// Delivering consumables (coins, power-ups) exactly once. Server rows are reserved for one account and one
// installation before a game adds them to its save (spec: "Delivery: reserve, apply, confirm").
import type { Contents } from "@/lib/catalog";

/** A reserved delivery as the server returns it; `reverses` names the delivery a refund takes back. */
export type Delivery = { id: string; contents: Contents; reverses: string | null };
