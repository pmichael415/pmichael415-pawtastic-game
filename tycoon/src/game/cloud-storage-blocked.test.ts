// Blocked browser storage (audit gap B, found in a real browser): the hub reads which cloud saves this device is
// linked to while it renders. When even getting `window.localStorage` throws, that read must not throw — it used to,
// and the whole app's root failed to load ("This page didn't load"), so no game could start.
import { afterEach, describe, expect, it } from "vitest";
import { getLinks } from "./cloud";

const real = Object.getOwnPropertyDescriptor(window, "localStorage")!;
afterEach(() => {
  Object.defineProperty(window, "localStorage", real);
});

describe("cloud-save links with blocked storage", () => {
  it("getting localStorage throws: no links, and no error", () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
    expect(() => getLinks()).not.toThrow();
    expect(getLinks()).toBeNull();
  });
});
