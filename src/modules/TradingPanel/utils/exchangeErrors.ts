/**
 * Per-exchange error translators.
 *
 * Each exchange returns errors in its own dialect (Bybit `retMsg`, Binance
 * `code -1007 / Send status unknown`, MEXC `signature error`, etc.). The
 * trading panel hands us a raw error message + the user's active exchange,
 * and we return a string that's useful to a non-technical user.
 *
 * Add a new exchange by writing a small translator and wiring it into the
 * dispatcher at the bottom. Each translator should:
 *   - return a friendly string if it recognises the message,
 *   - return null otherwise so the dispatcher can fall back to a generic format.
 */

export type ErrorAction = 'order' | 'leverage';

const lc = (s: string) => (s || '').toLowerCase();

// ── Bybit ─────────────────────────────────────────────────────────────────────
function translateBybit(raw: string, action: ErrorAction): string | null {
  const lower = lc(raw);
  if (lower.includes('pm mode') || lower.includes('portfolio margin')) {
    return action === 'leverage'
      ? 'Your Bybit account is in Portfolio Margin mode — leverage is managed automatically by Bybit. Switch to Cross or Isolated Margin in Bybit to control leverage manually.'
      : 'Your Bybit account is in Portfolio Margin mode. This order setup may not be supported. Switch to Cross or Isolated Margin in Bybit and try again.';
  }
  if (lower.includes('insufficient') && (lower.includes('balance') || lower.includes('margin'))) {
    return 'Insufficient balance or margin on Bybit. Reduce size, top up USDT, or lower leverage.';
  }
  if (lower.includes('leverage not modified')) return 'Leverage is already set to this value on Bybit.';
  if (lower.includes('position mode') || lower.includes('position idx')) {
    return 'Position mode mismatch on Bybit (hedge vs one-way). Switch to One-Way mode in Bybit and retry.';
  }
  if (lower.includes('qty') || lower.includes('quantity') || lower.includes('lot size')) {
    return `Bybit: order quantity invalid for this symbol. ${raw}`;
  }
  if (lower.includes('price') && (lower.includes('tick') || lower.includes('deviate') || lower.includes('out of range'))) {
    return `Bybit: order price invalid. ${raw}`;
  }
  if (lower.includes('risk limit')) return `Bybit risk limit hit: ${raw}. Reduce size or adjust risk limit in Bybit.`;
  if (lower.includes('api key') || lower.includes('permission denied') || lower.includes('invalid signature')) {
    return `Bybit API credentials problem: ${raw}. Re-connect with Contract Trading permission enabled.`;
  }
  return null;
}

// ── Binance USDT-M Futures (fapi / demo-fapi) ─────────────────────────────────
function translateBinance(raw: string, action: ErrorAction): string | null {
  const lower = lc(raw);
  // -1007: request received but Binance couldn't reply in time. Order may
  // or may not have actually executed — must verify before retry.
  if (lower.includes('send status unknown') || lower.includes('execution status unknown')) {
    return action === 'leverage'
      ? 'Binance timed out setting leverage. It may have applied — refresh and check before retrying.'
      : 'Binance timed out. The order MAY have executed — REFRESH and check positions before retrying so you do not place it twice.';
  }
  if (lower.includes('timestamp for this request')) {
    return 'Clock skew between this server and Binance. Restart the backend, or wait a minute and retry.';
  }
  // -4120 / -4411 — covers both the TradFi-Perps agreement gate AND a few
  // demo-only restrictions on closePosition triggers.
  if (lower.includes('tradfi') || lower.includes('please sign')) {
    return 'Binance: this symbol (XAU/XAG/TSLA/NVDA/etc.) requires accepting the TradFi-Perps agreement on the Binance UI before trading via API. Open the Binance Futures page for the symbol, accept the disclaimer, then retry.';
  }
  if (lower.includes('insufficient') && (lower.includes('margin') || lower.includes('balance'))) {
    return 'Insufficient margin in your Binance Futures wallet. Fund the futures wallet (not spot) or reduce size/leverage.';
  }
  if (lower.includes('-2014') || lower.includes('-2015') || lower.includes('api-key')) {
    return 'Binance rejected the API key. Make sure: (a) it has Futures trading enabled, (b) it was generated on the SAME environment you connected (demo-fapi keys ≠ testnet keys ≠ production keys).';
  }
  if (lower.includes('max notional') || lower.includes('-2027')) {
    return 'Binance: position would exceed the max notional cap for your account tier. Reduce size or leverage.';
  }
  if (lower.includes('price') && (lower.includes('filter') || lower.includes('tick'))) {
    return `Binance: order price out of allowed range. ${raw}`;
  }
  return null;
}

// ── MEXC Contract (USDT-M perpetual) ──────────────────────────────────────────
function translateMexc(raw: string, action: ErrorAction): string | null {
  const lower = lc(raw);
  if (lower.includes('contract not exist') || lower.includes('symbol not exist')) {
    return 'MEXC does not list this symbol as a perpetual contract. Pick another symbol from the selector.';
  }
  if (lower.includes('not open') || lower.includes('contract not open')) {
    return 'MEXC contract trading is not enabled on this account in your region. MEXC restricts futures in some jurisdictions.';
  }
  // MEXC contract requires a SEPARATE key from spot. Spot keys 401 on
  // /api/v1/private/*. Surface that distinction explicitly.
  if (lower.includes('signature error') || lower.includes('invalid signature')) {
    return 'MEXC rejected the request signature. Most common cause: you connected a SPOT API key. Generate a key at https://contract.mexc.com/account/api and reconnect.';
  }
  if (lower.includes('permission denied') || lower.includes('access denied')) {
    return 'MEXC: the API key lacks the required contract permissions. Regenerate with futures-read + futures-trade enabled.';
  }
  if (lower.includes('insufficient')) {
    return action === 'leverage'
      ? 'MEXC rejected the leverage change. Possible: an existing position uses this symbol with isolated margin — close it first.'
      : 'MEXC: insufficient margin in your USDT-M wallet. Transfer USDT from spot/funding into futures.';
  }
  if (lower.includes('position size') || lower.includes('min vol') || lower.includes('vol unit')) {
    return `MEXC: order quantity invalid for this contract. ${raw}`;
  }
  if (lower.includes('price unit') || lower.includes('tick')) {
    return `MEXC: order price not aligned to the contract's price step. ${raw}`;
  }
  return null;
}

// ── OKX / Bitget — placeholders, no specific cases yet ────────────────────────
function translateOkx(_raw: string, _action: ErrorAction): string | null { return null; }
function translateBitget(_raw: string, _action: ErrorAction): string | null { return null; }

// ── Dispatcher ────────────────────────────────────────────────────────────────
const translators: Record<string, (raw: string, action: ErrorAction) => string | null> = {
  bybit: translateBybit,
  binance: translateBinance,
  mexc: translateMexc,
  okx: translateOkx,
  bitget: translateBitget,
};

const EXCHANGE_LABELS: Record<string, string> = {
  bybit: 'Bybit', binance: 'Binance', mexc: 'MEXC', okx: 'OKX', bitget: 'Bitget',
};

export function translateExchangeError(
  exchange: string,
  err: any,
  action: ErrorAction
): string {
  const raw = (err?.message || '').trim();
  const venue = (exchange || '').toLowerCase();
  const label = EXCHANGE_LABELS[venue] || (venue ? venue.toUpperCase() : 'Exchange');

  const fn = translators[venue];
  if (fn) {
    const hit = fn(raw, action);
    if (hit) return hit;
  }
  // Generic fallback — includes the venue name so users know where the
  // failure originated, and the raw message so we don't hide useful detail.
  if (raw) {
    return action === 'leverage'
      ? `${label}: failed to set leverage — ${raw}`
      : `${label}: order failed — ${raw}`;
  }
  return action === 'leverage' ? `${label}: failed to set leverage` : `${label}: failed to place order`;
}
