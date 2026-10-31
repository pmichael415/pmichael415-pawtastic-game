// Friend codes (Invite a friend): 6 letters and digits without look-alikes (no I, O, 0 or 1).
export const FRIEND_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/** A code as typed or carried in a link ("k7q-3dm" → "K7Q3DM"), or null. */
export function normalizeCode(input) {
  const code = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return FRIEND_CODE.test(code) ? code : null;
}
