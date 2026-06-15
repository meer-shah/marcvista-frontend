import * as React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Optional sub-text shown under the value. */
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  /** Tailwind color class for the value text, e.g. "text-emerald-400". */
  valueColor?: string;
  /** Center the contents (used in the AISignals metrics grid). */
  centered?: boolean;
  className?: string;
}

/**
 * A single metric tile (label + value [+ sub]). Replaces the 10-30+ inline
 * stat blocks across AISignals, Dashboard, Portfolio and Risk pages.
 * Render it inside an AppCard / .card-shell when a panel chrome is wanted.
 */
export const StatCard = ({
  label,
  value,
  sub,
  icon,
  valueColor,
  centered,
  className,
}: StatCardProps) => (
  <div
    className={cn(
      "flex flex-col gap-1 p-3 sm:p-4",
      centered && "items-center text-center",
      className
    )}
  >
    {icon && <div className="text-muted-foreground">{icon}</div>}
    <div className={cn("text-lg sm:text-2xl font-bold tracking-tight", valueColor)}>
      {value}
    </div>
    <div className="stat-label">{label}</div>
    {sub != null && <div className="text-xs text-muted-foreground">{sub}</div>}
  </div>
);
