// Initial-load candles from each exchange's public REST. Keeps the chart
// independent of our backend — no new endpoint required.
//
// All adapters normalize into { t, o, h, l, c, v } where t is ms.

import { useEffect, useState } from 'react';
import type { LiveCandle } from './useLivePrice';
import { symbolsApi } from '@/lib/api';

interface UseHistoricalCandlesArgs {
  exchange: string;
  symbol: string;
  interval: string;
  limit?: number;
}

interface UseHistoricalCandlesReturn {
  candles: LiveCandle[];
  loading: boolean;
  error: string | null;
}

async function loadBybit(symbol: string, interval: string, limit: number) {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const r = await fetch(url);
  const j = await r.json();
  const list: any[] = j?.result?.list || [];
  // bybit returns newest-first — reverse to chronological
  return list.slice().reverse().map((row: any[]) => ({
    t: Number(row[0]),
    o: parseFloat(row[1]),
    h: parseFloat(row[2]),
    l: parseFloat(row[3]),
    c: parseFloat(row[4]),
    v: parseFloat(row[5]),
  })) as LiveCandle[];
}

function binanceIntervalParam(i: string) {
  if (/^\d+$/.test(i)) {
    const m = parseInt(i, 10);
    if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
    return `${m}m`;
  }
  return i.toLowerCase();
}
async function loadBinance(symbol: string, interval: string, limit: number) {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${binanceIntervalParam(interval)}&limit=${limit}`;
  const r = await fetch(url);
  const list: any[] = await r.json();
  return list.map((row: any[]) => ({
    t: Number(row[0]),
    o: parseFloat(row[1]),
    h: parseFloat(row[2]),
    l: parseFloat(row[3]),
    c: parseFloat(row[4]),
    v: parseFloat(row[5]),
  })) as LiveCandle[];
}

function okxInstId(s: string) {
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}-USDT-SWAP`;
  if (s.endsWith('USDC')) return `${s.slice(0, -4)}-USDC-SWAP`;
  return `${s}-SWAP`;
}
function okxBar(i: string) {
  if (/^\d+$/.test(i)) {
    const m = parseInt(i, 10);
    if (m >= 60 && m % 60 === 0) return `${m / 60}H`;
    return `${m}m`;
  }
  return i.toUpperCase();
}
async function loadOkx(symbol: string, interval: string, limit: number) {
  // OKX /market/candles caps at 300 per request — silently clamp.
  const cap = Math.min(limit, 300);
  const url = `https://www.okx.com/api/v5/market/candles?instId=${okxInstId(symbol)}&bar=${okxBar(interval)}&limit=${cap}`;
  const r = await fetch(url);
  const j = await r.json();
  const list: any[] = j?.data || [];
  return list.slice().reverse().map((row: any[]) => ({
    t: Number(row[0]),
    o: parseFloat(row[1]),
    h: parseFloat(row[2]),
    l: parseFloat(row[3]),
    c: parseFloat(row[4]),
    v: parseFloat(row[5]),
  })) as LiveCandle[];
}

function bitgetGranularity(i: string) {
  if (/^\d+$/.test(i)) {
    const m = parseInt(i, 10);
    if (m >= 60 && m % 60 === 0) return `${m / 60}H`;
    return `${m}m`;
  }
  return i.toUpperCase();
}
async function loadBitget(symbol: string, interval: string, limit: number) {
  const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES&granularity=${bitgetGranularity(interval)}&limit=${limit}`;
  const r = await fetch(url);
  const j = await r.json();
  const list: any[] = j?.data || [];
  return list.map((row: any[]) => ({
    t: Number(row[0]),
    o: parseFloat(row[1]),
    h: parseFloat(row[2]),
    l: parseFloat(row[3]),
    c: parseFloat(row[4]),
    v: parseFloat(row[5]),
  })) as LiveCandle[];
}

function mexcSymbol(s: string) {
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}_USDT`;
  if (s.endsWith('USDC')) return `${s.slice(0, -4)}_USDC`;
  return s;
}
function mexcInterval(i: string) {
  // Keep aligned with the WS hook's mexcInterval — MEXC contract REST
  // and WS both expect Min1..Min60 / Hour4 / Hour8 / Day1 / Week1 / Month1.
  if (i === 'D' || i === 'd' || i === '1D') return 'Day1';
  if (i === 'W' || i === '1W') return 'Week1';
  if (i === 'M' || i === '1M') return 'Month1';
  if (/^\d+$/.test(i)) {
    const m = parseInt(i, 10);
    if (m === 240) return 'Hour4';
    if (m === 480) return 'Hour8';
    if (m === 1440) return 'Day1';
    return `Min${m}`;
  }
  return i;
}
async function loadMexc(symbol: string, interval: string, limit: number): Promise<LiveCandle[]> {
  // MEXC contract REST does NOT send CORS headers, so a direct fetch from
  // the browser fails with "Failed to fetch". Route through our backend
  // proxy (`GET /api/symbols/klines/:symbol?interval=...&limit=...`) —
  // server-side, same MEXC endpoint, returns normalized candles.
  // No fallback to direct fetch — the backend proxy is the supported path.
  const ivl = mexcInterval(interval);
  const r = await symbolsApi.getKlines(symbol, ivl, limit);
  const candles = (r?.candles || []) as Array<Partial<LiveCandle>>;
  return candles
    .map((c) => ({
      t: Number(c.t), o: Number(c.o), h: Number(c.h),
      l: Number(c.l), c: Number(c.c), v: Number(c.v ?? 0),
    }))
    .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c)) as LiveCandle[];
}

const LOADERS: Record<string, (s: string, i: string, n: number) => Promise<LiveCandle[]>> = {
  bybit: loadBybit,
  binance: loadBinance,
  okx: loadOkx,
  bitget: loadBitget,
  mexc: loadMexc,
};

export function useHistoricalCandles({
  // 500 is comfortably within every exchange's single-request cap
  // (Bybit 1000, Binance 1500, OKX 300/wider via /history-candles, Bitget
  // 1000, MEXC 2000) and gives users meaningful scroll-back room.
  exchange, symbol, interval, limit = 500,
}: UseHistoricalCandlesArgs): UseHistoricalCandlesReturn {
  const [candles, setCandles] = useState<LiveCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = LOADERS[exchange];
    if (!loader) {
      setCandles([]);
      setError(`No candle adapter for ${exchange}`);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    loader(symbol, interval, limit)
      .then((arr) => {
        if (cancelled) return;
        setCandles(arr.filter((c) => Number.isFinite(c.c) && Number.isFinite(c.t)));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'Failed to load candles');
        setCandles([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [exchange, symbol, interval, limit]);

  return { candles, loading, error };
}
