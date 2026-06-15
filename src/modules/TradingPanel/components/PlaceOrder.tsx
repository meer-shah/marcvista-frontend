import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RotateCcw, ChevronDown } from "lucide-react";
import { riskProfileApi } from "@/lib/api";
import { toast } from "sonner";
import { computeFeeEstimate } from "@/lib/feeEstimate";
import { AlertBanner, StatusIndicator, type ConnectionStatus } from "@/components/common";
import ExchangeSelector from "@/modules/TradingPanel/components/ExchangeSelector";

interface PlaceOrderProps {
  activeProfile: any;
  positions: any[];
  pendingOrders: any[];
  appTrades: any[];
  adjustedRisk: number;
  leverage: number;
  maxLeverage: number;
  setLeverage: (n: number) => void;
  orderPrice: string;
  setOrderPrice: (v: string) => void;
  takeProfit: string;
  setTakeProfit: (v: string) => void;
  stopLoss: string;
  setStopLoss: (v: string) => void;
  tickerPrice: string | null;
  accountBalance: string;
  isTradingAllowed: boolean;
  getDisabledReason: string;
  loading: boolean;
  onApplyLeverage: () => void;
  onPlaceOrder: (direction: 'Long' | 'Short') => void;
  /** Idle (no fee estimate) summary in card-only mode. None of these
   *  participate in any risk / gate / fee math — they only drive the
   *  exchange + risk-profile capsule choosers and the connection dot. */
  isConnected?: boolean | null;
  profiles?: any[];
  onSwitchProfile?: (id: string) => void;
  switchingProfile?: boolean;
  onSwitchExchange?: (exchange: string) => void;
  onConnectExchange?: (exchange: string) => void;
  onViewGuideExchange?: (exchange: string) => void;
  /**
   * 'full'      — legacy single-card layout: profile + leverage + price
   *               inputs + Risk & Fee + Open buttons. Behavior unchanged
   *               for any caller that omits this prop.
   * 'card-only' — Risk & Fee Estimate only. Profile / leverage / inputs /
   *               buttons hidden because they live in sibling components
   *               (`RiskProfileStrip` + `PlaceOrderBar`) in the new
   *               trade-page layout. Fee math is rendered exactly the
   *               same way — no logic changes.
   */
  variant?: 'full' | 'card-only';
}

const PlaceOrder: React.FC<PlaceOrderProps> = ({
  activeProfile, positions, pendingOrders, appTrades, adjustedRisk,
  leverage, maxLeverage, setLeverage,
  orderPrice, setOrderPrice, takeProfit, setTakeProfit, stopLoss, setStopLoss,
  tickerPrice, accountBalance, isTradingAllowed, getDisabledReason, loading,
  onApplyLeverage, onPlaceOrder,
  isConnected, profiles = [], onSwitchProfile, switchingProfile = false,
  onSwitchExchange, onConnectExchange, onViewGuideExchange,
  variant = 'full',
}) => {
  const cardOnly = variant === 'card-only';
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const dailySLRemaining = (() => {
    if (!activeProfile) return 0;
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    const lossesToday = appTrades.filter(trade => {
      const raw = trade.closedAt ?? trade.updatedAt;
      if (!raw) return false;
      const date = new Date(raw);
      if (isNaN(date.getTime())) return false;
      const pnl = parseFloat(trade.pnl ?? trade.closedPnl ?? 0);
      return date >= start && date <= end && pnl < 0;
    }).length;
    return Math.max(0, dailyLimit - lossesToday);
  })();

  // Fee estimation lives in lib/feeEstimate.ts so the chart's Buy/Sell modal
  // reaches an identical verdict (same qty, same R:R gate, same blocked state).
  // Verbatim move — no math change.
  const feeEstimate = computeFeeEstimate({
    orderPrice, takeProfit, stopLoss, tickerPrice, accountBalance,
    adjustedRisk, activeProfile,
  });
  const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtFee = (n: number) => `$${n.toFixed(2)}`;

  // Streak reset — identical behavior to the inline button that used to live
  // in the (full-mode) header. Extracted only so the card-only idle summary
  // can reuse the exact same call. No change to what it does.
  const resetStreak = async () => {
    if (!confirm('Reset risk-profile streak on the active exchange? currentrisk will go back to initial and wins/losses will be zeroed. Other exchanges keep their state.')) return;
    try {
      const r = await riskProfileApi.resetState();
      toast.success(`Streak reset on ${r?.exchange || 'active exchange'} — currentrisk back to ${r?.state?.currentrisk}%`);
      try { window.dispatchEvent(new Event('marcvista:trade-updated')); } catch { /* ignore */ }
    } catch (err: any) {
      toast.error(err?.message || 'Reset failed');
    }
  };

  return (
    <Card className="bg-[#0a0a0a] border-white/10 flex flex-col h-full">
      {!cardOnly && (
      <CardHeader>
        <CardTitle className="text-lg">Place Order</CardTitle>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Active Risk Profile:</span>
            <Badge variant="secondary">{activeProfile?.title || 'Not set'}</Badge>
          </div>
          {activeProfile && (
            <div className="text-xs mt-2 p-2 bg-white/5 rounded">
              {(positions.length > 0 || pendingOrders.length > 0) ? (
                <div className="text-center">
                  <p className="text-muted-foreground">
                    {positions.length > 0 && pendingOrders.length > 0
                      ? "Cannot trade: You have active positions and pending orders. Complete them first."
                      : positions.length > 0
                      ? "Cannot trade: You have an active position. Close it before placing new orders."
                      : "Cannot trade: You have pending orders. Cancel them before placing new orders."
                    }
                  </p>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Adjusted Risk: </span>
                      <span className="font-medium text-sm">{adjustedRisk.toFixed(2)}%</span>
                      <button
                        title="Reset streak counters (currentrisk back to initial, wins/losses cleared) on the active exchange. Other exchanges keep their state."
                        onClick={resetStreak}
                        className="text-muted-foreground/60 hover:text-[#e8590c] transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Recalculates from closed app-trades. Reset button wipes the streak on the active exchange only.
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Daily SL Remaining: </span>
                    <span className="font-medium text-sm">{dailySLRemaining}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      )}
      {/* In card-only mode the CardHeader is hidden, so shadcn's default
          `pt-0` on CardContent would let the Risk & Fee card touch the
          top edge. Override with explicit top padding and a tighter
          horizontal inset so the inner card sits visually centered with
          breathing room. */}
      <CardContent className={`flex-1 overflow-y-auto space-y-3 ${cardOnly ? 'flex flex-col !pt-5 px-4 pb-4' : ''}`}>
        <div className={`space-y-3 ${cardOnly ? 'flex-1 flex flex-col' : ''}`}>
          {!cardOnly && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Leverage</Label>
              <span className="text-sm font-medium text-primary">{leverage}x</span>
            </div>
            <Slider
              min={1} max={maxLeverage} step={1}
              value={[leverage]} onValueChange={([val]) => setLeverage(val)}
              disabled={!isTradingAllowed} className="mb-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>1x</span>
              <span>{Math.floor(maxLeverage * 0.25)}x</span>
              <span>{Math.floor(maxLeverage * 0.5)}x</span>
              <span>{Math.floor(maxLeverage * 0.75)}x</span>
              <span>{maxLeverage}x</span>
            </div>
            <Button size="sm" onClick={onApplyLeverage} className="w-full"
              disabled={!isTradingAllowed || loading} title={!isTradingAllowed ? getDisabledReason : ""}>
              Apply Leverage
            </Button>
          </div>
          )}

          {!cardOnly && (<>
          <div>
            <div className="flex items-center justify-between mb-1 flex-wrap gap-x-3 gap-y-1">
              <Label className="text-sm">Order Price</Label>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground/70">
                  Bal: <span className="text-muted-foreground/80 font-normal">${parseFloat(accountBalance).toFixed(2)}</span>
                </span>
                {tickerPrice && (
                  <span className="text-muted-foreground">
                    Live: <span className="font-medium text-green-500">${parseFloat(tickerPrice).toLocaleString()}</span>
                  </span>
                )}
              </div>
            </div>
            <Input
              type="number" value={orderPrice}
              onChange={(e) => setOrderPrice(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : tickerPrice ? `${parseFloat(tickerPrice).toFixed(2)} (live — leave blank to use)` : "0.00"}
              className="mt-1" disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : "Leave blank to submit at the current live price"}
            />
          </div>

          <div>
            <Label className="text-sm">Take Profit</Label>
            <Input type="number" value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : "0.00"}
              className="mt-1" disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : ""} />
          </div>

          <div>
            <Label className="text-sm">Stop Loss</Label>
            <Input type="number" value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : "0.00"}
              className="mt-1" disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : ""} />
          </div>
          </>)}

          {/* Risk & Fee Estimate — always rendered so the right column has
              a stable visual structure even before TP / SL are filled.
              In card-only mode the inner box chrome (bg/border/rounded)
              is dropped so the content flows directly inside the outer
              Card — no nested-card visual. In `full` (legacy) mode the
              inner chrome stays for the side-panel separation. */}
          <div className={
            cardOnly
              ? 'flex-1 flex flex-col overflow-y-auto text-xs space-y-2'
              : 'p-3 rounded-lg bg-white/5 border border-white/10 text-xs space-y-2'
          }>
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-medium text-gray-200">
                Risk &amp; Fee Estimate
              </h3>
              <span className="text-[10px] font-medium text-gray-500" title="Bybit USDT Perpetual VIP-0: Maker 0.02% / Taker 0.055%">
                Bybit 0.02% / 0.055%
              </span>
            </div>

            {/* Idle (no fee estimate) — full/legacy mode keeps the simple hint. */}
            {!feeEstimate && !cardOnly && (
              <div className="py-6 text-center text-[12px] text-gray-500 leading-snug">
                Fill in <span className="text-gray-200 font-medium">Order Price</span>, <span className="text-gray-200 font-medium">Take Profit</span>, and <span className="text-gray-200 font-medium">Stop Loss</span> below to see your sized position, fee breakdown, and effective risk-to-reward.
              </div>
            )}

            {/* Idle summary — card-only right column. Shows exchange + active
                profile context while no order is being priced. Purely a
                read-out of values computed upstream (adjustedRisk, balance,
                dailySLRemaining, activeProfile) — no risk math here. It is
                replaced by the fee breakdown the moment TP/SL produce a
                feeEstimate. */}
            {!feeEstimate && cardOnly && (
              <div className="flex-1 flex flex-col gap-2 pt-0.5">
                {/* Connection status + exchange chooser on one row — the
                    capsule dropdown sits in front of the connection label. */}
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <StatusIndicator
                      status={
                        (isConnected === null
                          ? 'checking'
                          : isConnected
                            ? 'connected'
                            : 'disconnected') as ConnectionStatus
                      }
                      className={isConnected === null ? '[&>span]:animate-pulse' : undefined}
                    />
                    <span className="text-[12px] font-medium truncate text-gray-300">
                      {isConnected === null ? 'Checking connection…'
                        : isConnected ? 'Exchange connected' : 'Not connected'}
                    </span>
                  </span>
                  <ExchangeSelector
                    onSwitch={onSwitchExchange}
                    onConnect={onConnectExchange}
                    onViewGuide={onViewGuideExchange}
                    triggerClassName="gap-1.5 h-8 px-3 sm:min-w-[120px] justify-between rounded-full bg-white/[0.05] hover:bg-white/10 border-white/10 text-xs font-medium text-gray-200 shrink-0"
                  />
                </div>

                {/* Balance */}
                <div className="flex items-baseline justify-between">
                  <span className="text-gray-400 font-medium">Balance</span>
                  <span className="tabular-nums font-medium text-[#e8590c]">{fmtUsd(parseFloat(accountBalance) || 0)}</span>
                </div>

                <div className="border-t border-white/10" />

                {/* Risk-profile chooser — capsule dropdown (same activate
                    flow as the Risk Profile page / top strip). */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-400 font-medium">Risk Profile</span>
                  {onSwitchProfile && profiles.length > 0 ? (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        disabled={switchingProfile}
                        onClick={() => setProfileMenuOpen((o) => !o)}
                        className="flex items-center justify-between gap-1.5 px-3 h-8 sm:min-w-[120px] max-w-[150px] rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-xs font-medium text-gray-200 transition-colors disabled:opacity-50"
                      >
                        <span className="truncate">{activeProfile?.title || 'Not set'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {profileMenuOpen && (
                        <div className="absolute right-0 mt-1 z-20 w-44 max-h-56 overflow-y-auto rounded-xl bg-[#1c1c1c] border border-white/10 shadow-xl py-1">
                          {profiles.map((p) => (
                            <button
                              key={p._id}
                              type="button"
                              onClick={() => { onSwitchProfile(p._id); setProfileMenuOpen(false); }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors truncate ${
                                p._id === activeProfile?._id ? 'text-primary font-medium' : 'text-gray-300'
                              }`}
                            >
                              {p.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="font-medium text-white truncate">{activeProfile?.title || 'Not set'}</span>
                  )}
                </div>

                {activeProfile ? (
                  <>
                    {/* Adjusted risk */}
                    <div className="flex items-baseline justify-between">
                      <span className="text-gray-400 font-medium">Adjusted Risk</span>
                      <span className="tabular-nums font-medium text-white">{adjustedRisk.toFixed(2)}%</span>
                    </div>

                    {/* Daily SL remaining */}
                    <div className="flex items-baseline justify-between">
                      <span className="text-gray-400 font-medium">Daily SL Remaining</span>
                      <span className="tabular-nums font-medium text-white">{dailySLRemaining}</span>
                    </div>

                    <p className="text-[10px] text-gray-500 leading-snug">
                      Recalculates from closed app-trades. Reset wipes the streak on the active exchange only.
                    </p>

                    <button
                      type="button"
                      onClick={resetStreak}
                      title="Reset streak (currentrisk back to initial, wins/losses cleared) on the active exchange. Other exchanges keep their state."
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-white/80 text-[11px] font-medium hover:border-white/30 hover:text-white transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  </>
                ) : (
                  <div className="border-t border-white/10 pt-3 text-[12px] text-gray-500 leading-snug">
                    No active risk profile. Create and activate one to trade.
                  </div>
                )}

                <p className="mt-auto pt-2 text-[10px] text-gray-500 leading-snug border-t border-white/10">
                  Fill <span className="text-gray-300 font-medium">Take Profit</span> and <span className="text-gray-300 font-medium">Stop Loss</span> below to size a position and see your fee breakdown here.
                </p>
              </div>
            )}

            {feeEstimate && (
            <>
              <div className="flex justify-between items-baseline">
                <span className="text-gray-400 font-medium">Total USD risk (fees included)</span>
                <span className="tabular-nums font-medium text-[#e8590c]">{fmtUsd(feeEstimate.riskUsd)}</span>
              </div>
              {feeEstimate.makerHint && (
                <div className="text-[9px] leading-snug px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-gray-300">
                  <span className="font-medium mr-1 text-[#facc15]">
                    {feeEstimate.likelyTaker ? 'Likely Taker:' : 'Likely Maker:'}
                  </span>
                  {feeEstimate.makerHint}
                </div>
              )}

              {/* Two scenario blocks — the likely (chosen) one is solid orange */}
              <div className="grid grid-cols-2 gap-2 pt-1.5">
                {[
                  { title: 'If Maker entry', active: !feeEstimate.likelyTaker, qty: feeEstimate.qtyMaker, notional: feeEstimate.notionalMaker, entryFee: feeEstimate.entryFeeMaker, slFee: feeEstimate.slExitFeeMaker, tpFee: feeEstimate.tpExitFeeMaker, priceMove: feeEstimate.priceMoveLossMaker, netGain: feeEstimate.netGainMaker, rr: feeEstimate.rrMaker },
                  { title: 'If Taker entry', active: feeEstimate.likelyTaker, qty: feeEstimate.qtyTaker, notional: feeEstimate.notionalTaker, entryFee: feeEstimate.entryFeeTaker, slFee: feeEstimate.slExitFeeTaker, tpFee: feeEstimate.tpExitFeeTaker, priceMove: feeEstimate.priceMoveLossTaker, netGain: feeEstimate.netGainTaker, rr: feeEstimate.rrTaker },
                ].map((sc) => {
                  const lbl = sc.active ? 'text-white/75' : 'text-gray-500';
                  const val = sc.active ? 'text-white' : 'text-gray-200';
                  return (
                    <div key={sc.title} className={`p-2.5 rounded-xl border ${sc.active ? 'bg-[#e8590c] border-[#e8590c]' : 'bg-white/[0.03] border-white/10'}`}>
                      <div className={`text-[10px] font-medium mb-1 ${sc.active ? 'text-white' : 'text-gray-300'}`}>{sc.title}</div>
                      <div className="flex justify-between text-[9px]"><span className={lbl}>Qty</span><span className={`tabular-nums ${val}`}>{sc.qty.toFixed(4)}</span></div>
                      <div className="flex justify-between text-[9px]"><span className={lbl}>Notional</span><span className={`tabular-nums ${val}`}>{fmtUsd(sc.notional)}</span></div>
                      <div className="flex justify-between text-[9px]"><span className={lbl}>Entry fee</span><span className={`tabular-nums ${val}`}>{fmtFee(sc.entryFee)}</span></div>
                      <div className="flex justify-between text-[9px]"><span className={lbl}>SL exit fee</span><span className={`tabular-nums ${val}`}>{fmtFee(sc.slFee)}</span></div>
                      {sc.tpFee != null && (
                        <div className="flex justify-between text-[9px]"><span className={lbl}>TP exit fee</span><span className={`tabular-nums ${val}`}>{fmtFee(sc.tpFee)}</span></div>
                      )}
                      <div className={`flex justify-between text-[9px] pt-0.5 mt-0.5 border-t ${sc.active ? 'border-white/25' : 'border-white/10'}`}>
                        <span className={lbl}>Price-move loss</span>
                        <span className={`tabular-nums ${val}`}>{fmtUsd(sc.priceMove)}</span>
                      </div>
                      {sc.netGain != null && (
                        <div className="flex justify-between text-[9px] mt-0.5">
                          <span className={lbl}>Net gain @ TP</span>
                          <span className={`tabular-nums ${sc.active ? 'text-white' : 'text-[#e8590c]'}`}>{fmtUsd(sc.netGain)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Per-direction R:R verdict (Long & Short may differ when entry is
                  away from live — passive for one side, aggressive for the other). */}
              {feeEstimate.minRR > 0 && (feeEstimate.rrForLong != null || feeEstimate.rrForShort != null) && (
                <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/10 text-[10px]">
                  {feeEstimate.rrForLong != null && (
                    <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-200 font-medium">Long</span>
                        <span className="text-[10px] text-gray-500 uppercase">{feeEstimate.longFillMode}</span>
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-gray-400">Eff. R:R</span>
                        <span className={`tabular-nums font-medium ${feeEstimate.longRRMeetsMin === false ? 'text-red-500' : 'text-gray-200'}`}>
                          1:{feeEstimate.rrForLong.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                  {feeEstimate.rrForShort != null && (
                    <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-200 font-medium">Short</span>
                        <span className="text-[10px] text-gray-500 uppercase">{feeEstimate.shortFillMode}</span>
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-gray-400">Eff. R:R</span>
                        <span className={`tabular-nums font-medium ${feeEstimate.shortRRMeetsMin === false ? 'text-red-500' : 'text-gray-200'}`}>
                          1:{feeEstimate.rrForShort.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {feeEstimate.minRR > 0 && (
                <div className="flex justify-between text-[10px] pt-1 border-t border-white/10">
                  <span className="text-gray-400">Profile min R:R</span>
                  <span className="tabular-nums text-gray-200">1:{feeEstimate.minRR.toFixed(2)}</span>
                </div>
              )}

              {/* Fee share of risk — how much of the staked risk is eaten by
                  fees vs. real price movement. Tight SL → fees dominate. */}
              {(() => {
                const feeShare = Math.max(
                  feeEstimate.feeReserveMaker,
                  feeEstimate.feeReserveTaker,
                ) / feeEstimate.riskUsd * 100;
                const pct = feeShare.toFixed(0);
                if (feeShare >= 50) {
                  return (
                    <AlertBanner variant="warning">
                      <span className="font-medium mr-1">SL too tight:</span>
                      Fees ≈ <span className="font-medium">{pct}%</span> of your ${feeEstimate.riskUsd.toFixed(2)} risk — a stop-out is mostly just fees. Widen the SL distance.
                    </AlertBanner>
                  );
                }
                if (feeShare >= 30) {
                  return (
                    <AlertBanner variant="caution">
                      <span className="font-medium mr-1">Heavy fees:</span>
                      Fees ≈ <span className="font-medium">{pct}%</span> of your ${feeEstimate.riskUsd.toFixed(2)} risk. The price-move portion of your stop is small.
                    </AlertBanner>
                  );
                }
                return (
                  <AlertBanner variant="info">
                    <span className="font-medium mr-1 text-gray-900">Lean fees:</span>
                    Only <span className="font-medium">{pct}%</span> of your ${feeEstimate.riskUsd.toFixed(2)} risk goes to fees — most of it is real price-move room.
                  </AlertBanner>
                );
              })()}
              {(feeEstimate.longRRMeetsMin === false || feeEstimate.shortRRMeetsMin === false) && (
                <AlertBanner variant="warning">
                  <span className="font-medium mr-1">Blocked:</span>
                  {feeEstimate.longRRMeetsMin === false && feeEstimate.shortRRMeetsMin === false
                    ? `Both directions are below your profile minimum of 1:${feeEstimate.minRR.toFixed(2)} after fees.`
                    : feeEstimate.longRRMeetsMin === false
                      ? `Long is blocked — Eff. R:R 1:${feeEstimate.rrForLong!.toFixed(2)} (${feeEstimate.longFillMode}) below 1:${feeEstimate.minRR.toFixed(2)}.`
                      : `Short is blocked — Eff. R:R 1:${feeEstimate.rrForShort!.toFixed(2)} (${feeEstimate.shortFillMode}) below 1:${feeEstimate.minRR.toFixed(2)}.`}
                  {' '}Widen TP or tighten SL to proceed.
                </AlertBanner>
              )}
            </>
            )}
          </div>

          {!cardOnly && (() => {
            // SL position implies trade direction: SL below entry = Long
            // (you're protecting a buy by exiting lower), SL above entry =
            // Short. Only the matching button is shown so the user can't
            // submit a setup whose risk geometry contradicts the side.
            const entryNum = parseFloat(orderPrice) || (tickerPrice ? parseFloat(tickerPrice) : NaN);
            const slNum = parseFloat(stopLoss);
            let impliedSide: 'Long' | 'Short' | null = null;
            if (Number.isFinite(entryNum) && Number.isFinite(slNum) && entryNum > 0 && slNum > 0) {
              if (slNum < entryNum) impliedSide = 'Long';
              else if (slNum > entryNum) impliedSide = 'Short';
            }

            const longBlocked = feeEstimate?.longRRMeetsMin === false;
            const shortBlocked = feeEstimate?.shortRRMeetsMin === false;
            const baseDisabled = !isTradingAllowed || loading;
            const longDisabled = baseDisabled || longBlocked;
            const shortDisabled = baseDisabled || shortBlocked;
            const longTitle = !isTradingAllowed
              ? getDisabledReason
              : longBlocked
                ? `Long blocked: Eff. R:R 1:${feeEstimate!.rrForLong!.toFixed(2)} (${feeEstimate!.longFillMode}) < profile min 1:${feeEstimate!.minRR.toFixed(2)}.`
                : '';
            const shortTitle = !isTradingAllowed
              ? getDisabledReason
              : shortBlocked
                ? `Short blocked: Eff. R:R 1:${feeEstimate!.rrForShort!.toFixed(2)} (${feeEstimate!.shortFillMode}) < profile min 1:${feeEstimate!.minRR.toFixed(2)}.`
                : '';

            const showLong = impliedSide === null || impliedSide === 'Long';
            const showShort = impliedSide === null || impliedSide === 'Short';
            return (
              <div className={impliedSide ? '' : 'grid grid-cols-2 gap-2'}>
                {showLong && (
                  <Button size="sm" className={`bg-green-600 hover:bg-green-700 text-xs ${impliedSide === 'Long' ? 'w-full' : ''}`}
                    onClick={() => onPlaceOrder('Long')}
                    disabled={longDisabled}
                    title={longTitle}>
                    Open Long
                  </Button>
                )}
                {showShort && (
                  <Button size="sm" className={`bg-red-600 hover:bg-red-700 text-xs ${impliedSide === 'Short' ? 'w-full' : ''}`}
                    onClick={() => onPlaceOrder('Short')}
                    disabled={shortDisabled}
                    title={shortTitle}>
                    Open Short
                  </Button>
                )}
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
};

export default PlaceOrder;
