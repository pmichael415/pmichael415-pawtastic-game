// Blocked browser storage (audit gap B, found again in a real browser for the milestone "make PAWtastic feel like a
// daycare tycoon"): when even getting `window.localStorage` throws, the auth client's storage choice must not throw —
// it used to, and the whole app's root failed to load ("This page didn't load"), so no game could start.
import { afterEach, describe, expect, it } from "vitest";
import { brokeredPreviewStorage } from "./previewAuthStorage";

const real = Object.getOwnPropertyDescriptor(window, "localStorage")!;
afterEach(() => {
  Object.defineProperty(window, "localStorage", real);
});

describe("choosing where the login is kept", () => {
  it("uses localStorage when it's there", () => {
    expect(brokeredPreviewStorage()).toBe(window.localStorage);
  });
  it("doesn't throw when getting localStorage throws: no storage is chosen, so the auth client keeps the login in memory", () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
    expect(() => brokeredPreviewStorage()).not.toThrow();
    expect(brokeredPreviewStorage()).toBeUndefined();
  });
});
