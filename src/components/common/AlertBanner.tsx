import * as React from "react";
import { cn } from "@/lib/utils";

export type AlertVariant = "warning" | "caution" | "info";

const VARIANT_CLASS: Record<AlertVariant, string> = {
  warning: "alert-banner-warning",
  caution: "alert-banner-caution",
  info: "alert-banner-info",
};

interface AlertBannerProps {
  variant?: AlertVariant;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Inline status banner (error/warning/caution/info). Replaces the hardcoded
 * colored `<div>`s duplicated in PlaceOrder (4x) and RiskFeeCardModal.
 * `warning` = red (blocking), `caution` = yellow, `info` = white.
 */
export const AlertBanner = ({
  variant = "warning",
  icon,
  className,
  children,
}: AlertBannerProps) => (
  <div className={cn(VARIANT_CLASS[variant], icon && "flex items-start gap-1.5", className)}>
    {icon && <span className="shrink-0">{icon}</span>}
    <span>{children}</span>
  </div>
);
