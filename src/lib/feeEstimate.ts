// Shared fee + R:R math used by the PlaceOrder side panel AND the chart's
// Buy/Sell modal. Extracted verbatim from PlaceOrder.tsx so both surfaces
// reach an identical verdict (qty, fee reserve, R:R gates, fill-mode
// classification, blocked state). Do not duplicate this math anywhere else.

// Bybit linear perpetuals: Maker 0.02%, Taker 0.055%. Same fallback the
// original inline copy used.
const MAKER = 0.0002;
const TAKER = 0.00055;

// Backend FILL_TYPE_TOLERANCE_PCT — kept in sync with `classifyFillType`.
const TOL_PCT = 0.0002;

export interface FeeEstimateInputs {
  orderPrice: string;
  takeProfit: string;
  stopLoss: string;
  tickerPrice: string | null;
  accountBalance: string;
  adjustedRisk: number;
  activeProfile: any;
}

export interface FeeEstimate {
  riskUsd: number;
  qtyMaker: number; qtyTaker: number;
  notionalMaker: number; notionalTaker: number;
  entryFeeMaker: number; entryFeeTaker: number;
  slExitFeeMaker: number; slExitFeeTaker: number;
  tpExitFeeMaker: number | null; tpExitFeeTaker: number | null;
  feeReserveMaker: number; feeReserveTaker: number;
  priceMoveLossMaker: number; priceMoveLossTaker: number;
  grossGainMaker: number | null; grossGainTaker: number | null;
  netGainMaker: number | null; netGainTaker: number | null;
  rrMaker: number | null; rrTaker: number | null;
  likelyTaker: boolean;
  makerHint: string | null;
  minRR: number;
  longFillMode: 'maker' | 'taker';
  shortFillMode: 'maker' | 'taker';
  rrForLong: number | null;
  rrForShort: number | null;
  longRRMeetsMin: boolean | null;
  shortRRMeetsMin: boolean | null;
}

export function computeFeeEstimate({
  orderPrice, takeProfit, stopLoss, tickerPrice, accountBalance,
  adjustedRisk, activeProfile,
}: FeeEstimateInputs): FeeEstimate | null {
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
  const qtyFor = (feeEntry: number) => {
    const denom = distance + entry * feeEntry + sl * TAKER;
    return denom > 0 ? riskUsd / denom : 0;
  };
  const qtyMaker = qtyFor(MAKER);
  const qtyTaker = qtyFor(TAKER);
  const notionalMaker = qtyMaker * entry;
  const notionalTaker = qtyTaker * entry;
  const entryFeeMaker = notionalMaker * MAKER;
  const entryFeeTaker = notionalTaker * TAKER;
  const slExitFeeMaker = qtyMaker * sl * TAKER;
  const slExitFeeTaker = qtyTaker * sl * TAKER;
  const tpExitFeeMaker = Number.isFinite(tp) && tp > 0 ? qtyMaker * tp * TAKER : null;
  const tpExitFeeTaker = Number.isFinite(tp) && tp > 0 ? qtyTaker * tp * TAKER : null;
  const feeReserveMaker = entryFeeMaker + slExitFeeMaker;
  const feeReserveTaker = entryFeeTaker + slExitFeeTaker;
  const priceMoveLossMaker = riskUsd - feeReserveMaker;
  const priceMoveLossTaker = riskUsd - feeReserveTaker;
  const grossGainMaker = Number.isFinite(tp) && tp > 0 ? Math.abs(tp - entry) * qtyMaker : null;
  const grossGainTaker = Number.isFinite(tp) && tp > 0 ? Math.abs(tp - entry) * qtyTaker : null;
  const netGainMaker = grossGainMaker != null && tpExitFeeMaker != null
    ? grossGainMaker - entryFeeMaker - tpExitFeeMaker : null;
  const netGainTaker = grossGainTaker != null && tpExitFeeTaker != null
    ? grossGainTaker - entryFeeTaker - tpExitFeeTaker : null;
  const rrMaker = netGainMaker != null ? netGainMaker / riskUsd : null;
  const rrTaker = netGainTaker != null ? netGainTaker / riskUsd : null;

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
      likelyTaker = false;
      const suggestBuyMaker = (live * 0.999).toFixed(2);
      const suggestSellMaker = (live * 1.001).toFixed(2);
      makerHint = `Entry sits ${proximityPct.toFixed(2)}% off live. For a Maker fill: Long → set price ≤ ${suggestBuyMaker}, Short → set price ≥ ${suggestSellMaker}.`;
    }
  }
  const minRR = Number(activeProfile?.minRiskRewardRatio) || 0;

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
}

// Effective (fee-inclusive) reward:risk for a given entry / SL / TP. This is
// the SAME ratio computeFeeEstimate returns (rrForLong / rrForShort), but
// derived purely from the price levels so it can be applied to historical /
// pending trades where the balance + live-price context isn't available.
// Position size cancels out of the ratio entirely, so only the prices + fee
// rates matter:
//     effRR = (|TP−E| − E·fee − TP·fee) / (|E−SL| + E·fee + SL·fee)
// Exits always trigger as market (Taker); entry is treated as Taker too — the
// conservative, most-common case for app-placed orders — so the figure never
// overstates R:R. Returns null if inputs are unusable. The result can be
// negative when fees alone exceed the take-profit move (a setup that loses
// even when TP hits), which is itself useful signal.
export function effectiveRR(entry: number, sl: number, tp: number): number | null {
  if (![entry, sl, tp].every((n) => Number.isFinite(n) && n > 0)) return null;
  const reward = Math.abs(tp - entry) - entry * TAKER - tp * TAKER;
  const risk = Math.abs(entry - sl) + entry * TAKER + sl * TAKER;
  if (risk <= 0) return null;
  return reward / risk;
}

export const fmtUsd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtFee = (n: number) => `$${n.toFixed(2)}`;
