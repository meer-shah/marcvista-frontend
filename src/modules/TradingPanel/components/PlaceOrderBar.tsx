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
  const ACTION_BTN = 'h-9 w-full sm:w-[150px] shrink-0 text-[12px] font-bold tracking-tight';

  return (
    <Card className="bg-[#e8590c] border-[#e8590c] shrink-0">
      <CardContent className="px-4 py-3 space-y-3">
        {/* Leverage row */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-white whitespace-nowrap">Leverage</span>
          <div className="flex-1 w-full sm:min-w-[180px]">
            <Slider
              min={1} max={maxLeverage} step={1}
              value={[leverage]} onValueChange={([val]) => setLeverage(val)}
              disabled={!isTradingAllowed}
              className="[&>span:first-child]:h-1 [&>span:first-child]:bg-white/25 [&>span:first-child>span]:bg-white [&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:bg-white [&_[role=slider]]:border-white"
            />
            <div className="flex justify-between mt-0.5 text-[9px] font-medium text-white/70 tabular-nums">
              <span>1x</span>
              <span>{Math.floor(maxLeverage * 0.25)}x</span>
              <span>{Math.floor(maxLeverage * 0.5)}x</span>
              <span>{Math.floor(maxLeverage * 0.75)}x</span>
              <span>{maxLeverage}x</span>
            </div>
          </div>
          <div className="px-2 py-0.5 rounded border border-white/40 bg-white/20 text-white font-bold text-xs tabular-nums min-w-[48px] text-center">
            {leverage}x
          </div>
          <Button
            onClick={onApplyLeverage}
            disabled={!isTradingAllowed || loading}
            title={!isTradingAllowed ? getDisabledReason : ''}
            className={`${ACTION_BTN} bg-white text-[#e8590c] hover:bg-white/90`}
          >
            Apply Leverage
          </Button>
        </div>

        {/* Price-fields row + Open button. On phones/tablets the three inputs
            and the action button stack full-width (1 column) so nothing gets
            crushed; from lg up they sit in one row (1fr 1fr 1fr auto). */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-stretch w-full">
          <div className="flex items-center gap-2 min-w-0 h-9 px-2.5 rounded border border-black/10 bg-white focus-within:border-[#e8590c]/50">
            <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap shrink-0">Order Price</span>
            <Input
              type="number"
              value={orderPrice}
              onChange={(e) => setOrderPrice(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : tickerPrice ? parseFloat(tickerPrice).toFixed(2) : '0.00'}
              disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : 'Leave blank to submit at the current live price'}
              className="flex-1 min-w-0 h-auto border-0 bg-transparent text-right tabular-nums text-[13px] font-bold tabular-nums shadow-none focus-visible:ring-0 px-0 text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <div className="flex items-center gap-2 min-w-0 h-9 px-2.5 rounded border border-black/10 bg-white focus-within:border-[#16a34a]/50">
            <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap shrink-0">Take Profit</span>
            <Input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : '0.00'}
              disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : ''}
              className="flex-1 min-w-0 h-auto border-0 bg-transparent text-right tabular-nums text-[13px] font-bold tabular-nums shadow-none focus-visible:ring-0 px-0 text-[#16a34a] placeholder:text-gray-400"
            />
          </div>
          <div className="flex items-center gap-2 min-w-0 h-9 px-2.5 rounded border border-black/10 bg-white focus-within:border-[#dc2626]/50">
            <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap shrink-0">Stop Loss</span>
            <Input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder={!isTradingAllowed ? getDisabledReason : '0.00'}
              disabled={!isTradingAllowed}
              title={!isTradingAllowed ? getDisabledReason : ''}
              className="flex-1 min-w-0 h-auto border-0 bg-transparent text-right tabular-nums text-[13px] font-bold tabular-nums shadow-none focus-visible:ring-0 px-0 text-[#dc2626] placeholder:text-gray-400"
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
              'bg-[#0a0a0a]';
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
