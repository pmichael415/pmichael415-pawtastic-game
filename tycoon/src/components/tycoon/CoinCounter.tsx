// The coin count, rolling from the old value to the new one over 600 ms (instant with reduced motion).
import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings";

export function CoinCounter({ value, className }: { value: number; className?: string }) {
  const { reducedMotion } = useSettings();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reducedMotion || typeof requestAnimationFrame === "undefined") {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let id = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 600);
      setShown(Math.round(a + (value - a) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) id = requestAnimationFrame(step);
      else from.current = value;
    };
    id = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(id);
      from.current = value;
    };
  }, [value, reducedMotion]);
  return <span className={className}>{(reducedMotion ? value : shown).toLocaleString()}</span>;
}
