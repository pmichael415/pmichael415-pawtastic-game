// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
import * as ece from "http_ece";
import { b64url, encryptPayload, fromB64url, generateVapidKeys, sendWebPush, vapidHeader } from "./webpush";

function userAgent() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, sub: { p256dh: b64url(new Uint8Array(ecdh.getPublicKey())), auth: b64url(new Uint8Array(auth)) } };
}
const text = (s: string) => new TextEncoder().encode(s);

describe("payload encryption (RFC 8291 aes128gcm)", () => {
  it("an independent implementation (http_ece) decrypts what we send", async () => {
    const ua = userAgent();
    const plain = '{"title":"Hi","body":"New week!"}';
    const body = await encryptPayload(text(plain), ua.sub);
    const out = ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: ua.ecdh, authSecret: ua.auth });
    expect(out.toString("utf8")).toBe(plain);
  });

  it("uses one 4096-byte record with our 65-byte public key in the header", async () => {
    const ua = userAgent();
    const plain = text("hello");
    const body = await encryptPayload(plain, ua.sub);
    expect([...body.subarray(16, 20)]).toEqual([0, 0, 16, 0]);
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(4); // uncompressed P-256 point
    expect(body.length).toBe(16 + 4 + 1 + 65 + plain.length + 1 + 16);
  });

  it("every message gets a fresh salt and key", async () => {
    const ua = userAgent();
    const a = await encryptPayload(text("same"), ua.sub);
    const b = await encryptPayload(text("same"), ua.sub);
    expect(b64url(a)).not.toBe(b64url(b));
  });
});

describe("VAPID signing", () => {
  it("signs a 12-hour token for the push service's origin that verifies with the public key", async () => {
    const keys = await generateVapidKeys();
    expect(fromB64url(keys.publicKey)).toHaveLength(65);
    const now = 1_793_600_000;
    const h = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", keys, "mailto:info@pawtasticacademy.com", now);
    expect(h).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
    const [, token, k] = /^vapid t=(\S+), k=(\S+)$/.exec(h)!;
    expect(k).toBe(keys.publicKey);
    const [head, claims, sig] = token!.split(".");
    expect(JSON.parse(Buffer.from(head!, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: now + 43200,
      sub: "mailto:info@pawtasticacademy.com",
    });
    const pub = fromB64url(keys.publicKey);
    const jwk = { kty: "EC", crv: "P-256", x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) };
    const ok = verify("sha256", Buffer.from(`${head}.${claims}`), { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(sig!, "base64url"));
    expect(ok).toBe(true);
  });
});

describe("sending", () => {
  it("POSTs the encrypted message to the subscription's endpoint with Web Push headers and returns the status", async () => {
    const keys = await generateVapidKeys();
    const ua = userAgent();
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const status = await sendWebPush(
      { endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...ua.sub },
      { title: "New week!", body: "Prizes are up.", url: "/?utm_source=notification", tag: "m1" },
      keys,
      "mailto:info@pawtasticacademy.com",
      fake,
    );
    expect(status).toBe(201);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    const headers = new Headers(init.headers);
    expect(url).toBe("https://fcm.googleapis.com/fcm/send/abc");
    expect(init.method).toBe("POST");
    expect(headers.get("TTL")).toBe("86400");
    expect(headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(headers.get("Content-Type")).toBe("application/octet-stream");
    expect(headers.get("Urgency")).toBe("normal");
    expect(headers.get("Authorization")).toMatch(/^vapid t=/);
    const plain = ece.decrypt(Buffer.from(init.body as Uint8Array), { version: "aes128gcm", privateKey: ua.ecdh, authSecret: ua.auth });
    expect(JSON.parse(plain.toString())).toEqual({ title: "New week!", body: "Prizes are up.", url: "/?utm_source=notification", tag: "m1" });
  });
});
