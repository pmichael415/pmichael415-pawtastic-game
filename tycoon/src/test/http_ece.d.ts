// Test-only reference implementation of RFC 8188 / RFC 8291 encrypted content encoding.
declare module "http_ece" {
  import type { ECDH } from "node:crypto";
  export function decrypt(buffer: Buffer, params: { version: "aes128gcm"; privateKey: ECDH; authSecret: Buffer | string }): Buffer;
}
