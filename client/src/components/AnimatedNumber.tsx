import { useCountUp } from "@/hooks/useCountUp";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * AnimatedNumber — drop-in component that animates from 0 to `value`
 * with an easeOutExpo curve when it enters the viewport.
 *
 * Usage:
 *   <AnimatedNumber value={42} suffix="%" />
 *   <AnimatedNumber value={3.7} decimals={1} prefix="★ " />
 */
export function AnimatedNumber({
  value: end,
  duration = 800,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}: AnimatedNumberProps) {
  const { value, ref } = useCountUp({ end, duration, decimals });

  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
