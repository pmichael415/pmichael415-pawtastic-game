// The stuck-player hint: after `delay` ms without input, nudge a valid pair, and
// again every `delay` ms. Any input resets it; it never fires while the board is busy.

export function createHint({ findMove, show, hide, isBusy, delay = 6000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  let stopped = false;
  let shown = false;

  const schedule = () => { timer = setTimer(fire, delay); };
  function fire() {
    timer = null;
    if (stopped) return;
    if (!isBusy()) {
      const move = findMove();
      if (move) { show(move); shown = true; }
    }
    schedule();
  }

  return {
    reset() {
      if (stopped) return;
      if (timer !== null) clearTimer(timer);
      if (shown) { hide(); shown = false; }
      schedule();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      if (shown) { hide(); shown = false; }
    },
  };
}
