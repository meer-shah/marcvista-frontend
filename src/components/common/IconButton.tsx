import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type IconButtonVariant = "ghost" | "primary" | "danger";

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white",
  primary: "bg-[#e8590c] hover:bg-[#c54a08] text-white",
  danger: "bg-white/5 hover:bg-red-500/15 text-gray-300 hover:text-red-400",
};

interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  loading?: boolean;
}

/**
 * Small circular icon button. Replaces the hand-rolled round buttons in the
 * top nav, TradingOverview (refresh/clear) and Chart (reset-zoom).
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = "ghost", loading, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-full transition-colors shrink-0 disabled:opacity-50",
        VARIANT[variant],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
    </button>
  )
);
IconButton.displayName = "IconButton";
