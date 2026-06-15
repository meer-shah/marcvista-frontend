import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TradeOutcome = "Win" | "Loss" | "Pending";

const OUTCOME: Record<TradeOutcome, string> = {
  Win: "bg-emerald-500 text-black border-transparent",
  Loss: "bg-red-500 text-white border-transparent",
  Pending: "bg-white/10 text-gray-300 border-transparent",
};

interface TradeBadgeProps {
  outcome: TradeOutcome;
  className?: string;
}

/**
 * Trade outcome badge (Win/Loss/Pending). Replaces the conditional badge
 * rendering in the trade tables.
 */
export const TradeBadge = ({ outcome, className }: TradeBadgeProps) => (
  <Badge
    className={cn(
      OUTCOME[outcome],
      "badge-pill px-2 justify-center min-w-[clamp(50px,15vw,66px)]",
      className
    )}
  >
    {outcome}
  </Badge>
);
