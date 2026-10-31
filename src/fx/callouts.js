// Words and pitches that grow with a cascade: the second chain says "Good pup!",
// and each step climbs one note of a C-major pentatonic ladder.

const CALLOUTS = [[5, 'Top of the class!'], [4, 'Fetch-tastic!'], [3, 'Pawsome!'], [2, 'Good pup!']];
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16];

export const SPECIAL_LABELS = { zoomieH: 'Zoomie!', zoomieV: 'Zoomie!', bomb: 'Bone Bomb!', blaster: 'Bubble Blaster!' };

export function calloutFor(step) {
  return CALLOUTS.find(([min]) => step >= min)?.[1] ?? null;
}

// How much bigger the callout gets per cascade step (capped so it still fits the board).
export function calloutSize(step) {
  if (!(step >= 2)) return 1;
  return Math.min(1.2, Math.round((1 + (step - 2) * 0.05) * 100) / 100);
}

// Semitones above C5 for this cascade step.
export function pitchFor(step) {
  if (!(step >= 1)) return 0;
  return LADDER[Math.min(step, LADDER.length) - 1];
}
