// Turns one resolve step into the sounds and visual cues the board plays for it.

import { calloutFor } from './callouts.js';

const soundOf = type => (type === 'zoomieH' || type === 'zoomieV' ? 'zoomie' : type);

export function stepEffects(step, stepNo) {
  const fired = step.cleared.filter(t => t.special).map(t => ({ type: t.special, r: t.r, c: t.c }));
  const made = step.created.filter(cr => cr.tile?.special).map(cr => ({ special: cr.tile.special, r: cr.r, c: cr.c }));
  const sounds = [];
  if (step.cleared.length) sounds.push(['match', stepNo]);
  for (const type of new Set(fired.map(f => soundOf(f.type)))) sounds.push([type]);
  if (made.length) sounds.push(['special-made']);
  if (step.crates.length) sounds.push(['crate']);
  if (step.mud.length) sounds.push(['mud']);
  const n = step.cleared.length;
  const centroid = n
    ? { r: step.cleared.reduce((s, t) => s + t.r, 0) / n, c: step.cleared.reduce((s, t) => s + t.c, 0) / n }
    : null;
  return { sounds, callout: calloutFor(stepNo), fired, made, centroid, points: step.points };
}
