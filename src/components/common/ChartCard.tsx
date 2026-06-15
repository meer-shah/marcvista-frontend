import * as React from "react";
import { MotionCard, type CardVariant } from "./Card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title?: React.ReactNode;
  /** Small color-dot legend rendered next to the title. */
  legend?: { label: string; color: string }[];
  /** Right-side controls (tabs, buttons). */
  actions?: React.ReactNode;
  variant?: CardVariant;
  delay?: number;
  className?: string;
  /** Class for the inner content region (height/padding live here). */
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Card chrome for chart panels: MotionCard shell + a header row (title /
 * legend / actions) + a flex body. Standardizes the many chart cards across
 * Dashboard, Portfolio, RealPerformance and StrategySimulation.
 */
export const ChartCard = ({
  title,
  legend,
  actions,
  variant = "dark",
  delay,
  className,
  bodyClassName,
  children,
}: ChartCardProps) => (
  <MotionCard variant={variant} delay={delay} className={cn("flex flex-col overflow-hidden", className)}>
    {(title || legend || actions) && (
      <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {title && <h3 className="text-sm font-semibold tracking-tight truncate">{title}</h3>}
          {legend && (
            <div className="flex items-center gap-2">
              {legend.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    )}
    <div className={cn("flex-1 min-h-0 px-4 pb-4", bodyClassName)}>{children}</div>
  </MotionCard>
);
