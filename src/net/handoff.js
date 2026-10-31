// The one-time sign-in code the PAWtastic app adds to the game's address (#h=<code>).

const HANDOFF = /^#h=([A-Za-z0-9_-]{20,100})$/;

export function readHandoffCode(hash) {
  return HANDOFF.exec(hash ?? '')?.[1] ?? null;
}

// Takes the code out of the address bar (and history) once it has been read.
export function stripHandoff(loc, hist) {
  hist.replaceState(null, '', loc.pathname + loc.search);
}
