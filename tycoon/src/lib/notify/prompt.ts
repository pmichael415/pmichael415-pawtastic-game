// When the "Notify me" card may appear: never on the first visit, only after a good moment (end of a Daycare day,
// end of a Recess Rush run); after one "No thanks" it may return once, 14 days later; after that only in Settings.
import { useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { pushSupport, type PushSupport } from "./client";

export const PROMPT_KEY = "pawtastic-notify-prompt";
export type PromptState = { declines: number; lastDeclineAt: number | null; accepted: boolean };
const DAY = 86_400_000;
const FRESH: PromptState = { declines: 0, lastDeclineAt: null, accepted: false };

export function shouldOffer(s: PromptState, now: number): boolean {
  if (s.accepted) return false;
  if (s.declines === 0) return true;
  return s.declines === 1 && s.lastDeclineAt !== null && now - s.lastDeclineAt >= 14 * DAY;
}
export const recordDecline = (s: PromptState, now: number): PromptState => ({ ...s, declines: s.declines + 1, lastDeclineAt: now });
export const recordAccept = (s: PromptState): PromptState => ({ ...s, accepted: true });

export function loadPrompt(): PromptState {
  try {
    const v = JSON.parse(localStorage.getItem(PROMPT_KEY) ?? "null") as Partial<PromptState> | null;
    if (!v) return FRESH;
    return {
      declines: typeof v.declines === "number" ? v.declines : 0,
      lastDeclineAt: typeof v.lastDeclineAt === "number" ? v.lastDeclineAt : null,
      accepted: v.accepted === true,
    };
  } catch {
    return FRESH;
  }
}
export function savePrompt(s: PromptState) {
  try {
    localStorage.setItem(PROMPT_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

type Card = { open: boolean; support: PushSupport };
let card: Card = { open: false, support: "unsupported" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call after a good moment in a game. Shows the card only when allowed and when notifications can work here. */
export function goodMoment(support: PushSupport = pushSupport()): void {
  if (card.open || support === "unsupported" || support === "blocked") return;
  if (!shouldOffer(loadPrompt(), Date.now())) return;
  card = { open: true, support };
  track("notify_prompt", { support });
  emit();
}
export function closeNotifyCard(): void {
  if (!card.open) return;
  card = { ...card, open: false };
  emit();
}
export const useNotifyCard = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => card,
    () => card,
  );
