import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { riskProfileApi, orderApi } from "@/lib/api";
import { toast } from "sonner";

// Fallback fee rates if the broker hasn't reported one for this symbol yet
// (cold cache, network blip, exchange that doesn't expose per-symbol fees).
// These are Bybit crypto-perp defaults — over-conservative for venues like
// MEXC (0.01% maker / 0.05% taker) but at least never UNDER-estimate fees.
const FALLBACK_MAKER = 0.0002;
const FALLBACK_TAKER = 0.00055;

interface PlaceOrderProps {
  activeProfile: any;
  positions: any[];
  pendingOrders: any[];
  appTrades: any[];
  adjustedRisk: number;
  selectedSymbol: string;
  activeExchange: string;
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
}

const PlaceOrder: React.FC<PlaceOrderProps> = ({
  activeProfile, positions, pendingOrders, appTrades, adjustedRisk,
  selectedSymbol, activeExchange,
  leverage, maxLeverage, setLeverage,
  orderPrice, setOrderPrice, takeProfit, setTakeProfit, stopLoss, setStopLoss,
  tickerPrice, accountBalance, isTradingAllowed, getDisabledReason, loading,
  onApplyLeverage, onPlaceOrder,
}) => {
  // Per-symbol fee rates from the active exchange. Refetched on symbol or
  // exchange change. Falls back to conservative defaults until loaded —
  // `feeRatesLive` tracks whether we're showing the real broker rate or the
  // fallback, so the UI can flag stale data.
  const [feeRates, setFeeRates] = useState<{ maker: number; taker: number }>({
    maker: FALLBACK_MAKER, taker: FALLBACK_TAKER,
  });
  const [feeRatesLive, setFeeRatesLive] = useState(false);
  useEffect(() => {
    if (!selectedSymbol) return;
    let cancelled = false;
    setFeeRatesLive(false);
    orderApi.getFeeRates(selectedSymbol)
      .then(r => {
        if (cancelled) return;
        if (!r?.rates) {
          console.warn('[PlaceOrder] /api/order/fee-rate returned no rates — falling back to defaults. Did you restart the backend after the fee-rate endpoint was added?');
          return;
        }
        const { maker, taker } = r.rates;
        if (Number.isFinite(maker) && Number.isFinite(taker) && maker >= 0 && taker >= 0) {
          setFeeRates({ maker, taker });
          setFeeRatesLive(true);
        }
      })
      .catch((err) => {
        console.warn('[PlaceOrder] fee-rate fetch failed — using fallback', err?.message);
      });
    return () => { cancelled = true; };
  }, [selectedSymbol, activeExchange]);
  // Scoped to (active exchange, current profile-activation cutoff) — losses
  // on other exchanges or from before this profile was activated here don't
  // consume the daily SL budget. Mirrors the lossesToday filter in
  // TradingPanelPage so both displays stay consistent.
  const dailySLRemaining = (() => {
    if (!activeProfile) return 0;
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    const activatedAt = activeProfile.activatedAt
      ? new Date(activeProfile.activatedAt).getTime()
      : 0;
    const lossesToday = appTrades.filter(trade => {
      const tradeExchange = trade.exchange || 'bybit';
      if (tradeExchange !== activeExchange) return false;
      const raw = trade.closedAt ?? trade.updatedAt;
      if (!raw) return false;
      const date = new Date(raw);
      if (isNaN(date.getTime())) return false;
      if (activatedAt && date.getTime() < activatedAt) return false;
      const pnl = parseFloat(trade.pnl ?? trade.closedPnl ?? 0);
      return date >= start && date <= end && pnl < 0;
    }).length;
    return Math.max(0, dailyLimit - lossesToday);
  })();

  // Fee estimation — per-symbol Maker/Taker from the active exchange.
  // Bybit XAUUSDT is ~0.028% taker vs ~0.055% for crypto perps, and the
  // user's VIP tier discounts on top — using a single hardcoded rate caused
  // tight-SL trades to under-size by 50%+ on XAUUSDT.
  const MAKER = feeRates.maker;
  const TAKER = feeRates.taker;
  const feeEstimate = (() => {
    const entry = parseFloat(orderPrice) || (tickerPrice ? parseFloat(tickerPrice) : NaN);
    const sl = parseFloat(stopLoss);
    const tp = parseFloat(takeProfit);
    const balance = parseFloat(accountBalance) || 0;
    if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(sl) || sl <= 0 || balance <= 0 || adjustedRisk <= 0) {
      return null;
    }
    const distance = Math.abs(entry - sl);
    if (distance === 0) return null;
    const riskUsd = balance * (adjustedRisk / 100);
    // Fee-aware qty: total loss at SL == riskUsd by construction.
    const qtyFor = (feeEntry: number) => {
      const denom = distance + entry * feeEntry + sl * TAKER;
      return denom > 0 ? riskUsd / denom : 0;
    };
    const qtyMaker = qtyFor(MAKER);
    const qtyTaker = qtyFor(TAKER);
    // Per-scenario notionals & fees
    const notionalMaker = qtyMaker * entry;
    const notionalTaker = qtyTaker * entry;
    const entryFeeMaker = notionalMaker * MAKER;
    const entryFeeTaker = notionalTaker * TAKER;
    const slExitFeeMaker = qtyMaker * sl * TAKER;
    const slExitFeeTaker = qtyTaker * sl * TAKER;
    const tpExitFeeMaker = Number.isFinite(tp) && tp > 0 ? qtyMaker * tp * TAKER : null;
    const tpExitFeeTaker = Number.isFinite(tp) && tp > 0 ? qtyTaker * tp * TAKER : null;
    // Reserve = fee budget baked into riskUsd (price-move loss is riskUsd minus this).
    const feeReserveMaker = entryFeeMaker + slExitFeeMaker;
    const feeReserveTaker = entryFeeTaker + slExitFeeTaker;
    const priceMoveLossMaker = riskUsd - feeReserveMaker;
    const priceMoveLossTaker = riskUsd - feeReserveTaker;
    // Gain if TP hits — uses each scenario's qty
    const grossGainMaker = Number.isFinite(tp) && tp > 0 ? Math.abs(tp - entry) * qtyMaker : null;
    const grossGainTaker = Number.isFinite(tp) && tp > 0 ? Math.abs(tp - entry) * qtyTaker : null;
    const netGainMaker = grossGainMaker != null && tpExitFeeMaker != null
      ? grossGainMaker - entryFeeMaker - tpExitFeeMaker : null;
    const netGainTaker = grossGainTaker != null && tpExitFeeTaker != null
      ? grossGainTaker - entryFeeTaker - tpExitFeeTaker : null;
    // Effective R:R — by construction, denominator is riskUsd (total loss).
    const rrMaker = netGainMaker != null ? netGainMaker / riskUsd : null;
    const rrTaker = netGainTaker != null ? netGainTaker / riskUsd : null;
    // Maker/Taker heuristic — based on whether the user explicitly entered a
    // price away from the live ticker. If they left it blank, the backend
    // submits at the live ticker price → almost always crosses the spread → Taker.
    const live = tickerPrice ? parseFloat(tickerPrice) : NaN;
    const userTypedEntry = orderPrice.trim().length > 0;
    let likelyTaker = true;
    let makerHint: string | null = null;
    if (!userTypedEntry) {
      makerHint = 'No entry price set — order will submit at the live price and almost certainly fill as Taker.';
    } else if (Number.isFinite(live) && live > 0) {
      const proximityPct = Math.abs(entry - live) / live * 100;
      if (proximityPct < 0.02) {
        makerHint = 'Entry is at the live price — likely to cross the spread and fill as Taker.';
        likelyTaker = true;
      } else {
        // Direction-dependent: a buy-limit below live, or sell-limit above live, would be passive (Maker).
        // Without knowing the direction here, just note the proximity.
        likelyTaker = false;
        const suggestBuyMaker = (live * 0.999).toFixed(2);
        const suggestSellMaker = (live * 1.001).toFixed(2);
        makerHint = `Entry sits ${proximityPct.toFixed(2)}% off live. For a Maker fill: Long → set price ≤ ${suggestBuyMaker}, Short → set price ≥ ${suggestSellMaker}.`;
      }
    }
    const minRR = Number(activeProfile?.minRiskRewardRatio) || 0;

    // Per-direction fill-mode classification — mirrors backend `classifyFillType`.
    // The SAME entry price can be Maker for one direction and Taker for the other:
    //   - Long  (Buy):  entry < live  → Maker;  entry ≥ live  → Taker
    //   - Short (Sell): entry > live  → Maker;  entry ≤ live  → Taker
    // Blank entry submits at live → Taker for both.
    const TOL_PCT = 0.0002; // 0.02% — matches backend FILL_TYPE_TOLERANCE_PCT
    const classify = (side: 'Buy' | 'Sell'): 'maker' | 'taker' => {
      if (!userTypedEntry) return 'taker';
      if (!Number.isFinite(live) || live <= 0) return 'taker';
      const tol = live * TOL_PCT;
      if (side === 'Buy') return entry < live - tol ? 'maker' : 'taker';
      return entry > live + tol ? 'maker' : 'taker';
    };
    const longFillMode = classify('Buy');
    const shortFillMode = classify('Sell');
    const rrForLong = longFillMode === 'maker' ? rrMaker : rrTaker;
    const rrForShort = shortFillMode === 'maker' ? rrMaker : rrTaker;
    const longRRMeetsMin = rrForLong != null && minRR > 0 ? rrForLong >= minRR : null;
    const shortRRMeetsMin = rrForShort != null && minRR > 0 ? rrForShort >= minRR : null;

    return {
      riskUsd,
      qtyMaker, qtyTaker,
      notionalMaker, notionalTaker,
      entryFeeMaker, entryFeeTaker,
      slExitFeeMaker, slExitFeeTaker,
      tpExitFeeMaker, tpExitFeeTaker,
      feeReserveMaker, feeReserveTaker,
      priceMoveLossMaker, priceMoveLossTaker,
      grossGainMaker, grossGainTaker,
      netGainMaker, netGainTaker,
      rrMaker, rrTaker,
      likelyTaker, makerHint,
      minRR,
      longFillMode, shortFillMode,
      rrForLong, rrForShort,
      longRRMeetsMin, shortRRMeetsMin,
    };
  })();
  const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtFee = (n: number) => `$${n.toFixed(2)}`;

  return (
    <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 flex flex-col h-full">
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
      <CardContent className="flex-1 overflow-y-auto space-y-3">
        <div className="space-y-3">
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

          {feeEstimate && (
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs space-y-1.5">
              <div className="flex items-center justify-between font-semibold text-muted-foreground">
                <span>Risk & Fee Estimate</span>
                <span
                  className={`text-[10px] font-normal capitalize ${feeRatesLive ? '' : 'text-amber-400'}`}
                  title={feeRatesLive
                    ? `${activeExchange} ${selectedSymbol}: Maker ${(MAKER * 100).toFixed(4)}% / Taker ${(TAKER * 100).toFixed(4)}% — LIVE from broker.`
                    : `Showing fallback rates — broker fee-rate fetch failed. Restart the backend if you just deployed; otherwise check console / backend logs. Sizing may under-use your risk budget on tight-SL trades.`
                  }
                >
                  {activeExchange} {(MAKER * 100).toFixed(3)}% / {(TAKER * 100).toFixed(3)}%
                  {!feeRatesLive && ' ⚠'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Total USD risk (fees included)</span>
                <span className="font-mono font-semibold text-red-400">{fmtUsd(feeEstimate.riskUsd)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground/80 leading-snug">
                Position size is calculated so that the total loss if SL hits — including
                entry and exit fees — equals your stated risk exactly. Two scenarios shown
                because actual qty depends on whether the entry fills as Maker or Taker.
              </div>
              {feeEstimate.makerHint && (
                <div className={`text-[11px] leading-snug px-2 py-1.5 rounded border ${
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
                  <div className="text-[11px] font-semibold text-emerald-300/90 mb-1">If Maker entry</div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Qty</span><span className="font-mono">{feeEstimate.qtyMaker.toFixed(4)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Notional</span><span className="font-mono">{fmtUsd(feeEstimate.notionalMaker)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Entry fee</span><span className="font-mono">{fmtFee(feeEstimate.entryFeeMaker)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">SL exit fee</span><span className="font-mono">{fmtFee(feeEstimate.slExitFeeMaker)}</span></div>
                  {feeEstimate.tpExitFeeMaker != null && (
                    <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">TP exit fee</span><span className="font-mono">{fmtFee(feeEstimate.tpExitFeeMaker)}</span></div>
                  )}
                  <div className="flex justify-between text-[11px] pt-0.5 mt-0.5 border-t border-white/5">
                    <span className="text-muted-foreground">Price-move loss</span>
                    <span className="font-mono">{fmtUsd(feeEstimate.priceMoveLossMaker)}</span>
                  </div>
                  {feeEstimate.netGainMaker != null && (
                    <div className="flex justify-between text-[11px] mt-0.5">
                      <span className="text-muted-foreground">Net gain @ TP</span>
                      <span className="font-mono text-green-400">{fmtUsd(feeEstimate.netGainMaker)}</span>
                    </div>
                  )}
                  {feeEstimate.rrMaker != null && (
                    <div className="flex justify-between text-[11px] mt-0.5">
                      <span className="text-muted-foreground">Eff. R:R</span>
                      <span className="font-mono font-semibold">1:{feeEstimate.rrMaker.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Taker entry scenario */}
                <div className={`p-1.5 rounded border ${feeEstimate.likelyTaker ? 'border-amber-400/40 bg-amber-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                  <div className="text-[11px] font-semibold text-amber-300/90 mb-1">If Taker entry</div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Qty</span><span className="font-mono">{feeEstimate.qtyTaker.toFixed(4)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Notional</span><span className="font-mono">{fmtUsd(feeEstimate.notionalTaker)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Entry fee</span><span className="font-mono">{fmtFee(feeEstimate.entryFeeTaker)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">SL exit fee</span><span className="font-mono">{fmtFee(feeEstimate.slExitFeeTaker)}</span></div>
                  {feeEstimate.tpExitFeeTaker != null && (
                    <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">TP exit fee</span><span className="font-mono">{fmtFee(feeEstimate.tpExitFeeTaker)}</span></div>
                  )}
                  <div className="flex justify-between text-[11px] pt-0.5 mt-0.5 border-t border-white/5">
                    <span className="text-muted-foreground">Price-move loss</span>
                    <span className="font-mono">{fmtUsd(feeEstimate.priceMoveLossTaker)}</span>
                  </div>
                  {feeEstimate.netGainTaker != null && (
                    <div className="flex justify-between text-[11px] mt-0.5">
                      <span className="text-muted-foreground">Net gain @ TP</span>
                      <span className="font-mono text-green-400">{fmtUsd(feeEstimate.netGainTaker)}</span>
                    </div>
                  )}
                  {feeEstimate.rrTaker != null && (
                    <div className="flex justify-between text-[11px] mt-0.5">
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
                <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/5 text-[11px]">
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
                <div className="flex justify-between text-[11px] pt-1 border-t border-white/5">
                  <span className="text-muted-foreground">Profile min R:R</span>
                  <span className="font-mono">1:{feeEstimate.minRR.toFixed(2)}</span>
                </div>
              )}
              {(feeEstimate.longRRMeetsMin === false || feeEstimate.shortRRMeetsMin === false) && (
                <div className="text-[11px] leading-snug px-2 py-1.5 rounded border bg-red-500/15 border-red-400/40 text-red-300">
                  <span className="font-semibold mr-1">⛔ Blocked:</span>
                  {feeEstimate.longRRMeetsMin === false && feeEstimate.shortRRMeetsMin === false
                    ? `Both directions are below your profile minimum of 1:${feeEstimate.minRR.toFixed(2)} after fees.`
                    : feeEstimate.longRRMeetsMin === false
                      ? `Long is blocked — Eff. R:R 1:${feeEstimate.rrForLong!.toFixed(2)} (${feeEstimate.longFillMode}) below 1:${feeEstimate.minRR.toFixed(2)}.`
                      : `Short is blocked — Eff. R:R 1:${feeEstimate.rrForShort!.toFixed(2)} (${feeEstimate.shortFillMode}) below 1:${feeEstimate.minRR.toFixed(2)}.`}
                  {' '}Widen TP or tighten SL to proceed.
                </div>
              )}
            </div>
          )}

          {(() => {
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
            // "Fee-share-of-risk" guard. When SL is set so tight that fees
            // would consume most of the allocated risk, the trade becomes
            // a fee-burner: stop-out costs you ~fees only, with essentially
            // no price-movement loss. Warn at 30%, hard-warn at 50%. We
            // don't block (user override stays possible) — but the message
            // is loud so it can't be missed.
            const feeSharePct = feeEstimate
              ? (Math.max(feeEstimate.feeReserveMaker, feeEstimate.feeReserveTaker) / feeEstimate.riskUsd) * 100
              : 0;
            const showFeeWarning = feeSharePct >= 30;
            const severe = feeSharePct >= 50;
            return (
              <div className="space-y-2">
                {showFeeWarning && (
                  <div className={`flex items-start gap-2 p-2 rounded border text-[11px] leading-snug ${
                    severe
                      ? 'bg-red-500/10 border-red-500/40 text-red-300'
                      : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>
                      <strong>{severe ? 'SL too tight — your loss will be almost entirely fees.' : 'Heads up — fees will consume a large share of this trade\'s risk.'}</strong>{' '}
                      Fees ≈ <strong>{feeSharePct.toFixed(0)}%</strong> of your ${feeEstimate!.riskUsd.toFixed(2)} risk budget. Widen the SL distance so the price-move portion is meaningful.
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs"
                    onClick={() => onPlaceOrder('Long')}
                    disabled={longDisabled}
                    title={longTitle}>
                    Open Long
                  </Button>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-xs"
                    onClick={() => onPlaceOrder('Short')}
                    disabled={shortDisabled}
                    title={shortTitle}>
                    Open Short
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
};

export default PlaceOrder;
