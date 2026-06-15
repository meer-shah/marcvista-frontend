import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** When provided, renders a circular back button to the left of the title. */
  onBack?: () => void;
  backLabel?: string;
  /** Content rendered on the right (badges, actions). */
  rightContent?: React.ReactNode;
  className?: string;
}

/**
 * Consistent page header: optional back button + title/subtitle + right-side
 * actions. Replaces the hand-rolled headers in StrategySimulation,
 * RealPerformance, Blog and AISignals pages.
 */
export const PageHeader = ({
  title,
  subtitle,
  onBack,
  backLabel = "Go back",
  rightContent,
  className,
}: PageHeaderProps) => (
  <div
    className={cn(
      "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4",
      className
    )}
  >
    <div className="flex items-center gap-3 min-w-0">
      {onBack && (
        <button
          onClick={onBack}
          aria-label={backLabel}
          className="w-8 h-8 shrink-0 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-fluid-xl font-bold tracking-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
    </div>
    {rightContent && <div className="flex items-center gap-2 shrink-0">{rightContent}</div>}
  </div>
);
