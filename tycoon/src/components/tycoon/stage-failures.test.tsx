// When 3D can't run, the reason is specific and recoverable (service design, "3D diagnostics"): no WebGL, the 3D
// code didn't load, the renderer threw, or the graphics context was lost.
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FallbackNotice } from "./FallbackNotice";
import { newTycoon } from "@/tycoon/state";

const world = vi.hoisted(() => ({ mode: "ok" as "ok" | "load" | "throw" }));
vi.mock("@/tycoon/render/world", () => {
  if (world.mode === "load") throw new Error("Failed to fetch dynamically imported module");
  return {
    webglAvailable: () => true,
    TycoonWorld: class {
      constructor() {
        if (world.mode === "throw") throw new Error("Error creating WebGL context.");
      }
      setSnapshot() {}
      resetCamera() {}
      dispose() {}
      debugInfo() {
        return null;
      }
    },
  };
});
import { TycoonStage } from "./TycoonStage";

const props = (onUnavailable: (r: string, d?: unknown) => void) => ({ state: newTycoon(0), selected: null, ghost: null, overlay: false, pickMode: "objects" as const, onPick: () => {}, onUnavailable });

describe("the 3D stage tells failures apart", () => {
  it("a renderer exception is 'renderer-error', with the message kept for diagnostics", async () => {
    world.mode = "throw";
    const fn = vi.fn();
    render(<TycoonStage {...props(fn)} />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(fn.mock.calls[0]![0]).toBe("renderer-error");
    expect(JSON.stringify(fn.mock.calls[0]![1])).toMatch(/Error creating WebGL context/);
  });
  it("losing the graphics context after starting is 'context-lost'", async () => {
    world.mode = "ok";
    const fn = vi.fn();
    const { container } = render(<TycoonStage {...props(fn)} />);
    await waitFor(() => expect(container.querySelector("canvas")).toBeTruthy());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      container.querySelector("canvas")!.dispatchEvent(new Event("webglcontextlost"));
    });
    expect(fn).toHaveBeenCalledWith("context-lost", expect.anything());
  });
});

describe("the explanation", () => {
  it("says what happened for each reason, offers Try 3D again and the details to copy", () => {
    const retry = vi.fn();
    const { rerender } = render(<FallbackNotice reason="load-failed" onRetry={retry} details={{ reason: "load-failed", message: "Failed to fetch", browser: "test", renderer: null }} />);
    expect(screen.getByText(/didn't finish loading/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try 3D again" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy details" })).toBeTruthy();
    rerender(<FallbackNotice reason="context-lost" onRetry={retry} />);
    expect(screen.getByText(/stopped/)).toBeTruthy();
    rerender(<FallbackNotice reason="renderer-error" onRetry={retry} />);
    expect(screen.getByText(/couldn't start on this device/)).toBeTruthy();
  });
});
