// Place Order — horizontal card below the chart+risk grid (new layout).
//
// Pure presentation. Every interactive element calls back into the same
// handlers the side panel's PlaceOrder used to call:
//   - Leverage slider writes to `setLeverage(n)` on the page.
//   - Apply Leverage calls `onApplyLeverage`, same handler as before.
//   - Order Price / TP / SL inputs write to the SAME state vars that the
//     Risk & Fee Estimate panel (PlaceOrder variant='card-only') reads.
//   - Open Long / Open Short call `onPlaceOrder(side)` — same handler.
//
// SL position implies direction: only the matching button is rendered,
// matching the existing UX guard. R:R block disables the surviving button
// with a hover-title explaining why (no second blocking path).

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { computeFeeEstimate } from '@/lib/feeEstimate';

interface Props {
  leverage: number;
  setLeverage: (n: number) => void;
  maxLeverage: number;
  onApplyLeverage: () => void;
  orderPrice: string;
  setOrderPrice: (v: string) => void;
  takeProfit: string;
  setTakeProfit: (v: string) => void;
  stopLoss: string;
  setStopLoss: (v: string) => void;
  tickerPrice: string | null;
  accountBalance: string;
  adjustedRisk: number;
  activeProfile: any;
  isTradingAllowed: boolean;
  getDisabledReason: string;
  loading: boolean;
  onPlaceOrder: (side: 'Long' | 'Short') => void;
}

export default function PlaceOrderBar({
  leverage, setLeverage, maxLeverage, onApplyLeverage,
  orderPrice, setOrderPrice, takeProfit, setTakeProfit, stopLoss, setStopLoss,
  tickerPrice, accountBalance, adjustedRisk, activeProfile,
  isTradingAllowed, getDisabledReason, loading,
  onPlaceOrder,
}: Props) {
  // Reuse the same fee-math used by the side panel so the directional
  // R:R-block verdict here matches the Risk & Fee Estimate card exactly.
  const fe = computeFeeEstimate({
    orderPrice, takeProfit, stopLoss, tickerPrice, accountBalance,
    adjustedRisk, activeProfile,
  });
  const longBlocked = fe?.longRRMeetsMin === false;
  const shortBlocked = fe?.shortRRMeetsMin === false;
  const baseDisabled = !isTradingAllowed || loading;

  // SL placement implies side: SL below entry = Long, SL above = Short.
  const entryNum = parseFloat(orderPrice) || (tickerPrice ? parseFloat(tickerPrice) : NaN);
  const slNum = parseFloat(stopLoss);
  let impliedSide: 'Long' | 'Short' | null = null;
  if (Number.isFinite(entryNum) && Number.isFinite(slNum) && entryNum > 0 && slNum > 0) {
    if (slNum < entryNum) impliedSide = 'Long';
    else if (slNum > entryNum) impliedSide = 'Short';
  }
  const longDisabled = baseDisabled || longBlocked;
  const shortDisabled = baseDisabled || shortBlocked;
  const longTitle = !isTradingAllowed
    ? getDisabledReason
    : longBlocked
      ? `Long blocked: Eff. R:R 1:${fe!.rrForLong!.toFixed(2)} (${fe!.longFillMode}) < profile min 1:${fe!.minRR.toFixed(2)}.`
      : '';
  const shortTitle = !isTradingAllowed
    ? getDisabledReason
    : shortBlocked
      ? `Short blocked: Eff. R:R 1:${fe!.rrForShort!.toFixed(2)} (${fe!.shortFillMode}) < profile min 1:${fe!.minRR.toFixed(2)}.`
      : '';

  // Same fixed width on both action buttons so they read as a matched
  // pair regardless of label length ("Apply Leverage" vs "Open Long" /
  // "Open Short" / "Place Order").
  const ACTION_BTN = 'h-9 w-[150px] shrink-0 text-[12px] font-bold tracking-tight';

  return (
    <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 lg:h-full lg:overflow-y-auto">
      <CardContent className="px-4 py-3 space-y-3">
        {/* Leverage row */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Leverage</span>
          <div className="flex-1 min-w-[180px]">
            <Slider
              min={1} max={maxLeverage} step={1}
              value={[leverage]} onValueChange={([val]) => setLeverage(val)}
              disabled={!isTradingAllowed}
            />
            <div className="flex justify-between mt-0.5 text-[9px] font-medium text-muted-foreground/70 tabular-nums">
              <span>1x</span>
              <span>{Math.floor(maxLeverage * 0.25)}x</span>
              <span>{Math.floor(maxLeverage * 0.5)}x</span>
              <span>{Math.floor(maxLeverage * 0.75)}x</span>
              <span>{maxLeverage}x</span>
            </div>
          </div>
          <div className="px-2 py-0.5 rounded border border-green-500/30 bg-green-500/15 text-green-400 font-bold text-xs tabular-nums min-w-[48px] text-center">
            {leverage}x
          </div>
          <Button
            onClick={onApplyLeverage}
            disabled={!isTradingAllowed || loading}
            title={!isTradingAllowed ? getDisabledReason : ''}
            className={`${ACTION_BTN} bg-gradient-to-r from-green-400 to-green-500 text-black hover:opacity-90`}
          >
            Apply Leverage
          </Button>
        </div>

        {/* Price-fields row + Open button — always a single horizontal row
            regardless of viewport width, matching the design's
            grid-template-columns: 1fr 1fr 1fr auto. Inline style is used
            because Tailwind's arbitrary-value grid-cols-[…_…] occasionally
            fails to emit under PostCSS purge; inline guarantees it. */}
        <div
          className="grid gap-3 items-stretch w-full"
          style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}
        >
          <div className="flex items-center gap-2 min-w-0 h-9 px-2.5 rounded border border-white/10 bg-[#0A0A0A] focus-within:border-white/30">
            <span className="text-[11px] font-medium text-muted-foreground/80 whitespace-nowrap shrink-0">Order Price</span>
            <Input
              type="number"
              value={orderPrice}
              onChange={(e) => setOrderPrice(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : tickerPrice ? parseFloat(tickerPrice).toFixed(2) : '0.00'}
              disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : 'Leave blank to submit at the current live price'}
              className="flex-1 min-w-0 h-auto border-0 bg-transparent text-right font-mono text-[13px] font-bold tabular-nums shadow-none focus-visible:ring-0 px-0"
            />
          </div>
          <div className="flex items-center gap-2 min-w-0 h-9 px-2.5 rounded border border-white/10 bg-[#0A0A0A] focus-within:border-green-500/40">
            <span className="text-[11px] font-medium text-muted-foreground/80 whitespace-nowrap shrink-0">Take Profit</span>
            <Input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : '0.00'}
              disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : ''}
              className="flex-1 min-w-0 h-auto border-0 bg-transparent text-right font-mono text-[13px] font-bold tabular-nums shadow-none focus-visible:ring-0 px-0 text-green-400"
            />
          </div>
          <div className="flex items-center gap-2 min-w-0 h-9 px-2.5 rounded border border-white/10 bg-[#0A0A0A] focus-within:border-red-500/40">
            <span className="text-[11px] font-medium text-muted-foreground/80 whitespace-nowrap shrink-0">Stop Loss</span>
            <Input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : '0.00'}
              disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : ''}
              className="flex-1 min-w-0 h-auto border-0 bg-transparent text-right font-mono text-[13px] font-bold tabular-nums shadow-none focus-visible:ring-0 px-0 text-red-400"
            />
          </div>

          {/* Single morphing action button. Until the SL implies a side it
              renders as a neutral, disabled "Place Order"; once entry +
              SL pin a direction it becomes "Open Long" (green) or
              "Open Short" (red) and routes into onPlaceOrder(side). The
              same R:R-block disables the button with a hover-title. */}
          {(() => {
            const ready = impliedSide !== null;
            // Only flag the button as "truly" disabled when trading itself
            // is blocked or the R:R gate caught it. The neutral "Place Order"
            // state (no entry+SL yet) stays visually active — clicking it
            // routes into handlePlaceOrder, which surfaces the missing-field
            // toast so the user gets feedback instead of a dead grey button.
            const trulyDisabled =
              impliedSide === 'Long' ? longDisabled :
              impliedSide === 'Short' ? shortDisabled :
              !isTradingAllowed || loading;
            const sideTitle =
              !ready
                ? 'Set Order Price and Stop Loss to pick a direction (SL below price = Long, above = Short).'
                : impliedSide === 'Long' ? longTitle : shortTitle;
            const label =
              impliedSide === 'Long' ? 'Open Long' :
              impliedSide === 'Short' ? 'Open Short' :
              'Place Order';
            const bg =
              impliedSide === 'Long' ? 'bg-gradient-to-r from-green-500 to-green-600' :
              impliedSide === 'Short' ? 'bg-gradient-to-r from-red-500 to-red-600' :
              'bg-gradient-to-r from-sky-400 to-sky-500';
            return (
              <Button
                onClick={() => {
                  if (impliedSide) onPlaceOrder(impliedSide);
                  // Neutral path: route to Long so handlePlaceOrder's missing
                  // SL / TP gate fires the toast. The order can't actually
                  // place — the SL-required check rejects it immediately.
                  else onPlaceOrder('Long');
                }}
                disabled={trulyDisabled}
                title={sideTitle}
                className={`${ACTION_BTN} ${bg} hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white`}
              >
                {label}
              </Button>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}
