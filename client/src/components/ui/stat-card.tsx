import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

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
    card: "border-[#d4af37]/20 hover:border-[#d4af37]/35",
    iconBg: "bg-gradient-to-br from-[#d4af37]/25 to-[#b8860b]/12 border border-[#d4af37]/25 shadow-sm",
    iconText: "text-[#d4af37]",
    valueText: "text-[#d4af37]",
    glow: "hover:shadow-[0_8px_24px_rgba(212,175,55,0.12)]",
    accentLine: "from-[#d4af37]/60 via-[#d4af37]/30 to-transparent",
  },
  green: {
    card: "border-emerald-500/20 hover:border-emerald-500/35",
    iconBg: "bg-gradient-to-br from-emerald-500/25 to-green-500/12 border border-emerald-500/25 shadow-sm",
    iconText: "text-emerald-400",
    valueText: "text-emerald-300",
    glow: "hover:shadow-[0_8px_24px_rgba(16,185,129,0.12)]",
    accentLine: "from-emerald-400/60 via-emerald-400/30 to-transparent",
  },
  indigo: {
    card: "border-[#b8860b]/20 hover:border-[#b8860b]/35",
    iconBg: "bg-gradient-to-br from-[#b8860b]/25 to-[#8b0000]/12 border border-[#b8860b]/25 shadow-sm",
    iconText: "text-[#b8860b]",
    valueText: "text-[#b8860b]",
    glow: "hover:shadow-[0_8px_24px_rgba(184,134,11,0.12)]",
    accentLine: "from-[#b8860b]/60 via-[#b8860b]/30 to-transparent",
  },
  red: {
    card: "border-red-500/20 hover:border-red-500/35",
    iconBg: "bg-gradient-to-br from-red-500/25 to-rose-500/12 border border-red-500/25 shadow-sm",
    iconText: "text-red-400",
    valueText: "text-red-300",
    glow: "hover:shadow-[0_8px_24px_rgba(239,68,68,0.12)]",
    accentLine: "from-red-400/60 via-red-400/30 to-transparent",
  },
  blue: {
    card: "border-[#c9a227]/20 hover:border-[#c9a227]/35",
    iconBg: "bg-gradient-to-br from-[#c9a227]/25 to-[#b8860b]/12 border border-[#c9a227]/25 shadow-sm",
    iconText: "text-[#c9a227]",
    valueText: "text-[#c9a227]",
    glow: "hover:shadow-[0_8px_24px_rgba(201,162,39,0.12)]",
    accentLine: "from-[#c9a227]/60 via-[#c9a227]/30 to-transparent",
  },
};

export function StatCard({ icon: Icon, value, label, color = "violet", suffix, className }: StatCardProps) {
  const colors = colorMap[color] || colorMap.violet;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg overflow-hidden",
        colors.card,
        colors.glow,
        className
      )}
    >
      {/* Top accent line */}
      <div className={cn("absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r", colors.accentLine)} />
      
      <div className="flex items-start justify-between mb-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105", colors.iconBg)}>
          <Icon className={cn("h-5 w-5", colors.iconText)} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <p className={cn("text-2xl sm:text-3xl font-bold tracking-tight", colors.valueText)}>
          {value}
        </p>
        {suffix && <span className="text-sm text-white/40 font-medium">{suffix}</span>}
      </div>
      <p className="text-xs sm:text-sm font-medium text-white/50 mt-1.5">{label}</p>
    </div>
  );
}
