import { useState, useEffect, useRef } from "react";

/**
 * useCountUp — animates a number from 0 to `end` over `duration` ms
 * using an easeOutExpo curve for a premium "slot machine" feel.
 *
 * Features:
 *   - Only animates when the element enters the viewport (IntersectionObserver)
 *   - Re-animates when `end` changes (e.g. data refresh)
 *   - Supports decimals via `decimals` param
 *   - Returns { value, ref } — attach ref to the container element
 */
export function useCountUp({
  end,
  duration = 800,
  decimals = 0,
  startOnMount = false,
}: {
  end: number;
  duration?: number;
  decimals?: number;
  startOnMount?: boolean;
}) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const hasAnimated = useRef(false);
  const prevEnd = useRef(end);

  // Reset animation when `end` changes
  useEffect(() => {
    if (prevEnd.current !== end) {
      hasAnimated.current = false;
      prevEnd.current = end;
    }
  }, [end]);

  useEffect(() => {
    if (startOnMount) {
      animate();
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          animate();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, duration, startOnMount]);

  function animate() {
    hasAnimated.current = true;
    const startTime = performance.now();
    const startValue = 0;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutExpo: fast start, smooth deceleration
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = startValue + (end - startValue) * eased;

      setValue(Number(current.toFixed(decimals)));

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  return { value, ref };
}

/**
 * AnimatedNumber component — drop-in replacement for static number display.
 * Wrap any number with <AnimatedNumber value={123} /> for auto-animation.
 */
export function useCountUpFormatted({
  end,
  duration = 800,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  end: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const { value, ref } = useCountUp({ end, duration, decimals });
  const formatted = `${prefix}${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

  return { formatted, value, ref };
}
