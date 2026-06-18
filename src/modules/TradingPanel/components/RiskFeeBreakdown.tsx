// The full "Risk & Fee Estimate" breakdown, shared by the PlaceOrder side
// panel and the chart's Open Long / Open Short modal so both render identical
// content (both directions' Eff. R:R, fee-share banner, blocked banner) —
// single source of truth.
//
//   • Default (side panel): a vertical fragment, exactly as before. The parent
//     supplies `space-y-2`, so the output is byte-for-byte unchanged.
//   • twoColumn (modal): the same blocks split into two columns — sizing on
//     the left, verdicts on the right — so the whole thing fits the viewport
//     without a scrollbar. The right column stretches to the row height so it
//     reads as a full-height column rather than a short ragged one.

import React from 'react';
import { AlertBanner } from '@/components/common';
import { fmtUsd, fmtFee, type FeeEstimate } from '@/lib/feeEstimate';

export default function RiskFeeBreakdown({ fe, twoColumn = false }: { fe: FeeEstimate; twoColumn?: boolean }) {
  const riskRow = (
    <div className="flex justify-between items-baseline">
      <span className="text-gray-400 font-medium">Total USD risk (fees included)</span>
      <span className="tabular-nums font-medium text-[#e8590c]">{fmtUsd(fe.riskUsd)}</span>
    </div>
  );

  const hint = fe.makerHint ? (
    <div className="text-[9px] leading-snug px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-gray-300">
      <span className="font-medium mr-1 text-[#facc15]">
        {fe.likelyTaker ? 'Likely Taker:' : 'Likely Maker:'}
      </span>
      {fe.makerHint}
    </div>
  ) : null;

  // Two scenario blocks — the likely (chosen) one is solid orange.
  const scenarios = (
    <div className="grid grid-cols-2 gap-2 pt-1.5">
      {[
        { title: 'If Maker entry', active: !fe.likelyTaker, qty: fe.qtyMaker, notional: fe.notionalMaker, entryFee: fe.entryFeeMaker, slFee: fe.slExitFeeMaker, tpFee: fe.tpExitFeeMaker, priceMove: fe.priceMoveLossMaker, netGain: fe.netGainMaker },
        { title: 'If Taker entry', active: fe.likelyTaker, qty: fe.qtyTaker, notional: fe.notionalTaker, entryFee: fe.entryFeeTaker, slFee: fe.slExitFeeTaker, tpFee: fe.tpExitFeeTaker, priceMove: fe.priceMoveLossTaker, netGain: fe.netGainTaker },
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
  );

  // Per-direction R:R verdict (Long & Short may differ when entry is away from
  // live — passive for one side, aggressive for the other).
  const perDirectionRR = fe.minRR > 0 && (fe.rrForLong != null || fe.rrForShort != null) ? (
    <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/10 text-[10px]">
      {fe.rrForLong != null && (
        <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between">
            <span className="text-gray-200 font-medium">Long</span>
            <span className="text-[10px] text-gray-500 uppercase">{fe.longFillMode}</span>
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-gray-400">Eff. R:R</span>
            <span className={`tabular-nums font-medium ${fe.longRRMeetsMin === false ? 'text-red-500' : 'text-gray-200'}`}>
              1:{fe.rrForLong.toFixed(2)}
            </span>
          </div>
        </div>
      )}
      {fe.rrForShort != null && (
        <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between">
            <span className="text-gray-200 font-medium">Short</span>
            <span className="text-[10px] text-gray-500 uppercase">{fe.shortFillMode}</span>
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-gray-400">Eff. R:R</span>
            <span className={`tabular-nums font-medium ${fe.shortRRMeetsMin === false ? 'text-red-500' : 'text-gray-200'}`}>
              1:{fe.rrForShort.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const profileMin = fe.minRR > 0 ? (
    <div className="flex justify-between text-[10px] pt-1 border-t border-white/10">
      <span className="text-gray-400">Profile min R:R</span>
      <span className="tabular-nums text-gray-200">1:{fe.minRR.toFixed(2)}</span>
    </div>
  ) : null;

  // Fee share of risk — how much of the staked risk is eaten by fees vs. real
  // price movement. Tight SL → fees dominate.
  const feeBanner = (() => {
    const feeShare = Math.max(fe.feeReserveMaker, fe.feeReserveTaker) / fe.riskUsd * 100;
    const pct = feeShare.toFixed(0);
    if (feeShare >= 50) {
      return (
        <AlertBanner variant="warning">
          <span className="font-medium mr-1">SL too tight:</span>
          Fees ≈ <span className="font-medium">{pct}%</span> of your ${fe.riskUsd.toFixed(2)} risk — a stop-out is mostly just fees. Widen the SL distance.
        </AlertBanner>
      );
    }
    if (feeShare >= 30) {
      return (
        <AlertBanner variant="caution">
          <span className="font-medium mr-1">Heavy fees:</span>
          Fees ≈ <span className="font-medium">{pct}%</span> of your ${fe.riskUsd.toFixed(2)} risk. The price-move portion of your stop is small.
        </AlertBanner>
      );
    }
    return (
      <AlertBanner variant="info">
        <span className="font-medium mr-1 text-gray-900">Lean fees:</span>
        Only <span className="font-medium">{pct}%</span> of your ${fe.riskUsd.toFixed(2)} risk goes to fees — most of it is real price-move room.
      </AlertBanner>
    );
  })();

  const blockedBanner = (fe.longRRMeetsMin === false || fe.shortRRMeetsMin === false) ? (
    <AlertBanner variant="warning">
      <span className="font-medium mr-1">Blocked:</span>
      {fe.longRRMeetsMin === false && fe.shortRRMeetsMin === false
        ? `Both directions are below your profile minimum of 1:${fe.minRR.toFixed(2)} after fees.`
        : fe.longRRMeetsMin === false
          ? `Long is blocked — Eff. R:R 1:${fe.rrForLong!.toFixed(2)} (${fe.longFillMode}) below 1:${fe.minRR.toFixed(2)}.`
          : `Short is blocked — Eff. R:R 1:${fe.rrForShort!.toFixed(2)} (${fe.shortFillMode}) below 1:${fe.minRR.toFixed(2)}.`}
      {' '}Widen TP or tighten SL to proceed.
    </AlertBanner>
  ) : null;

  // Modal: two columns so it fits without a scrollbar. Sizing on the left,
  // verdicts on the right; the right column stretches and distributes so it
  // reads as a full-height column.
  if (twoColumn) {
    return (
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 items-stretch">
        <div className="space-y-2">
          {riskRow}
          {hint}
          {scenarios}
        </div>
        <div className="flex flex-col gap-2 sm:justify-between">
          {perDirectionRR}
          {profileMin}
          {feeBanner}
          {blockedBanner}
        </div>
      </div>
    );
  }

  // Side panel: unchanged single-column fragment (parent provides space-y-2).
  return (
    <>
      {riskRow}
      {hint}
      {scenarios}
      {perDirectionRR}
      {profileMin}
      {feeBanner}
      {blockedBanner}
    </>
  );
}
