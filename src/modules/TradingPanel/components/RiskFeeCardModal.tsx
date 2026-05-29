// Risk & Fee modal triggered from the native chart's Buy / Sell buttons.
//
// What this is NOT: a separate order-submission path. The Open button here
// calls the exact same `onPlaceOrder(direction)` handler from
// TradingPanelPage, so every existing gate runs unchanged:
//   - activeProfile / positions / pendingOrders / daily-SL  (in handlePlaceOrder)
//   - per-direction R:R blocked banner                       (disabled below)
//   - isTradingAllowed / loading                             (disabled below)
//   - backend gates                                          (in placeOrder route)
//
// This component is purely a presentation of `computeFeeEstimate(...)` —
// identical math to the side panel — plus one submit button for the side
// the user clicked on the chart.

import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { computeFeeEstimate, fmtUsd, fmtFee } from '@/lib/feeEstimate';

interface RiskFeeCardModalProps {
  open: boolean;
  side: 'Long' | 'Short' | null;
  onClose: () => void;

  // Same state the side panel reads.
  orderPrice: string;
  takeProfit: string;
  stopLoss: string;
  tickerPrice: string | null;
  accountBalance: string;
  adjustedRisk: number;
  activeProfile: any;

  // Same gate inputs as PlaceOrder.
  isTradingAllowed: boolean;
  getDisabledReason: string;
  loading: boolean;

  // SAME handler the side panel uses. Returns a promise so we can close on
  // success and keep open on error. We treat throw OR rejection as "error".
  onPlaceOrder: (direction: 'Long' | 'Short') => Promise<void> | void;
}

export default function RiskFeeCardModal({
  open, side, onClose,
  orderPrice, takeProfit, stopLoss, tickerPrice, accountBalance,
  adjustedRisk, activeProfile,
  isTradingAllowed, getDisabledReason, loading,
  onPlaceOrder,
}: RiskFeeCardModalProps) {
  const [submitting, setSubmitting] = useState(false);

  // Reset submitting state when modal opens/closes for a fresh attempt.
  useEffect(() => { if (!open) setSubmitting(false); }, [open]);

  const feeEstimate = computeFeeEstimate({
    orderPrice, takeProfit, stopLoss, tickerPrice, accountBalance,
    adjustedRisk, activeProfile,
  });

  // Per-direction block — mirrors the side panel exactly.
  const rrForThisSide = side === 'Long'
    ? feeEstimate?.rrForLong
    : feeEstimate?.rrForShort;
  const meetsMin = side === 'Long'
    ? feeEstimate?.longRRMeetsMin
    : feeEstimate?.shortRRMeetsMin;
  const fillMode = side === 'Long'
    ? feeEstimate?.longFillMode
    : feeEstimate?.shortFillMode;

  const blocked = meetsMin === false;
  const baseDisabled = !isTradingAllowed || loading || submitting;
  const submitDisabled = baseDisabled || blocked || !side;
  const disabledTitle = !isTradingAllowed
    ? getDisabledReason
    : blocked && rrForThisSide != null && feeEstimate
      ? `${side} blocked: Eff. R:R 1:${rrForThisSide.toFixed(2)} (${fillMode}) < profile min 1:${feeEstimate.minRR.toFixed(2)}.`
      : '';

  const handleOpen = async () => {
    if (!side) return;
    setSubmitting(true);
    let errored = false;
    try {
      const r = onPlaceOrder(side);
      if (r && typeof (r as Promise<void>).then === 'function') {
        await r;
      }
    } catch {
      errored = true;
    }
    setSubmitting(false);
    // Per the spec: close on success, stay open on error.
    if (!errored) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-[#1B1B1B]/95 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Risk &amp; Fee Estimate</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              Bybit 0.02% / 0.055%
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Confirming a {side === 'Long' ? <b className="text-green-400">Long</b> : <b className="text-red-400">Short</b>} from the chart.
            Same gates as the side panel apply.
          </DialogDescription>
        </DialogHeader>

        {!feeEstimate ? (
          <div className="text-sm text-muted-foreground p-3 rounded bg-white/5 border border-white/10">
            Set an entry price, take-profit, and stop-loss on the chart before opening this modal.
          </div>
        ) : (
          <div className="space-y-2 text-xs">
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

            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/5">
              <ScenarioCol title="If Maker entry" accent="emerald" active={!feeEstimate.likelyTaker}
                qty={feeEstimate.qtyMaker} notional={feeEstimate.notionalMaker}
                entryFee={feeEstimate.entryFeeMaker} slFee={feeEstimate.slExitFeeMaker}
                tpFee={feeEstimate.tpExitFeeMaker} priceMove={feeEstimate.priceMoveLossMaker}
                netGain={feeEstimate.netGainMaker} rr={feeEstimate.rrMaker} />
              <ScenarioCol title="If Taker entry" accent="amber" active={feeEstimate.likelyTaker}
                qty={feeEstimate.qtyTaker} notional={feeEstimate.notionalTaker}
                entryFee={feeEstimate.entryFeeTaker} slFee={feeEstimate.slExitFeeTaker}
                tpFee={feeEstimate.tpExitFeeTaker} priceMove={feeEstimate.priceMoveLossTaker}
                netGain={feeEstimate.netGainTaker} rr={feeEstimate.rrTaker} />
            </div>

            {feeEstimate.minRR > 0 && (
              <div className="flex justify-between text-[11px] pt-1 border-t border-white/5">
                <span className="text-muted-foreground">Profile min R:R</span>
                <span className="font-mono">1:{feeEstimate.minRR.toFixed(2)}</span>
              </div>
            )}

            {side && rrForThisSide != null && (
              <div className="p-1.5 rounded border border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className={side === 'Long' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {side}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase">{fillMode}</span>
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-muted-foreground">Eff. R:R</span>
                  <span className={`font-mono font-semibold ${meetsMin === false ? 'text-red-400' : meetsMin === true ? 'text-green-400' : ''}`}>
                    1:{rrForThisSide.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {blocked && rrForThisSide != null && feeEstimate && (
              <div className="text-[11px] leading-snug px-2 py-1.5 rounded border bg-red-500/15 border-red-400/40 text-red-300">
                <span className="font-semibold mr-1">⛔ Blocked:</span>
                {side} is blocked — Eff. R:R 1:{rrForThisSide.toFixed(2)} ({fillMode}) below 1:{feeEstimate.minRR.toFixed(2)}.
                Widen TP or tighten SL to proceed.
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex gap-2">
          <Button
            size="sm"
            className={side === 'Short' ? 'bg-red-600 hover:bg-red-700 flex-1' : 'bg-green-600 hover:bg-green-700 flex-1'}
            disabled={submitDisabled}
            title={disabledTitle}
            onClick={handleOpen}
          >
            {submitting ? 'Submitting…' : `Open ${side ?? ''}`}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioCol({
  title, accent, active, qty, notional, entryFee, slFee, tpFee, priceMove, netGain, rr,
}: {
  title: string; accent: 'emerald' | 'amber'; active: boolean;
  qty: number; notional: number; entryFee: number; slFee: number;
  tpFee: number | null; priceMove: number; netGain: number | null; rr: number | null;
}) {
  const activeCls = active
    ? (accent === 'emerald' ? 'border-emerald-400/40 bg-emerald-500/5' : 'border-amber-400/40 bg-amber-500/5')
    : 'border-white/5 bg-white/[0.02]';
  const head = accent === 'emerald' ? 'text-emerald-300/90' : 'text-amber-300/90';
  return (
    <div className={`p-1.5 rounded border ${activeCls}`}>
      <div className={`text-[11px] font-semibold mb-1 ${head}`}>{title}</div>
      <Row k="Qty" v={qty.toFixed(4)} />
      <Row k="Notional" v={fmtUsd(notional)} />
      <Row k="Entry fee" v={fmtFee(entryFee)} />
      <Row k="SL exit fee" v={fmtFee(slFee)} />
      {tpFee != null && <Row k="TP exit fee" v={fmtFee(tpFee)} />}
      <div className="border-t border-white/5 mt-0.5 pt-0.5">
        <Row k="Price-move loss" v={fmtUsd(priceMove)} />
      </div>
      {netGain != null && <Row k="Net gain @ TP" v={fmtUsd(netGain)} cls="text-green-400" />}
      {rr != null && <Row k="Eff. R:R" v={`1:${rr.toFixed(2)}`} bold />}
    </div>
  );
}

function Row({ k, v, cls = '', bold = false }: { k: string; v: string; cls?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-mono ${bold ? 'font-semibold' : ''} ${cls}`}>{v}</span>
    </div>
  );
}
