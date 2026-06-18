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
import { X } from 'lucide-react';
import { computeFeeEstimate } from '@/lib/feeEstimate';
import RiskFeeBreakdown from '@/modules/TradingPanel/components/RiskFeeBreakdown';

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
      <DialogContent className="w-[95vw] max-w-md sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0a0a0a] border-white/[0.07] rounded-2xl [&>button]:hidden">
        <DialogHeader>
          {/* Custom close — the default dialog ✕ is hidden ([&>button]:hidden
              on DialogContent). Rounded white button, positioned clear of the
              fee text (which gets pr-10 below) so the two never overlap. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white text-black flex items-center justify-center shadow hover:bg-white/90 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <DialogTitle className="flex items-center justify-between gap-2 pr-10 text-sm font-medium text-gray-200">
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
          // Exact same breakdown as the side panel — but flowed into two
          // columns on sm+ (the modal widens to max-w-2xl) so the whole thing
          // fits the viewport without a scrollbar. `break-inside-avoid` keeps
          // each block (scenario cards, banners) intact across the column gap;
          // `mb-2` replaces the single-column `space-y-2`. Mobile stays 1-col.
          <div className="text-xs">
            <RiskFeeBreakdown fe={feeEstimate} twoColumn />
          </div>
        )}

        <div className="pt-2">
          {/* No Cancel button — the rounded ✕ in the header closes the modal. */}
          <Button
            size="sm"
            className="w-full bg-[#e8590c] hover:bg-[#c54a08] text-white border-transparent"
            disabled={submitDisabled}
            title={disabledTitle}
            onClick={handleOpen}
          >
            {submitting ? 'Submitting…' : `Open ${side ?? ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
