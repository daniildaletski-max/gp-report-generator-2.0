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
}> = {
  violet: {
    card: "border-[#d4af37]/15 hover:border-[#d4af37]/25",
    iconBg: "bg-gradient-to-br from-[#d4af37]/20 to-[#b8860b]/10 border border-[#d4af37]/20",
    iconText: "text-[#d4af37]",
    valueText: "text-[#d4af37]",
    glow: "hover:shadow-[#d4af37]/10",
  },
  green: {
    card: "border-emerald-500/15 hover:border-emerald-500/25",
    iconBg: "bg-gradient-to-br from-emerald-500/20 to-green-500/10 border border-emerald-500/20",
    iconText: "text-emerald-400",
    valueText: "text-emerald-300",
    glow: "hover:shadow-emerald-500/10",
  },
  indigo: {
    card: "border-[#b8860b]/15 hover:border-[#b8860b]/25",
    iconBg: "bg-gradient-to-br from-[#b8860b]/20 to-[#8b0000]/10 border border-[#b8860b]/20",
    iconText: "text-[#b8860b]",
    valueText: "text-[#b8860b]",
    glow: "hover:shadow-[#b8860b]/10",
  },
  red: {
    card: "border-red-500/15 hover:border-red-500/25",
    iconBg: "bg-gradient-to-br from-red-500/20 to-rose-500/10 border border-red-500/20",
    iconText: "text-red-400",
    valueText: "text-red-300",
    glow: "hover:shadow-red-500/10",
  },
  blue: {
    card: "border-blue-500/15 hover:border-blue-500/25",
    iconBg: "bg-gradient-to-br from-blue-500/20 to-[#b8860b]/10 border border-blue-500/20",
    iconText: "text-blue-400",
    valueText: "text-blue-300",
    glow: "hover:shadow-blue-500/10",
  },
};

export function StatCard({ icon: Icon, value, label, color = "violet", suffix, className }: StatCardProps) {
  const colors = colorMap[color] || colorMap.violet;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-white/[0.03] backdrop-blur-xl p-4 sm:p-5 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg overflow-hidden",
        colors.card,
        colors.glow,
        className
      )}
    >
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />
      
      <div className="flex items-start justify-between mb-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105", colors.iconBg)}>
          <Icon className={cn("h-5 w-5", colors.iconText)} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <p className={cn("text-2xl sm:text-3xl font-bold tracking-tight", colors.valueText)}>
          {value}
        </p>
        {suffix && <span className="text-sm text-white/30 font-medium">{suffix}</span>}
      </div>
      <p className="text-xs sm:text-sm font-medium text-white/40 mt-1.5">{label}</p>
    </div>
  );
}
