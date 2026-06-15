import { cn } from "@/lib/utils";

export type ConnectionStatus = "connected" | "checking" | "disconnected";

const DOT: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500",
  checking: "bg-[#facc15]",
  disconnected: "bg-red-500",
};

interface StatusIndicatorProps {
  status: ConnectionStatus;
  label?: string;
  className?: string;
}

/**
 * Status dot + optional label. Replaces the inline connection indicators in
 * PlaceOrder and ExchangeSelector.
 */
export const StatusIndicator = ({ status, label, className }: StatusIndicatorProps) => (
  <span className={cn("inline-flex items-center gap-1.5", className)}>
    <span className={cn("w-2 h-2 rounded-full shrink-0", DOT[status])} />
    {label && <span className="text-xs text-muted-foreground">{label}</span>}
  </span>
);
