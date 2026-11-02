// The 3D views act on a tap when the finger lifts (pointerup). A phone then sends a "click" at the same spot a
// moment later, aimed at whatever is there by then — and the tap may just have opened a sheet under the finger, so
// that click would press one of its buttons (it pressed "Move to recovery room" in today's Daycare). This swallows
// that one click: the first click within `ms` near the tap spot is stopped before anything else sees it.
export function swallowNextClick(win: Window, x: number, y: number, ms = 700): void {
  const until = Date.now() + ms;
  const onClick = (e: MouseEvent) => {
    stop();
    if (Date.now() > until || Math.hypot(e.clientX - x, e.clientY - y) > 24) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const timer = win.setTimeout(() => stop(), ms);
  function stop() {
    win.clearTimeout(timer);
    win.removeEventListener("click", onClick, true);
  }
  win.addEventListener("click", onClick, true);
}
