// Real-time price + last-candle feed from the active exchange's public WS.
// Public market data — no auth required, so this works whether or not the
// user has connected their API key on the venue.
//
// Coverage: bybit, binance, okx, bitget, mexc (linear / USDT perpetuals).
// Each exchange has a tiny adapter below. Disconnects reconnect with
// exponential backoff (jittered) so a momentary network blip doesn't
// silently freeze the chart.
//
// Outputs:
//   - livePrice           : last trade price (raw exchange string when possible)
//   - lastCandleUpdate    : { t, o, h, l, c, v } for the *currently forming*
//                           bar at the requested interval. Lets the chart
//                           paint the rightmost candle live.
//   - status              : 'connecting' | 'live' | 'reconnecting' | 'closed'

import { useEffect, useRef, useState } from 'react';

export interface LiveCandle {
  t: number; o: number; h: number; l: number; c: number; v: number;
}

export type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'closed';

interface UseLivePriceArgs {
  exchange: string;     // bybit | binance | okx | bitget | mexc
  symbol: string;       // e.g. BTCUSDT
  interval: string;     // chart interval (1, 3, 5, 15, 30, 60, 240, D ...)
  enabled?: boolean;    // pause WS when chart hidden / TradingView mode
}

interface UseLivePriceReturn {
  livePrice: string | null;
  lastCandleUpdate: LiveCandle | null;
  status: ConnStatus;
}

// --- per-exchange adapters --------------------------------------------------

type ExchangeAdapter = {
  url: (symbol: string, interval: string) => string;
  // Single message, or an array of messages to send sequentially on open.
  // MEXC needs separate subs for ticker + kline; Bybit packs both into one.
  subscribeMsg?: (symbol: string, interval: string) => any | any[];
  parse: (raw: any) => { price?: string; candle?: LiveCandle } | null;
  // bitget / okx / mexc need a periodic ping to keep the socket alive
  pingMs?: number;
  pingMsg?: any;
};

// Bybit v5 linear public. Combined sub for ticker + kline in one socket.
const bybit: ExchangeAdapter = {
  url: () => 'wss://stream.bybit.com/v5/public/linear',
  subscribeMsg: (s, i) => ({ op: 'subscribe', args: [`tickers.${s}`, `kline.${bybitInterval(i)}.${s}`] }),
  parse: (msg) => {
    if (!msg || !msg.topic) return null;
    if (msg.topic.startsWith('tickers.')) {
      const p = msg.data?.lastPrice;
      return p ? { price: String(p) } : null;
    }
    if (msg.topic.startsWith('kline.')) {
      const k = Array.isArray(msg.data) ? msg.data[0] : msg.data;
      if (!k) return null;
      return {
        candle: {
          t: Number(k.start), o: parseFloat(k.open), h: parseFloat(k.high),
          l: parseFloat(k.low), c: parseFloat(k.close), v: parseFloat(k.volume),
        },
        price: String(k.close),
      };
    }
    return null;
  },
  pingMs: 20_000,
  pingMsg: { op: 'ping' },
};
function bybitInterval(i: string) {
  // bybit kline.{interval} — interval in minutes or D/W/M
  if (/^\d+$/.test(i)) return i;
  return i.toUpperCase();
}

// Binance combined-stream — ticker + kline subscribed via URL path.
const binance: ExchangeAdapter = {
  url: (s, i) => {
    const sym = s.toLowerCase();
    return `wss://stream.binance.com:9443/stream?streams=${sym}@ticker/${sym}@kline_${binanceInterval(i)}`;
  },
  parse: (msg) => {
    const stream = msg?.stream;
    const data = msg?.data;
    if (!stream || !data) return null;
    if (stream.endsWith('@ticker')) {
      const p = data.c;
      return p ? { price: String(p) } : null;
    }
    if (stream.includes('@kline_')) {
      const k = data.k;
      if (!k) return null;
      return {
        candle: {
          t: Number(k.t), o: parseFloat(k.o), h: parseFloat(k.h),
          l: parseFloat(k.l), c: parseFloat(k.c), v: parseFloat(k.v),
        },
        price: String(k.c),
      };
    }
    return null;
  },
};
function binanceInterval(i: string) {
  if (/^\d+$/.test(i)) {
    const m = parseInt(i, 10);
    if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
    return `${m}m`;
  }
  return i.toLowerCase();
}

// OKX v5 swap. SWAP instruments are "BTC-USDT-SWAP" — derive from "BTCUSDT".
const okx: ExchangeAdapter = {
  url: () => 'wss://ws.okx.com:8443/ws/v5/public',
  subscribeMsg: (s, i) => {
    const inst = okxInstId(s);
    return {
      op: 'subscribe',
      args: [
        { channel: 'tickers', instId: inst },
        { channel: `candle${okxInterval(i)}`, instId: inst },
      ],
    };
  },
  parse: (msg) => {
    if (!msg?.arg || !msg?.data) return null;
    const ch = msg.arg.channel;
    if (ch === 'tickers') {
      const p = msg.data[0]?.last;
      return p ? { price: String(p) } : null;
    }
    if (typeof ch === 'string' && ch.startsWith('candle')) {
      const row = msg.data[0];
      if (!row) return null;
      // [ts, o, h, l, c, vol, ...]
      return {
        candle: {
          t: Number(row[0]), o: parseFloat(row[1]), h: parseFloat(row[2]),
          l: parseFloat(row[3]), c: parseFloat(row[4]), v: parseFloat(row[5]),
        },
        price: String(row[4]),
      };
    }
    return null;
  },
  pingMs: 25_000,
  pingMsg: 'ping',
};
function okxInstId(s: string) {
  // BTCUSDT -> BTC-USDT-SWAP. Cover the common USDT/USDC suffixes.
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}-USDT-SWAP`;
  if (s.endsWith('USDC')) return `${s.slice(0, -4)}-USDC-SWAP`;
  return `${s}-SWAP`;
}
function okxInterval(i: string) {
  if (/^\d+$/.test(i)) {
    const m = parseInt(i, 10);
    if (m >= 60 && m % 60 === 0) return `${m / 60}H`;
    return `${m}m`;
  }
  return i.toUpperCase();
}

// Bitget v2 USDT-M perpetuals.
const bitget: ExchangeAdapter = {
  url: () => 'wss://ws.bitget.com/v2/ws/public',
  subscribeMsg: (s, i) => ({
    op: 'subscribe',
    args: [
      { instType: 'USDT-FUTURES', channel: 'ticker', instId: s },
      { instType: 'USDT-FUTURES', channel: bitgetCandleChannel(i), instId: s },
    ],
  }),
  parse: (msg) => {
    if (!msg?.arg || !msg?.data) return null;
    const ch = msg.arg.channel;
    if (ch === 'ticker') {
      const p = msg.data[0]?.lastPr;
      return p ? { price: String(p) } : null;
    }
    if (typeof ch === 'string' && ch.startsWith('candle')) {
      const row = msg.data[0];
      if (!row) return null;
      return {
        candle: {
          t: Number(row[0]), o: parseFloat(row[1]), h: parseFloat(row[2]),
          l: parseFloat(row[3]), c: parseFloat(row[4]), v: parseFloat(row[5]),
        },
        price: String(row[4]),
      };
    }
    return null;
  },
  pingMs: 25_000,
  pingMsg: 'ping',
};
function bitgetCandleChannel(i: string) {
  if (/^\d+$/.test(i)) {
    const m = parseInt(i, 10);
    if (m >= 60 && m % 60 === 0) return `candle${m / 60}H`;
    return `candle${m}m`;
  }
  return `candle${i.toUpperCase()}`;
}

// MEXC contract WS — different host from spot.
// Needs two separate subscribe messages (ticker + kline) and a distinct
// interval naming scheme. We send both as an array.
const mexc: ExchangeAdapter = {
  url: () => 'wss://contract.mexc.com/edge',
  subscribeMsg: (s, i) => [
    { method: 'sub.ticker', param: { symbol: mexcSymbol(s) } },
    { method: 'sub.kline', param: { symbol: mexcSymbol(s), interval: mexcInterval(i) } },
  ],
  parse: (msg) => {
    if (!msg) return null;
    // MEXC pushes both ticker (push.ticker) and kline (push.kline).
    if (msg.channel === 'push.ticker' && msg.data?.lastPrice) {
      return { price: String(msg.data.lastPrice) };
    }
    if (msg.channel === 'push.kline' && msg.data) {
      const d = msg.data;
      return {
        candle: {
          t: Number(d.t) * 1000, o: parseFloat(d.o), h: parseFloat(d.h),
          l: parseFloat(d.l), c: parseFloat(d.c), v: parseFloat(d.q ?? d.a ?? 0),
        },
        price: String(d.c),
      };
    }
    return null;
  },
  pingMs: 20_000,
  pingMsg: { method: 'ping' },
};
function mexcSymbol(s: string) {
  // BTCUSDT -> BTC_USDT
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}_USDT`;
  if (s.endsWith('USDC')) return `${s.slice(0, -4)}_USDC`;
  return s;
}
function mexcInterval(i: string) {
  // MEXC contract: Min1, Min5, Min15, Min30, Min60, Hour4, Hour8, Day1,
  // Week1, Month1. Note the 'D'/'W'/'M' single-letter aliases the rest of
  // the chart code uses for daily/weekly/monthly need explicit mapping.
  if (i === 'D' || i === 'd' || i === '1D') return 'Day1';
  if (i === 'W' || i === '1W') return 'Week1';
  if (i === 'M' || i === '1M') return 'Month1';
  if (/^\d+$/.test(i)) {
    const m = parseInt(i, 10);
    if (m === 240) return 'Hour4';
    if (m === 480) return 'Hour8';
    if (m === 1440) return 'Day1';
    // Everything else maps to MinN (incl. Min60 — MEXC accepts both Min60 and Hour1)
    return `Min${m}`;
  }
  return i;
}

const ADAPTERS: Record<string, ExchangeAdapter> = {
  bybit, binance, okx, bitget, mexc,
};

// ---------------------------------------------------------------------------

export function useLivePrice({
  exchange, symbol, interval, enabled = true,
}: UseLivePriceArgs): UseLivePriceReturn {
  const [livePrice, setLivePrice] = useState<string | null>(null);
  const [lastCandleUpdate, setLastCandleUpdate] = useState<LiveCandle | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(250);
  const closedByUsRef = useRef(false);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('closed');
      return;
    }
    const adapter = ADAPTERS[exchange];
    if (!adapter) {
      setStatus('closed');
      return;
    }

    closedByUsRef.current = false;
    backoffRef.current = 250;

    let cancelled = false;

    const clearPing = () => {
      if (pingTimerRef.current != null) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      setStatus(wsRef.current ? 'reconnecting' : 'connecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(adapter.url(symbol, interval));
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        backoffRef.current = 250;
        setStatus('live');
        if (adapter.subscribeMsg) {
          try {
            const sub = adapter.subscribeMsg(symbol, interval);
            const msgs = Array.isArray(sub) ? sub : [sub];
            for (const m of msgs) ws.send(JSON.stringify(m));
          } catch { /* ignore */ }
        }
        if (adapter.pingMs && adapter.pingMsg != null) {
          clearPing();
          pingTimerRef.current = window.setInterval(() => {
            try {
              ws.send(typeof adapter.pingMsg === 'string'
                ? adapter.pingMsg
                : JSON.stringify(adapter.pingMsg));
            } catch { /* ignore */ }
          }, adapter.pingMs);
        }
      };

      ws.onmessage = (ev) => {
        if (cancelled) return;
        // MEXC sometimes sends "pong" plain text — skip non-JSON quickly.
        let parsed: any = null;
        try { parsed = JSON.parse(ev.data); } catch { return; }
        const out = adapter.parse(parsed);
        if (!out) return;
        if (out.price) setLivePrice(out.price);
        if (out.candle) setLastCandleUpdate(out.candle);
      };

      const onDown = () => {
        clearPing();
        if (cancelled || closedByUsRef.current) {
          setStatus('closed');
          return;
        }
        scheduleReconnect();
      };
      ws.onclose = onDown;
      ws.onerror = () => {
        try { ws.close(); } catch { /* ignore */ }
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      setStatus('reconnecting');
      const delay = Math.min(8000, backoffRef.current) + Math.random() * 250;
      backoffRef.current = Math.min(8000, backoffRef.current * 2);
      if (reconnectTimerRef.current != null) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      cancelled = true;
      closedByUsRef.current = true;
      clearPing();
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
      }
    };
  }, [exchange, symbol, interval, enabled]);

  return { livePrice, lastCandleUpdate, status };
}
