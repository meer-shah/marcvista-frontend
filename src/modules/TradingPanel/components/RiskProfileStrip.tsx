// Active Risk Profile — compact horizontal strip that sits directly under
// the exchange-connection status bar (new Trade Screen layout).
//
// All derivations live in the page (`TradingPanelPage`). This component is
// pure presentation — it doesn't compute risk numbers, doesn't decide
// whether trading is allowed, and doesn't talk to any API except the
// Reset button's onReset callback (which is the same `riskProfileApi.resetState`
// handler the side panel used to invoke).
//
// Hidden when no profile is active, matching the previous PlaceOrder behavior.

import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Props {
  activeProfile: any;
  adjustedRisk: number;
  dailySLRemaining: number;
  positionsCount: number;
  pendingOrdersCount: number;
  onResetStreak: () => void;
  // Profile-switch wiring — same activate flow as the Risk Profile page.
  profiles?: any[];
  onSwitchProfile?: (id: string) => void;
  switching?: boolean;
}

export default function RiskProfileStrip({
  activeProfile, adjustedRisk, dailySLRemaining,
  positionsCount, pendingOrdersCount, onResetStreak,
  profiles = [], onSwitchProfile, switching = false,
}: Props) {
  if (!activeProfile) return null;
  const hasSwitcher = !!onSwitchProfile && profiles.length > 1;

  const blocked = positionsCount > 0 || pendingOrdersCount > 0;
  const blockedReason = positionsCount > 0 && pendingOrdersCount > 0
    ? 'Active positions and pending orders — complete them first.'
    : positionsCount > 0
      ? 'Active position open — close it before placing new orders.'
      : 'Pending orders exist — cancel them before placing new orders.';

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 mb-4 rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_16px_50px_-12px_rgba(0,0,0,0.6)] text-xs">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-muted-foreground font-medium">Active Risk Profile:</span>
        {hasSwitcher ? (
          <Select
            value={activeProfile._id}
            onValueChange={(id) => onSwitchProfile && onSwitchProfile(id)}
            disabled={switching}
          >
            <SelectTrigger
              className="h-7 px-2 py-0 text-xs font-bold bg-transparent border-white/15 hover:border-[#e8590c]/40 focus:border-[#e8590c]/50 focus:ring-0 focus:ring-offset-0 w-auto min-w-[140px] gap-2"
              title={switching ? 'Switching profile…' : 'Switch active risk profile (same as toggling on the Risk Profile page)'}
            >
              <SelectValue>{activeProfile.title || 'Not set'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p._id} value={p._id} className="text-xs">
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-bold text-white">{activeProfile.title || 'Not set'}</span>
        )}
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 text-[10px] font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Active
        </span>
      </div>

      <span className="w-px h-4 bg-white/10" />

      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-muted-foreground font-medium">Adjusted Risk:</span>
        <span className="font-bold text-green-500 tabular-nums">{adjustedRisk.toFixed(2)}%</span>
      </div>

      <span className="w-px h-4 bg-white/10" />

      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-muted-foreground font-medium">Daily SL Remaining:</span>
        <span className="font-bold text-white tabular-nums">{dailySLRemaining}</span>
      </div>

      <span className="w-px h-4 bg-white/10" />

      {blocked ? (
        <span className="text-red-300 font-medium">{blockedReason}</span>
      ) : (
        <span className="text-muted-foreground/70 font-medium">
          Recalculates from closed app-trades. Reset wipes the streak on the active exchange only.
        </span>
      )}

      <button
        type="button"
        onClick={onResetStreak}
        title="Reset streak (currentrisk back to initial, wins/losses cleared) on the active exchange. Other exchanges keep their state."
        className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/10 bg-transparent text-white/80 text-[11px] font-bold hover:border-white/30 hover:text-white"
      >
        <RotateCcw className="w-3 h-3" />
        Reset
      </button>
    </div>
  );
}
