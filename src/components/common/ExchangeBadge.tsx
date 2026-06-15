import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Brand color map for supported exchanges (matches existing trade tables). */
export const EXCHANGE_COLOR: Record<string, string> = {
  bybit: "bg-[#e8590c] text-white border-transparent",
  binance: "bg-yellow-400 text-black border-transparent",
  okx: "bg-sky-500 text-white border-transparent",
  bitget: "bg-cyan-500 text-black border-transparent",
  mexc: "bg-emerald-500 text-black border-transparent",
};

interface ExchangeBadgeProps {
  exchange?: string;
  className?: string;
}

/**
 * Color-coded exchange label. Replaces the inline `exColor` map + Badge
 * duplicated across the three trade tables (Portfolio / RealPerformance /
 * StrategySimulation).
 */
export const ExchangeBadge = ({ exchange, className }: ExchangeBadgeProps) => {
  const key = (exchange || "bybit").toString().toLowerCase();
  return (
    <Badge
      className={cn(
        EXCHANGE_COLOR[key] || EXCHANGE_COLOR.bybit,
        "badge-pill px-2 capitalize justify-center min-w-[clamp(50px,15vw,66px)]",
        className
      )}
    >
      {key}
    </Badge>
  );
};
