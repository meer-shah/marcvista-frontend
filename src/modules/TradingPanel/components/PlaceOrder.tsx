import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RotateCcw } from "lucide-react";
import { riskProfileApi } from "@/lib/api";
import { toast } from "sonner";
import { computeFeeEstimate } from "@/lib/feeEstimate";

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
  variant = 'full',
}) => {
  const cardOnly = variant === 'card-only';
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

  return (
    <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 flex flex-col h-full">
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
                      <span className="font-semibold text-sm">{adjustedRisk.toFixed(2)}%</span>
                      <button
                        title="Reset streak counters (currentrisk back to initial, wins/losses cleared) on the active exchange. Other exchanges keep their state."
                        onClick={async () => {
                          if (!confirm('Reset risk-profile streak on the active exchange? currentrisk will go back to initial and wins/losses will be zeroed. Other exchanges keep their state.')) return;
                          try {
                            const r = await riskProfileApi.resetState();
                            toast.success(`Streak reset on ${r?.exchange || 'active exchange'} — currentrisk back to ${r?.state?.currentrisk}%`);
                            // The parent's poll will pick up the new state on the next tick.
                            try { window.dispatchEvent(new Event('marcvista:trade-updated')); } catch { /* ignore */ }
                          } catch (err: any) {
                            toast.error(err?.message || 'Reset failed');
                          }
                        }}
                        className="text-muted-foreground/60 hover:text-amber-400 transition-colors"
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
                    <span className="font-semibold text-sm">{dailySLRemaining}</span>
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
              <span className="text-sm font-bold text-primary">{leverage}x</span>
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
                    Live: <span className="font-bold text-green-400">${parseFloat(tickerPrice).toLocaleString()}</span>
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
              <h3 className={`font-bold text-white tracking-tight ${cardOnly ? 'text-base' : 'text-sm'}`}>
                Risk &amp; Fee Estimate
              </h3>
              <span className="text-[10px] font-medium text-muted-foreground" title="Bybit USDT Perpetual VIP-0: Maker 0.02% / Taker 0.055%">
                Bybit 0.02% / 0.055%
              </span>
            </div>

            {!feeEstimate && (
              <div className="py-6 text-center text-[12px] text-muted-foreground/70 leading-snug">
                Fill in <span className="text-white/80 font-semibold">Order Price</span>, <span className="text-green-400 font-semibold">Take Profit</span>, and <span className="text-red-400 font-semibold">Stop Loss</span> below to see your sized position, fee breakdown, and effective risk-to-reward.
              </div>
            )}

            {feeEstimate && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Total USD risk (fees included)</span>
                <span className="font-mono font-semibold text-red-400">{fmtUsd(feeEstimate.riskUsd)}</span>
              </div>
              {feeEstimate.makerHint && (
                <div className={`text-[10px] leading-snug px-2 py-1.5 rounded border ${
                  feeEstimate.likelyTaker
                    ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                }`}>
                  <span className="font-semibold mr-1">
                    {feeEstimate.likelyTaker ? '⚡ Likely Taker:' : '✓ Likely Maker:'}
                  </span>
                  {feeEstimate.makerHint}
                </div>
              )}

              {/* Two scenario blocks side by side */}
              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/5 mt-1">
                {/* Maker entry scenario */}
                <div className={`p-1.5 rounded border ${!feeEstimate.likelyTaker ? 'border-emerald-400/40 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                  <div className="text-[10px] font-semibold text-emerald-300/90 mb-1">If Maker entry</div>
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Qty</span><span className="font-mono">{feeEstimate.qtyMaker.toFixed(4)}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Notional</span><span className="font-mono">{fmtUsd(feeEstimate.notionalMaker)}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Entry fee</span><span className="font-mono">{fmtFee(feeEstimate.entryFeeMaker)}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">SL exit fee</span><span className="font-mono">{fmtFee(feeEstimate.slExitFeeMaker)}</span></div>
                  {feeEstimate.tpExitFeeMaker != null && (
                    <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">TP exit fee</span><span className="font-mono">{fmtFee(feeEstimate.tpExitFeeMaker)}</span></div>
                  )}
                  <div className="flex justify-between text-[10px] pt-0.5 mt-0.5 border-t border-white/5">
                    <span className="text-muted-foreground">Price-move loss</span>
                    <span className="font-mono">{fmtUsd(feeEstimate.priceMoveLossMaker)}</span>
                  </div>
                  {feeEstimate.netGainMaker != null && (
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className="text-muted-foreground">Net gain @ TP</span>
                      <span className="font-mono text-green-400">{fmtUsd(feeEstimate.netGainMaker)}</span>
                    </div>
                  )}
                  {feeEstimate.rrMaker != null && (
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className="text-muted-foreground">Eff. R:R</span>
                      <span className="font-mono font-semibold">1:{feeEstimate.rrMaker.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Taker entry scenario */}
                <div className={`p-1.5 rounded border ${feeEstimate.likelyTaker ? 'border-amber-400/40 bg-amber-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                  <div className="text-[10px] font-semibold text-amber-300/90 mb-1">If Taker entry</div>
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Qty</span><span className="font-mono">{feeEstimate.qtyTaker.toFixed(4)}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Notional</span><span className="font-mono">{fmtUsd(feeEstimate.notionalTaker)}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Entry fee</span><span className="font-mono">{fmtFee(feeEstimate.entryFeeTaker)}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">SL exit fee</span><span className="font-mono">{fmtFee(feeEstimate.slExitFeeTaker)}</span></div>
                  {feeEstimate.tpExitFeeTaker != null && (
                    <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">TP exit fee</span><span className="font-mono">{fmtFee(feeEstimate.tpExitFeeTaker)}</span></div>
                  )}
                  <div className="flex justify-between text-[10px] pt-0.5 mt-0.5 border-t border-white/5">
                    <span className="text-muted-foreground">Price-move loss</span>
                    <span className="font-mono">{fmtUsd(feeEstimate.priceMoveLossTaker)}</span>
                  </div>
                  {feeEstimate.netGainTaker != null && (
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className="text-muted-foreground">Net gain @ TP</span>
                      <span className="font-mono text-green-400">{fmtUsd(feeEstimate.netGainTaker)}</span>
                    </div>
                  )}
                  {feeEstimate.rrTaker != null && (
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className="text-muted-foreground">Eff. R:R</span>
                      <span className="font-mono font-semibold">
                        1:{feeEstimate.rrTaker.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Per-direction R:R verdict (Long & Short may differ when entry is
                  away from live — passive for one side, aggressive for the other). */}
              {feeEstimate.minRR > 0 && (feeEstimate.rrForLong != null || feeEstimate.rrForShort != null) && (
                <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/5 text-[10px]">
                  {feeEstimate.rrForLong != null && (
                    <div className="p-1.5 rounded border border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <span className="text-green-400 font-semibold">Long</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{feeEstimate.longFillMode}</span>
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-muted-foreground">Eff. R:R</span>
                        <span className={`font-mono font-semibold ${
                          feeEstimate.longRRMeetsMin === false ? 'text-red-400'
                            : feeEstimate.longRRMeetsMin === true ? 'text-green-400' : ''
                        }`}>
                          1:{feeEstimate.rrForLong.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                  {feeEstimate.rrForShort != null && (
                    <div className="p-1.5 rounded border border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <span className="text-red-400 font-semibold">Short</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{feeEstimate.shortFillMode}</span>
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-muted-foreground">Eff. R:R</span>
                        <span className={`font-mono font-semibold ${
                          feeEstimate.shortRRMeetsMin === false ? 'text-red-400'
                            : feeEstimate.shortRRMeetsMin === true ? 'text-green-400' : ''
                        }`}>
                          1:{feeEstimate.rrForShort.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {feeEstimate.minRR > 0 && (
                <div className="flex justify-between text-[10px] pt-1 border-t border-white/5">
                  <span className="text-muted-foreground">Profile min R:R</span>
                  <span className="font-mono">1:{feeEstimate.minRR.toFixed(2)}</span>
                </div>
              )}

              {/* Fee share of risk — tells the user how much of the staked
                  risk is being eaten by fees (entry + SL exit) vs. real
                  price movement. Tight SL → fees dominate → bad trade.
                  Wide SL → fees are negligible → healthy. */}
              {(() => {
                const feeShare = Math.max(
                  feeEstimate.feeReserveMaker,
                  feeEstimate.feeReserveTaker,
                ) / feeEstimate.riskUsd * 100;
                const pct = feeShare.toFixed(0);
                if (feeShare >= 50) {
                  return (
                    <div className="text-[10px] leading-snug px-2 py-1.5 rounded border bg-red-500/15 border-red-400/40 text-red-300">
                      <span className="font-semibold mr-1">⛔ SL too tight:</span>
                      Fees ≈ <b>{pct}%</b> of your ${feeEstimate.riskUsd.toFixed(2)} risk — a stop-out is mostly just fees. Widen the SL distance.
                    </div>
                  );
                }
                if (feeShare >= 30) {
                  return (
                    <div className="text-[10px] leading-snug px-2 py-1.5 rounded border bg-amber-500/15 border-amber-400/40 text-amber-300">
                      <span className="font-semibold mr-1">⚠ Heavy fees:</span>
                      Fees ≈ <b>{pct}%</b> of your ${feeEstimate.riskUsd.toFixed(2)} risk. The price-move portion of your stop is small.
                    </div>
                  );
                }
                return (
                  <div className="text-[10px] leading-snug px-2 py-1.5 rounded border bg-emerald-500/15 border-emerald-400/40 text-emerald-300">
                    <span className="font-semibold mr-1">✓ Lean fees:</span>
                    Only <b>{pct}%</b> of your ${feeEstimate.riskUsd.toFixed(2)} risk goes to fees — most of it is real price-move room.
                  </div>
                );
              })()}
              {(feeEstimate.longRRMeetsMin === false || feeEstimate.shortRRMeetsMin === false) && (
                <div className="text-[10px] leading-snug px-2 py-1.5 rounded border bg-red-500/15 border-red-400/40 text-red-300">
                  <span className="font-semibold mr-1">⛔ Blocked:</span>
                  {feeEstimate.longRRMeetsMin === false && feeEstimate.shortRRMeetsMin === false
                    ? `Both directions are below your profile minimum of 1:${feeEstimate.minRR.toFixed(2)} after fees.`
                    : feeEstimate.longRRMeetsMin === false
                      ? `Long is blocked — Eff. R:R 1:${feeEstimate.rrForLong!.toFixed(2)} (${feeEstimate.longFillMode}) below 1:${feeEstimate.minRR.toFixed(2)}.`
                      : `Short is blocked — Eff. R:R 1:${feeEstimate.rrForShort!.toFixed(2)} (${feeEstimate.shortFillMode}) below 1:${feeEstimate.minRR.toFixed(2)}.`}
                  {' '}Widen TP or tighten SL to proceed.
                </div>
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
