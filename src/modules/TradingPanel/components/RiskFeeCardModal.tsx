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
      <DialogContent className="max-w-md bg-[#0a0a0a] border-white/[0.07] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-sm font-medium text-gray-200">
            <span>Risk &amp; Fee Estimate</span>
            <span className="text-[10px] font-normal text-gray-500">
              Bybit 0.02% / 0.055%
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            Confirming a <span className="text-white font-medium">{side}</span> from the chart. Same gates as the side panel apply.
          </DialogDescription>
        </DialogHeader>

        {!feeEstimate ? (
          <div className="text-sm text-gray-400 p-3 rounded-xl bg-white/[0.03] border border-white/10">
            Set an entry price, take-profit, and stop-loss on the chart before opening this modal.
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-gray-400 font-medium">Total USD risk (fees included)</span>
              <span className="tabular-nums font-medium text-[#e8590c]">{fmtUsd(feeEstimate.riskUsd)}</span>
            </div>
            <div className="text-[10px] text-gray-500 leading-snug">
              Position size is calculated so that the total loss if SL hits — including
              entry and exit fees — equals your stated risk exactly. Two scenarios shown
              because actual qty depends on whether the entry fills as Maker or Taker.
            </div>
            {feeEstimate.makerHint && (
              <div className="text-[9px] leading-snug px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-gray-300">
                <span className="font-medium mr-1 text-[#facc15]">
                  {feeEstimate.likelyTaker ? 'Likely Taker:' : 'Likely Maker:'}
                </span>
                {feeEstimate.makerHint}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1.5">
              <ScenarioCol title="If Maker entry" active={!feeEstimate.likelyTaker}
                qty={feeEstimate.qtyMaker} notional={feeEstimate.notionalMaker}
                entryFee={feeEstimate.entryFeeMaker} slFee={feeEstimate.slExitFeeMaker}
                tpFee={feeEstimate.tpExitFeeMaker} priceMove={feeEstimate.priceMoveLossMaker}
                netGain={feeEstimate.netGainMaker} rr={feeEstimate.rrMaker} />
              <ScenarioCol title="If Taker entry" active={feeEstimate.likelyTaker}
                qty={feeEstimate.qtyTaker} notional={feeEstimate.notionalTaker}
                entryFee={feeEstimate.entryFeeTaker} slFee={feeEstimate.slExitFeeTaker}
                tpFee={feeEstimate.tpExitFeeTaker} priceMove={feeEstimate.priceMoveLossTaker}
                netGain={feeEstimate.netGainTaker} rr={feeEstimate.rrTaker} />
            </div>

            {feeEstimate.minRR > 0 && (
              <div className="flex justify-between text-[11px] pt-1.5 border-t border-white/10">
                <span className="text-gray-400">Profile min R:R</span>
                <span className="tabular-nums text-gray-200">1:{feeEstimate.minRR.toFixed(2)}</span>
              </div>
            )}

            {side && rrForThisSide != null && (
              <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-200">{side}</span>
                  <span className="text-[10px] text-gray-500 uppercase">{fillMode}</span>
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-gray-400">Eff. R:R</span>
                  <span className={`tabular-nums font-medium ${meetsMin === false ? 'text-red-500' : 'text-gray-200'}`}>
                    1:{rrForThisSide.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {blocked && rrForThisSide != null && feeEstimate && (
              <div className="text-[11px] leading-snug px-2 py-1.5 rounded-lg bg-[#dc2626] text-white">
                <span className="font-medium mr-1">Blocked:</span>
                {side} blocked — Eff. R:R 1:{rrForThisSide.toFixed(2)} ({fillMode}) below 1:{feeEstimate.minRR.toFixed(2)}.
                Widen TP or tighten SL to proceed.
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-[#e8590c] hover:bg-[#c54a08] text-white border-transparent"
            disabled={submitDisabled}
            title={disabledTitle}
            onClick={handleOpen}
          >
            {submitting ? 'Submitting…' : `Open ${side ?? ''}`}
          </Button>
          <Button size="sm" variant="outline" className="border-white/15 text-gray-300 hover:bg-white/10" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioCol({
  title, active, qty, notional, entryFee, slFee, tpFee, priceMove, netGain, rr,
}: {
  title: string; active: boolean;
  qty: number; notional: number; entryFee: number; slFee: number;
  tpFee: number | null; priceMove: number; netGain: number | null; rr: number | null;
}) {
  // The likely (chosen) fill is a solid orange card with white text; the other
  // is a plain white card (dashboard balance-card style).
  const cls = active ? 'bg-[#e8590c] border-[#e8590c]' : 'bg-white/[0.03] border-white/10';
  const lbl = active ? 'text-white/75' : 'text-gray-500';
  const val = active ? 'text-white' : 'text-gray-200';
  const R = ({ k, v, vc }: { k: string; v: string; vc?: string }) => (
    <div className="flex justify-between text-[9px]">
      <span className={lbl}>{k}</span>
      <span className={`tabular-nums ${vc || val}`}>{v}</span>
    </div>
  );
  return (
    <div className={`p-2.5 rounded-xl border ${cls}`}>
      <div className={`text-[10px] font-medium mb-1 ${active ? 'text-white' : 'text-gray-300'}`}>{title}</div>
      <R k="Qty" v={qty.toFixed(4)} />
      <R k="Notional" v={fmtUsd(notional)} />
      <R k="Entry fee" v={fmtFee(entryFee)} />
      <R k="SL exit fee" v={fmtFee(slFee)} />
      {tpFee != null && <R k="TP exit fee" v={fmtFee(tpFee)} />}
      <div className={`border-t mt-0.5 pt-0.5 ${active ? 'border-white/25' : 'border-white/10'}`}>
        <R k="Price-move loss" v={fmtUsd(priceMove)} />
      </div>
      {netGain != null && <R k="Net gain @ TP" v={fmtUsd(netGain)} vc={active ? 'text-white' : 'text-[#e8590c]'} />}
    </div>
  );
}
