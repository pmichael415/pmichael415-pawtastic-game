import { afterEach, describe, expect, it, vi } from "vitest";
import { swallowNextClick } from "./ghostClick";

const click = (el: Element, x: number, y: number) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));

describe("a tap handled on finger-up doesn't also press what opens under the finger", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });
  it("the phone's follow-up click at the tap spot is swallowed, once", () => {
    const btn = document.createElement("button");
    document.body.append(btn);
    const pressed = vi.fn();
    btn.addEventListener("click", pressed);
    swallowNextClick(window, 100, 200);
    click(btn, 102, 198);
    expect(pressed).not.toHaveBeenCalled();
    click(btn, 102, 198);
    expect(pressed).toHaveBeenCalledTimes(1);
  });
  it("a click somewhere else, or a while later, still works", () => {
    vi.useFakeTimers();
    const btn = document.createElement("button");
    document.body.append(btn);
    const pressed = vi.fn();
    btn.addEventListener("click", pressed);
    swallowNextClick(window, 100, 200);
    click(btn, 300, 500);
    expect(pressed).toHaveBeenCalledTimes(1);
    swallowNextClick(window, 100, 200);
    vi.advanceTimersByTime(1000);
    click(btn, 100, 200);
    expect(pressed).toHaveBeenCalledTimes(2);
  });
});
