import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

interface StatCardProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
  color?: "violet" | "green" | "indigo" | "red" | "blue";
  suffix?: string;
  className?: string;
}

const colorMap: Record<string, { 
  card: string; 
  iconBg: string; 
  iconText: string; 
  valueText: string;
  glow: string;
  accentLine: string;
}> = {
  violet: {
    card: "border-primary/20 hover:border-primary/35",
    iconBg: "bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 shadow-sm",
    iconText: "text-primary",
    valueText: "text-primary",
    glow: "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]",
    accentLine: "from-primary/60 via-primary/30 to-transparent",
  },
  green: {
    card: "border-emerald-500/20 hover:border-emerald-500/35",
    iconBg: "bg-gradient-to-br from-emerald-500/20 to-green-500/10 border border-emerald-500/20 shadow-sm",
    iconText: "text-emerald-600",
    valueText: "text-emerald-700",
    glow: "hover:shadow-[0_8px_24px_rgba(16,185,129,0.08)]",
    accentLine: "from-emerald-500/60 via-emerald-400/30 to-transparent",
  },
  indigo: {
    card: "border-indigo-500/20 hover:border-indigo-500/35",
    iconBg: "bg-gradient-to-br from-indigo-500/20 to-indigo-400/10 border border-indigo-500/20 shadow-sm",
    iconText: "text-indigo-600",
    valueText: "text-indigo-700",
    glow: "hover:shadow-[0_8px_24px_rgba(99,102,241,0.08)]",
    accentLine: "from-indigo-500/60 via-indigo-400/30 to-transparent",
  },
  red: {
    card: "border-red-500/20 hover:border-red-500/35",
    iconBg: "bg-gradient-to-br from-red-500/20 to-rose-500/10 border border-red-500/20 shadow-sm",
    iconText: "text-red-600",
    valueText: "text-red-700",
    glow: "hover:shadow-[0_8px_24px_rgba(239,68,68,0.08)]",
    accentLine: "from-red-500/60 via-red-400/30 to-transparent",
  },
  blue: {
    card: "border-blue-500/20 hover:border-blue-500/35",
    iconBg: "bg-gradient-to-br from-blue-500/20 to-blue-400/10 border border-blue-500/20 shadow-sm",
    iconText: "text-blue-600",
    valueText: "text-blue-700",
    glow: "hover:shadow-[0_8px_24px_rgba(59,130,246,0.08)]",
    accentLine: "from-blue-500/60 via-blue-400/30 to-transparent",
  },
};

/**
 * Internal helper: animates numeric values, passes through strings unchanged.
 */
function AnimatedValue({ value, className }: { value: number | string; className?: string }) {
  const numericValue = typeof value === "number" ? value : parseFloat(value);
  const isNumeric = !isNaN(numericValue) && typeof value !== "string";
  const hasDecimals = isNumeric && !Number.isInteger(numericValue);

  const { value: animatedVal, ref } = useCountUp({
    end: isNumeric ? numericValue : 0,
    duration: 800,
    decimals: hasDecimals ? 1 : 0,
  });

  if (!isNumeric) {
    return <p className={className}>{value}</p>;
  }

  return (
    <p ref={ref as React.RefObject<HTMLParagraphElement>} className={className}>
      {animatedVal.toLocaleString(undefined, {
        minimumFractionDigits: hasDecimals ? 1 : 0,
        maximumFractionDigits: hasDecimals ? 1 : 0,
      })}
    </p>
  );
}

export function StatCard({ icon: Icon, value, label, color = "violet", suffix, className }: StatCardProps) {
  const colors = colorMap[color] || colorMap.violet;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-card/80 backdrop-blur-xl p-4 sm:p-5 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg overflow-hidden",
        colors.card,
        colors.glow,
        className
      )}
    >
      {/* Top accent line */}
      <div className={cn("absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r", colors.accentLine)} />
      
      <div className="flex items-start justify-between mb-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3", colors.iconBg)}>
          <Icon className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", colors.iconText)} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <AnimatedValue value={value} className={cn("text-2xl sm:text-3xl font-bold tracking-tight transition-colors duration-300", colors.valueText)} />
        {suffix && <span className="text-sm text-muted-foreground font-medium transition-opacity duration-300 group-hover:opacity-80">{suffix}</span>}
      </div>
      <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-1.5 transition-colors duration-300 group-hover:text-foreground/70">{label}</p>
    </div>
  );
}
