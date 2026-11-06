// The server's clock, as the game knows it. A phone's clock can be hours or days off; the season's countdowns, its
// state (running or over) and the chapter to play must follow the server's. Every answer from the game's server
// carries `serverNow`; the offset is that time minus the midpoint of sending and receiving, so "now" is
// Date.now() + offset. Until the first answer the offset is 0 (the phone's clock).

let offset = null; // server time minus phone time, from the latest answer that carried serverNow

/** Records an answer's serverNow (an ISO time), sent and received at these phone times. False when unusable. */
export function noteServerTime(serverNowIso, sentAt, receivedAt) {
  const server = typeof serverNowIso === 'string' ? Date.parse(serverNowIso) : NaN;
  if (!Number.isFinite(server) || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt) || receivedAt < sentAt) return false;
  offset = server - (sentAt + receivedAt) / 2;
  return true;
}

/** True once an answer has told the server's time. */
export const serverClockKnown = () => offset !== null;

/** The server's time now: the phone's clock plus the offset (the phone's clock until the server answers). */
export const serverNow = (phone = Date.now()) => phone + (offset ?? 0);

/** For tests: forget the server's clock. */
export function resetServerClock() { offset = null; }
