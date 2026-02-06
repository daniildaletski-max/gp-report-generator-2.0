import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
  color?: "purple" | "green" | "amber" | "fuchsia" | "red" | "cyan" | "blue";
  suffix?: string;
  className?: string;
}

const colorMap: Record<string, { bg: string; border: string; iconBg: string; iconBorder: string; text: string; iconText: string }> = {
  purple: {
    bg: "bg-violet-500/[0.08]",
    border: "border-violet-500/[0.15]",
    iconBg: "bg-violet-500/15",
    iconBorder: "border-violet-500/20",
    text: "text-violet-400",
    iconText: "text-violet-400",
  },
  green: {
    bg: "bg-emerald-500/[0.08]",
    border: "border-emerald-500/[0.15]",
    iconBg: "bg-emerald-500/15",
    iconBorder: "border-emerald-500/20",
    text: "text-emerald-400",
    iconText: "text-emerald-400",
  },
  amber: {
    bg: "bg-amber-500/[0.08]",
    border: "border-amber-500/[0.15]",
    iconBg: "bg-amber-500/15",
    iconBorder: "border-amber-500/20",
    text: "text-amber-400",
    iconText: "text-amber-400",
  },
  fuchsia: {
    bg: "bg-fuchsia-500/[0.08]",
    border: "border-fuchsia-500/[0.15]",
    iconBg: "bg-fuchsia-500/15",
    iconBorder: "border-fuchsia-500/20",
    text: "text-fuchsia-400",
    iconText: "text-fuchsia-400",
  },
  red: {
    bg: "bg-red-500/[0.08]",
    border: "border-red-500/[0.15]",
    iconBg: "bg-red-500/15",
    iconBorder: "border-red-500/20",
    text: "text-red-400",
    iconText: "text-red-400",
  },
  cyan: {
    bg: "bg-cyan-500/[0.08]",
    border: "border-cyan-500/[0.15]",
    iconBg: "bg-cyan-500/15",
    iconBorder: "border-cyan-500/20",
    text: "text-cyan-400",
    iconText: "text-cyan-400",
  },
  blue: {
    bg: "bg-blue-500/[0.08]",
    border: "border-blue-500/[0.15]",
    iconBg: "bg-blue-500/15",
    iconBorder: "border-blue-500/20",
    text: "text-blue-400",
    iconText: "text-blue-400",
  },
};

export function StatCard({ icon: Icon, value, label, color = "purple", suffix, className }: StatCardProps) {
  const colors = colorMap[color] || colorMap.purple;

  return (
    <div
      className={cn(
        "rounded-2xl border backdrop-blur-xl p-4 sm:p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg",
        colors.bg,
        colors.border,
        className
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("h-10 w-10 rounded-xl border flex items-center justify-center", colors.iconBg, colors.iconBorder)}>
          <Icon className={cn("h-5 w-5", colors.iconText)} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <p className={cn("text-2xl sm:text-3xl font-bold", colors.text)}>
          {value}
        </p>
        {suffix && <span className="text-sm text-white/30">{suffix}</span>}
      </div>
      <p className="text-xs sm:text-sm font-medium text-white/40 mt-1">{label}</p>
    </div>
  );
}
