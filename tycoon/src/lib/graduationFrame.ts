// Graduation Day plays in a frame on /graduation. Two things come back to the hub's address that belong to the
// game: Stripe's return after a purchase (?checkout=…&session_id=…) and the email sign-in link (#access_token=…).
// They are handed to the frame, checked against their known shapes, and taken off the hub's own address.
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{1,200}$/;
const SIGN_IN = /^#access_token=[A-Za-z0-9._~=&%+-]{1,4000}$/;

export type GraduationFrame = { src: string; hubSearch: string; hubHash: string; moved: boolean };

export function graduationFrame(base: string, search: string, hash: string): GraduationFrame {
  const page = `${base}graduation/index.html`;
  const hub = new URLSearchParams(search);
  const game = new URLSearchParams();
  const checkout = hub.get("checkout");
  if (checkout === "success" || checkout === "cancel") {
    game.set("checkout", checkout);
    const session = hub.get("session_id");
    if (session && SESSION_ID.test(session)) game.set("session_id", session);
  }
  const moved = hub.has("checkout") || hub.has("session_id") || hash.startsWith("#access_token=");
  hub.delete("checkout");
  hub.delete("session_id");
  const signIn = SIGN_IN.test(hash) ? hash : "";
  const query = game.toString();
  const rest = hub.toString();
  return {
    src: `${page}${query ? `?${query}` : ""}${signIn}`,
    hubSearch: rest ? `?${rest}` : "",
    hubHash: hash.startsWith("#access_token=") ? "" : hash,
    moved,
  };
}
