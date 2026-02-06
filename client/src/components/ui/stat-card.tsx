import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
  color?: "cyan" | "green" | "amber" | "teal" | "red" | "cyan" | "blue";
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
  cyan: {
    card: "border-sky-500/15 hover:border-sky-500/25",
    iconBg: "bg-gradient-to-br from-sky-500/20 to-cyan-500/10 border border-sky-500/20",
    iconText: "text-sky-400",
    valueText: "text-sky-300",
    glow: "hover:shadow-sky-500/10",
  },
  green: {
    card: "border-emerald-500/15 hover:border-emerald-500/25",
    iconBg: "bg-gradient-to-br from-emerald-500/20 to-green-500/10 border border-emerald-500/20",
    iconText: "text-emerald-400",
    valueText: "text-emerald-300",
    glow: "hover:shadow-emerald-500/10",
  },
  amber: {
    card: "border-amber-500/15 hover:border-amber-500/25",
    iconBg: "bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20",
    iconText: "text-amber-400",
    valueText: "text-amber-300",
    glow: "hover:shadow-amber-500/10",
  },
  teal: {
    card: "border-teal-500/15 hover:border-teal-500/25",
    iconBg: "bg-gradient-to-br from-teal-500/20 to-pink-500/10 border border-teal-500/20",
    iconText: "text-teal-400",
    valueText: "text-teal-300",
    glow: "hover:shadow-teal-500/10",
  },
  red: {
    card: "border-red-500/15 hover:border-red-500/25",
    iconBg: "bg-gradient-to-br from-red-500/20 to-rose-500/10 border border-red-500/20",
    iconText: "text-red-400",
    valueText: "text-red-300",
    glow: "hover:shadow-red-500/10",
  },
  cyan: {
    card: "border-cyan-500/15 hover:border-cyan-500/25",
    iconBg: "bg-gradient-to-br from-cyan-500/20 to-teal-500/10 border border-cyan-500/20",
    iconText: "text-cyan-400",
    valueText: "text-cyan-300",
    glow: "hover:shadow-cyan-500/10",
  },
  blue: {
    card: "border-blue-500/15 hover:border-blue-500/25",
    iconBg: "bg-gradient-to-br from-blue-500/20 to-indigo-500/10 border border-blue-500/20",
    iconText: "text-blue-400",
    valueText: "text-blue-300",
    glow: "hover:shadow-blue-500/10",
  },
};

export function StatCard({ icon: Icon, value, label, color = "cyan", suffix, className }: StatCardProps) {
  const colors = colorMap[color] || colorMap.cyan;

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
