// Web Push for Cloudflare Workers (WebCrypto only, no Node libraries): VAPID signing (RFC 8292) and payload
// encryption (RFC 8291, aes128gcm). Checked in tests against the independent http_ece implementation.
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };
export type PushMessage = { title: string; body: string; url: string; tag: string };
export type PushSubscriptionKeys = { p256dh: string; auth: string };

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const buf = (b: Uint8Array) => b as unknown as BufferSource;

export function b64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey("raw", buf(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", k, buf(data)));
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey("raw", pair.publicKey));
  const privateJwk = await subtle().exportKey("jwk", pair.privateKey);
  return { publicKey: b64url(raw), privateJwk };
}

/** `vapid t=<JWT>, k=<public key>` for one push service origin, valid 12 hours. */
export async function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, nowSec: number): Promise<string> {
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject })));
  const key = await subtle().importKey("jwk", { ...keys.privateJwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, key, buf(enc.encode(`${head}.${claims}`))));
  return `vapid t=${head}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

const RECORD_SIZE = 4096;

/** Encrypts one message for one browser subscription (a single aes128gcm record). */
export async function encryptPayload(
  plain: Uint8Array,
  sub: PushSubscriptionKeys,
  opts: { salt?: Uint8Array; asKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  if (plain.length + 1 + 16 > RECORD_SIZE - 86) throw new Error("push payload too large");
  const uaPub = fromB64url(sub.p256dh);
  const auth = fromB64url(sub.auth);
  if (uaPub.length !== 65 || uaPub[0] !== 4 || auth.length !== 16) throw new Error("bad subscription keys");
  const salt = opts.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const as = opts.asKeys ?? ((await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPub = new Uint8Array(await subtle().exportKey("raw", as.publicKey));
  const uaKey = await subtle().importKey("raw", buf(uaPub), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));

  const prkKey = await hmac(auth, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).subarray(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).subarray(0, 12);

  const key = await subtle().importKey("raw", buf(cek), { name: "AES-GCM" }, false, ["encrypt"]);
  const sealed = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: buf(nonce), tagLength: 128 }, key, buf(concat(plain, new Uint8Array([2])))),
  );
  const rs = new Uint8Array([(RECORD_SIZE >>> 24) & 255, (RECORD_SIZE >>> 16) & 255, (RECORD_SIZE >>> 8) & 255, RECORD_SIZE & 255]);
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, sealed);
}

/** Sends one notification; returns the push service's HTTP status (201 = accepted, 404/410 = subscription gone). */
export async function sendWebPush(
  sub: { endpoint: string } & PushSubscriptionKeys,
  msg: PushMessage,
  keys: VapidKeys,
  subject: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const body = await encryptPayload(enc.encode(JSON.stringify(msg)), sub);
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, keys, subject, Math.floor(Date.now() / 1000)),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body: buf(body) as BodyInit,
  });
  return res.status;
}
