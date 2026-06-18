// Marcvista native candlestick chart (V2 order tool only).
//
// Surface:
//   - Multi-timeframe selector (1m, 5m, 15m, 1h, 4h, 1d) persisted per (ex, sym).
//   - Initial candles via exchange public REST, then live updates via WS.
//   - Viewport: wheel to zoom (anchored to cursor x), drag empty plot to pan.
//   - V2 "price-axis tag scrubber" order tool — thin entry/TP/SL guide lines
//     with draggable axis tags on the right gutter and a profit/risk rail.
//   - Drawing toolkit: trend line, horizontal line, rectangle. In cursor
//     mode each shape is selectable, drag-to-move, endpoint/corner drag,
//     and deletable via ✕ chip or Delete/Backspace key. Drawings anchor to
//     timestamp (not pixel fraction), so they stay glued to the candles
//     while you pan and zoom. Persisted per (exchange, symbol) in
//     localStorage (key bumped to v2 — old format quietly discarded).
//   - Buy / Sell open a Risk & Fee modal in the parent (we surface via
//     onRequestOpen) — same gate path as the side panel since both route
//     into the same onPlaceOrder handler.
//
// IMPORTANT: This component never calls the place-order API. It updates
// orderPrice / takeProfit / stopLoss state in the parent exactly the way
// the input fields do. Every existing gate (isTradingAllowed, daily-SL,
// fee-share warning, R:R block) fires through the parent path unchanged.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, TrendingUp, Minus, Square, Trash2 } from 'lucide-react';
import { useHistoricalCandles } from '@/modules/TradingPanel/hooks/useHistoricalCandles';
import { useLivePrice, type LiveCandle } from '@/modules/TradingPanel/hooks/useLivePrice';
import { symbolsApi } from '@/lib/api';

type DrawTool = 'cursor' | 'trend' | 'hline' | 'box';

interface DrawAnchor { t: number; p: number; }
interface DrawShape {
  id: string;
  type: 'trend' | 'hline' | 'box';
  color: string;
  a?: DrawAnchor;
  b?: DrawAnchor;
  p?: number; // hline price-only
}

interface NativeChartProps {
  exchange: string;
  symbol: string;
  isTradingAllowed: boolean;
  getDisabledReason: string;
  orderPrice: string;
  takeProfit: string;
  stopLoss: string;
  setOrderPrice: (v: string) => void;
  setTakeProfit: (v: string) => void;
  setStopLoss: (v: string) => void;
  onLivePrice?: (p: string) => void;
  onRequestOpen: (side: 'Long' | 'Short') => void;
  activeProfile: any;
  // Active position(s) + pending limit order(s) for the current active
  // exchange (the page already filters them this way — by design the data
  // is per-exchange). We filter by symbol again here so the chart only
  // ever shows the lines belonging to the symbol it's displaying.
  positions?: any[];
  pendingOrders?: any[];
  /** Timeframe — controlled by the parent (selector lives in the chart header). */
  tf: string;
  onTfChange: (id: string) => void;
  /** Increment to reset zoom/pan/price-scale to auto-fit (button in header). */
  resetSignal?: number;
}

const AXIS_W = 64;
const TIME_H = 24;
const VOL_FRAC = 0.18;
const DRAW_COLOR = '#ffffff';
const PARENT_THROTTLE_MS = 250;
const MIN_VISIBLE = 20;

export const TIMEFRAMES: { id: string; label: string }[] = [
  { id: '1',   label: '1m' },
  { id: '5',   label: '5m' },
  { id: '15',  label: '15m' },
  { id: '60',  label: '1h' },
  { id: '240', label: '4h' },
  { id: 'D',   label: '1D' },
];

export default function NativeChart({
  exchange, symbol,
  isTradingAllowed, getDisabledReason,
  orderPrice, takeProfit, stopLoss,
  setOrderPrice, setTakeProfit, setStopLoss,
  onLivePrice, onRequestOpen,
  activeProfile,
  positions = [], pendingOrders = [],
  tf, onTfChange, resetSignal,
}: NativeChartProps) {
  // ---- timeframe (controlled by parent) ---------------------------------
  // Reset the viewport whenever the dataset changes (tf / symbol / exchange)
  // so the new candles auto-fit.
  useEffect(() => {
    viewRef.current = null;
    setView(null);
  }, [tf, exchange, symbol]);
  // External reset (header arrow button) → auto-fit zoom/pan + price scale.
  useEffect(() => {
    if (resetSignal === undefined) return;
    viewRef.current = null;
    setView(null);
    setPriceDomain(null);
  }, [resetSignal]);

  const { candles: histCandles, loading, error: loadError } = useHistoricalCandles({ exchange, symbol, interval: tf });
  const { livePrice, lastCandleUpdate, status } = useLivePrice({
    exchange, symbol, interval: tf, enabled: true,
  });

  // Live last-candle merged on top of history.
  const candles = useMemo<LiveCandle[]>(() => {
    if (!histCandles.length) return [];
    if (!lastCandleUpdate) return histCandles;
    const tail = histCandles[histCandles.length - 1];
    if (lastCandleUpdate.t === tail.t) {
      return [...histCandles.slice(0, -1), lastCandleUpdate];
    }
    if (lastCandleUpdate.t > tail.t) {
      return [...histCandles, lastCandleUpdate].slice(-histCandles.length);
    }
    return histCandles;
  }, [histCandles, lastCandleUpdate]);

  // ---- symbol tickSize for legal-precision drag prices -------------------
  const [tickSize, setTickSize] = useState<number>(0.01);
  const [tickLoaded, setTickLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setTickLoaded(false);
    symbolsApi.getInstrumentInfo(symbol).then((info: any) => {
      if (cancelled) return;
      const t = parseFloat(info?.priceFilter?.tickSize);
      if (Number.isFinite(t) && t > 0) {
        setTickSize(t);
        setTickLoaded(true);
      }
    }).catch(() => { /* keep default */ });
    return () => { cancelled = true; };
  }, [symbol, exchange]);

  // Tick-aware formatter — every on-chart price renders via this so a
  // low-priced ticker (e.g. SHIB at 0.0000xx) shows the exact precision
  // the broker actually uses for placement.
  const fmt = useCallback((p: number) => fmtPrice(p, tickSize), [tickSize]);

  // ---- throttle parent price bubble -------------------------------------
  const lastEmitRef = useRef(0);
  useEffect(() => {
    if (!livePrice) return;
    const now = Date.now();
    if (now - lastEmitRef.current < PARENT_THROTTLE_MS) return;
    lastEmitRef.current = now;
    onLivePrice?.(livePrice);
  }, [livePrice, onLivePrice]);

  // ---- size -------------------------------------------------------------
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- viewport (pan / zoom) --------------------------------------------
  // view = { start, end } as float indices into candles. `null` means
  // "auto-fit to all candles" — used on first render and after tf switch.
  const [view, setView] = useState<{ start: number; end: number } | null>(null);
  const viewRef = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => { viewRef.current = view; }, [view]);

  const effectiveView = useMemo(() => {
    const n = candles.length;
    if (n === 0) return { start: 0, end: 1 };
    if (!view) return { start: 0, end: n - 1 };
    return clampView(view, n);
  }, [view, candles.length]);

  const liveNum = useMemo(() => {
    const n = livePrice ? parseFloat(livePrice) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    const last = candles[candles.length - 1];
    return last ? last.c : NaN;
  }, [livePrice, candles]);

  // What the chart actually rounds drag-prices to. We can't trust the
  // default `tickSize` of 0.01 when the broker hasn't returned the real
  // value yet — for a 0.0000007 ticker, 0.01 wipes the price to 0.00 on
  // every drag. Until the real tickSize loads, derive a magnitude-based
  // step from the live price (~6 significant digits) so drags stay
  // precise from the very first frame.
  const effectiveTick = useMemo(() => {
    if (tickLoaded) return tickSize;
    if (!Number.isFinite(liveNum) || liveNum <= 0) return tickSize;
    const exp = Math.floor(Math.log10(liveNum));
    // 6 significant digits => step at 10^(exp - 5)
    return Math.pow(10, exp - 5);
  }, [tickLoaded, tickSize, liveNum]);

  // Manual price-axis override. When non-null, takes priority over auto-fit.
  // Set by dragging the Y axis; cleared by double-click on the axis or
  // "Reset view". Lets the user compress / expand the price scale like in
  // TradingView without the auto-fit fighting them on every render.
  const [priceDomain, setPriceDomain] = useState<{ lo: number; hi: number } | null>(null);
  const priceDomainRef = useRef<typeof priceDomain>(null);
  useEffect(() => { priceDomainRef.current = priceDomain; }, [priceDomain]);

  // Price domain — manual override (if set) is the base; otherwise auto-fit
  // to visible candles. Either way, the final domain is then extended to
  // include the current order lines so a user dragging entry / SL / TP
  // across the live price still sees the tags (otherwise the manual scale
  // would wall them off).
  // Collect every price we MUST keep visible — in-progress order + any
  // active live position / pending lines for this symbol. Both go through
  // the same domain-extension path below.
  const livePricesForDomain = useMemo(() => {
    const out: number[] = [];
    for (const o of positions || []) {
      if (!o || o.symbol !== symbol) continue;
      for (const k of ['avgPrice', 'entryPrice', 'price', 'stopLoss', 'takeProfit']) {
        const n = parseFloat((o as any)[k]);
        if (Number.isFinite(n) && n > 0) out.push(n);
      }
    }
    for (const o of pendingOrders || []) {
      if (!o || o.symbol !== symbol) continue;
      for (const k of ['price', 'triggerPrice', 'stopLoss', 'takeProfit']) {
        const n = parseFloat((o as any)[k]);
        if (Number.isFinite(n) && n > 0) out.push(n);
      }
    }
    return out;
  }, [positions, pendingOrders, symbol]);

  const domain = useMemo(() => {
    // Manual price scale (set by Y-axis drag or vertical pan) — respect the
    // user's zoom EXACTLY. Crucially we do NOT pull the order / position lines
    // into view here: doing so re-expanded the scale on every render, so the
    // price axis could never be zoomed tighter than the entry↔SL↔TP spread —
    // placing SL/TP effectively locked the user out of zooming. Off-screen
    // lines are handled at render time (tags pin to the plot edge; the thin
    // guide lines are clipped by the overlay's overflow:hidden).
    if (priceDomain) {
      const { lo, hi } = priceDomain;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
      return { lo, hi };
    }

    if (!candles.length) return { lo: 0, hi: 1 };

    const orderNums = [orderPrice, takeProfit, stopLoss]
      .map((s2) => parseFloat(s2)).filter((n) => Number.isFinite(n) && n > 0)
      .concat(livePricesForDomain);

    const { start, end } = effectiveView;
    const s = Math.max(0, Math.floor(start));
    const e = Math.min(candles.length - 1, Math.ceil(end));
    let lo = Infinity, hi = -Infinity;
    for (let i = s; i <= e; i++) {
      const c = candles[i];
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }

    // Auto-fit only: include order lines (entry / TP / SL) + live position /
    // pending lines so a freshly-set setup is visible by default. The user can
    // still zoom past them — dragging the price axis switches to the manual
    // scale above, which is left untouched.
    if (orderNums.length) {
      const span = hi - lo;
      const margin = (span > 0 ? span : hi * 0.005) * 0.05;
      for (const n of orderNums) {
        if (n < lo + margin) lo = n - margin;
        if (n > hi - margin) hi = n + margin;
      }
    }

    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
    const pad = (hi - lo) * 0.08 || hi * 0.005;
    lo -= pad; hi += pad;
    return { lo, hi };
  }, [priceDomain, candles, effectiveView, orderPrice, takeProfit, stopLoss, livePricesForDomain]);

  // Candle interval in ms — derived from data. Used to map t↔fractional index
  // so drawings outside the candle list still position correctly.
  const candleDt = useMemo(() => {
    if (candles.length < 2) return 60_000;
    let total = 0, n = 0;
    for (let i = 1; i < candles.length; i++) {
      const dt = candles[i].t - candles[i - 1].t;
      if (dt > 0) { total += dt; n++; }
    }
    return n ? Math.round(total / n) : 60_000;
  }, [candles]);

  const geo = useMemo(() => {
    const { w, h } = size;
    const plotW = Math.max(0, w - AXIS_W);
    const plotH = Math.max(0, h - TIME_H);
    const volH = plotH * VOL_FRAC;
    const candleAreaH = plotH - volH;
    const span = domain.hi - domain.lo || 1;
    const { start, end } = effectiveView;
    const vSpan = Math.max(1e-6, end - start);
    const slot = plotW / (vSpan + 1);
    const candleW = Math.max(1.5, slot * 0.62);

    const priceToY = (p: number) => (domain.hi - p) / span * candleAreaH;
    const yToPrice = (y: number) => domain.hi - (y / candleAreaH) * span;
    const xOf = (idx: number) => (idx - start + 0.5) * slot;
    const xToIdx = (x: number) => start + x / slot - 0.5;
    const tToX = (t: number) => {
      if (!candles.length) return 0;
      const idx = (t - candles[0].t) / candleDt;
      return xOf(idx);
    };
    const xToT = (x: number) => {
      if (!candles.length) return Date.now();
      const idx = xToIdx(x);
      return candles[0].t + idx * candleDt;
    };

    return {
      w, h, plotW, plotH, volH, candleAreaH, slot, candleW,
      lo: domain.lo, hi: domain.hi,
      start, end,
      priceToY, yToPrice, xOf, xToIdx, tToX, xToT,
    };
  }, [size, domain, effectiveView, candleDt, candles]);

  // ---- canvas draw ------------------------------------------------------
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || geo.w === 0 || !candles.length) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = geo.w * dpr; cv.height = geo.h * dpr;
    cv.style.width = geo.w + 'px'; cv.style.height = geo.h + 'px';
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, geo.w, geo.h);

    const UP = '#22c55e', DN = '#ef4444';

    // grid
    const ticks = priceTicks(geo.lo, geo.hi);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ticks.forEach((p) => {
      const y = geo.priceToY(p);
      if (y < 0 || y > geo.plotH) return;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(geo.plotW, y + 0.5); ctx.stroke();
    });

    const s = Math.max(0, Math.floor(geo.start - 1));
    const e = Math.min(candles.length - 1, Math.ceil(geo.end + 1));
    let maxVol = 1;
    for (let i = s; i <= e; i++) if ((candles[i].v || 0) > maxVol) maxVol = candles[i].v;

    // volume strip
    const volTop = geo.candleAreaH;
    for (let i = s; i <= e; i++) {
      const c = candles[i];
      const x = geo.xOf(i);
      const bw = geo.candleW;
      const vh = ((c.v || 0) / maxVol) * (geo.volH * 0.92);
      ctx.fillStyle = c.c >= c.o ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)';
      ctx.fillRect(x - bw / 2, volTop + geo.volH - vh, bw, vh);
    }

    // candles
    for (let i = s; i <= e; i++) {
      const c = candles[i];
      const x = geo.xOf(i);
      const up = c.c >= c.o;
      ctx.strokeStyle = up ? UP : DN; ctx.fillStyle = up ? UP : DN;
      const yO = geo.priceToY(c.o), yC = geo.priceToY(c.c);
      const yH = geo.priceToY(c.h), yL = geo.priceToY(c.l);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, yH); ctx.lineTo(x + 0.5, yL); ctx.stroke();
      const top = Math.min(yO, yC), bh = Math.max(1, Math.abs(yC - yO));
      ctx.fillRect(x - geo.candleW / 2, top, geo.candleW, bh);
    }

    // last price dashed line
    if (Number.isFinite(liveNum)) {
      const lastY = geo.priceToY(liveNum);
      ctx.strokeStyle = 'rgba(232,89,12,0.55)';
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, lastY + 0.5); ctx.lineTo(geo.plotW, lastY + 0.5); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [geo, candles, liveNum]);

  // ---- drawing state ----------------------------------------------------
  // v2 key — old xf-based drawings are not migrated (just dropped silently).
  const drawingsKey = `mv_drawings_v2_${exchange}_${symbol}`;
  const [tool, setTool] = useState<DrawTool>('cursor');
  const [drawings, setDrawings] = useState<DrawShape[]>([]);
  const [draft, setDraft] = useState<DrawShape | null>(null);
  const [selDraw, setSelDraw] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(drawingsKey);
      setDrawings(raw ? JSON.parse(raw) : []);
    } catch { setDrawings([]); }
    setSelDraw(null);
    setDraft(null);
  }, [drawingsKey]);
  useEffect(() => {
    try { localStorage.setItem(drawingsKey, JSON.stringify(drawings)); } catch { /* ignore */ }
  }, [drawings, drawingsKey]);

  // Keyboard delete for selected drawing.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selDraw) {
        setDrawings((arr) => arr.filter((d) => d.id !== selDraw));
        setSelDraw(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selDraw]);

  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Mouse → (t, p) using current geo
  const cursorTP = useCallback((cx: number, cy: number) => {
    const el = overlayRef.current;
    if (!el) return { t: Date.now(), p: 0, x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(geo.plotW, cx - r.left));
    const y = Math.max(0, Math.min(geo.plotH, cy - r.top));
    return { t: geo.xToT(x), p: roundToTick(geo.yToPrice(y), effectiveTick), x, y };
  }, [geo, effectiveTick]);

  // ---- create a new drawing --------------------------------------------
  const startDraw = useCallback((e: React.PointerEvent) => {
    if (tool === 'cursor') return;
    e.preventDefault();
    const s = cursorTP(e.clientX, e.clientY);
    if (tool === 'hline') {
      const shape: DrawShape = { id: nextId(), type: 'hline', color: DRAW_COLOR, p: s.p };
      setDrawings((arr) => [...arr, shape]);
      return;
    }
    const draftShape: DrawShape = {
      id: '__draft', type: tool, color: DRAW_COLOR,
      a: { t: s.t, p: s.p }, b: { t: s.t, p: s.p },
    };
    setDraft(draftShape);
    const move = (ev: PointerEvent) => {
      const m = cursorTP(ev.clientX, ev.clientY);
      setDraft((d) => d ? { ...d, b: { t: m.t, p: m.p } } : d);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const m = cursorTP(ev.clientX, ev.clientY);
      if (Math.hypot(m.x - s.x, m.y - s.y) > 6) {
        setDrawings((arr) => [...arr, {
          id: nextId(), type: tool, color: DRAW_COLOR,
          a: { t: s.t, p: s.p }, b: { t: m.t, p: m.p },
        }]);
      }
      setDraft(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [tool, cursorTP]);

  // ---- drag/move an existing drawing -----------------------------------
  // mode: 'move' translates the whole shape; 'a'/'b' moves just that anchor.
  const dragDrawing = useCallback((shapeId: string, mode: 'move' | 'a' | 'b' | 'hline') => (e: React.PointerEvent) => {
    if (tool !== 'cursor') return;
    e.preventDefault();
    e.stopPropagation();
    setSelDraw(shapeId);
    const start = cursorTP(e.clientX, e.clientY);
    // Snapshot the shape so deltas apply against the original geometry.
    const original = drawings.find((d) => d.id === shapeId);
    if (!original) return;
    document.body.style.userSelect = 'none';
    const move = (ev: PointerEvent) => {
      const cur = cursorTP(ev.clientX, ev.clientY);
      setDrawings((arr) => arr.map((d) => {
        if (d.id !== shapeId) return d;
        if (mode === 'hline' && d.type === 'hline') {
          return { ...d, p: cur.p };
        }
        if (!original.a || !original.b) return d;
        if (mode === 'a') return { ...d, a: { t: cur.t, p: cur.p } };
        if (mode === 'b') return { ...d, b: { t: cur.t, p: cur.p } };
        // 'move' — translate both anchors by delta from drag start
        const dt = cur.t - start.t;
        const dp = cur.p - start.p;
        return {
          ...d,
          a: { t: original.a.t + dt, p: roundToTick(original.a.p + dp, effectiveTick) },
          b: { t: original.b.t + dt, p: roundToTick(original.b.p + dp, effectiveTick) },
        };
      }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [tool, drawings, cursorTP, effectiveTick]);

  // Refs to read the latest SL/TP/live during a drag without rebuilding
  // the vDrag callback on every keystroke in the side panel.
  const stopLossRef = useRef(stopLoss);
  useEffect(() => { stopLossRef.current = stopLoss; }, [stopLoss]);
  const takeProfitRef = useRef(takeProfit);
  useEffect(() => { takeProfitRef.current = takeProfit; }, [takeProfit]);
  const liveNumRef = useRef(liveNum);
  useEffect(() => { liveNumRef.current = liveNum; }, [liveNum]);

  // ---- V2 order tag drag -----------------------------------------------
  // Entry drag auto-swaps SL ↔ TP whenever the entry crosses the live price.
  // BUY semantics (entry < live): SL below entry, TP above.
  // SELL semantics (entry > live): SL above entry, TP below.
  // If you drag entry across live and the existing SL/TP are now on the
  // wrong sides for the new direction, their values swap so semantics hold.
  const vDrag = useCallback((kind: 'entry' | 'tp' | 'sl') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const live = liveNumRef.current;
    let lastSide: 'buy' | 'sell' | null = null;
    if (kind === 'entry' && Number.isFinite(live)) {
      const startEntry = parseFloat(orderPrice);
      if (Number.isFinite(startEntry)) lastSide = startEntry < live ? 'buy' : 'sell';
    }
    const move = (ev: PointerEvent) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const r = overlay.getBoundingClientRect();
      const y = Math.max(0, Math.min(geo.plotH, ev.clientY - r.top));
      const p = roundToTick(geo.yToPrice(y), effectiveTick);
      const s = p.toString();
      if (kind === 'entry') {
        if (lastSide && Number.isFinite(live)) {
          const newSide: 'buy' | 'sell' = p < live ? 'buy' : 'sell';
          if (newSide !== lastSide) {
            // Entry just crossed live — swap SL/TP so the lower of the two
            // becomes whatever the new direction wants as its "below" tag.
            const sl = parseFloat(stopLossRef.current);
            const tp = parseFloat(takeProfitRef.current);
            if (Number.isFinite(sl) && Number.isFinite(tp)) {
              setStopLoss(tp.toString());
              setTakeProfit(sl.toString());
            }
            lastSide = newSide;
          }
        }
        setOrderPrice(s);
      } else if (kind === 'tp') {
        setTakeProfit(s);
      } else {
        setStopLoss(s);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [geo, effectiveTick, orderPrice, setOrderPrice, setTakeProfit, setStopLoss]);

  // ---- price-axis drag (Y) — TradingView-style compress / expand --------
  // Drag down on the price axis expands the visible price range (zoom out);
  // drag up compresses it (zoom in). Pivot stays at the cursor's price.
  // Double-click the axis to clear the manual scale back to auto-fit.
  const onYAxisPointerDown = useCallback((e: React.PointerEvent) => {
    if (!candles.length) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startLo = domain.lo;
    const startHi = domain.hi;
    const startSpan = startHi - startLo;
    // Anchor the price under the cursor in place — same UX as TradingView.
    const r = overlayRef.current?.getBoundingClientRect();
    const cy = r ? Math.max(0, Math.min(geo.plotH, e.clientY - r.top)) : geo.plotH / 2;
    const pivotPrice = geo.yToPrice(cy);
    const pivotFrac = startSpan > 0 ? (startHi - pivotPrice) / startSpan : 0.5;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      const factor = Math.exp(dy / 120);
      const newSpan = Math.max(1e-6, startSpan * factor);
      const hi = pivotPrice + pivotFrac * newSpan;
      const lo = hi - newSpan;
      setPriceDomain({ lo, hi });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [candles.length, domain.lo, domain.hi, geo]);

  // ---- time-axis drag (X) — compress / expand visible candle count ------
  // Drag right on the time axis expands time range (zoom out, more candles);
  // drag left compresses (zoom in, fewer). Right edge is kept fixed so the
  // latest candle stays visible — matches TradingView.
  const onXAxisPointerDown = useCallback((e: React.PointerEvent) => {
    if (!candles.length) return;
    e.preventDefault();
    e.stopPropagation();
    const cur = viewRef.current || { start: 0, end: candles.length - 1 };
    const startX = e.clientX;
    const startSpan = cur.end - cur.start;
    const fixedEnd = cur.end;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const factor = Math.exp(-dx / 150);
      const newSpan = Math.max(MIN_VISIBLE, Math.min(candles.length * 4, startSpan * factor));
      setView(clampView({ start: fixedEnd - newSpan, end: fixedEnd }, candles.length));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [candles.length]);

  // ---- pan + zoom -------------------------------------------------------
  // Wheel anywhere on plot = zoom; mousedown on empty plot in cursor mode = pan.
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!candles.length) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const cur = viewRef.current || { start: 0, end: candles.length - 1 };
    const span = cur.end - cur.start;
    const newSpan = Math.max(MIN_VISIBLE, Math.min(candles.length * 4, span * factor));
    const rect = overlayRef.current?.getBoundingClientRect();
    const cursorX = rect ? e.clientX - rect.left : geo.plotW / 2;
    const fx = geo.plotW ? cursorX / geo.plotW : 0.5;
    const focusIdx = cur.start + fx * span;
    const start = focusIdx - fx * newSpan;
    const end = start + newSpan;
    setView(clampView({ start, end }, candles.length));
  }, [candles.length, geo.plotW]);

  const startPan = useCallback((e: React.PointerEvent) => {
    if (tool !== 'cursor') return;
    // ignore if hitting an interactive bit (no-place)
    if ((e.target as HTMLElement).closest('.no-place')) return;
    // Clicking empty chart space only deselects any selected drawing (its
    // selection cross / delete chip disappears). Clicking a drawing keeps it
    // selected (those are `.no-place` and bail out above). A chart click never
    // places order lines — use the on-chart "Place Order" tag for that.
    setSelDraw(null);
    if (!candles.length) return;
    e.preventDefault();
    const cur = viewRef.current || { start: 0, end: candles.length - 1 };
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const span = cur.end - cur.start;
    const slot = geo.plotW / (span + 1);
    // Snapshot the price domain at drag-start so vertical drag pans the
    // whole price range together, even if the auto-fit shifts mid-drag.
    const startLo = domain.lo;
    const startHi = domain.hi;
    const pricePerPx = (startHi - startLo) / (geo.candleAreaH || 1);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      // X — horizontal pan over the candle timeline (unchanged).
      if (Math.abs(dx) > 1) {
        const dIdx = -dx / slot;
        setView(clampView({ start: cur.start + dIdx, end: cur.end + dIdx }, candles.length));
      }
      // Y — vertical pan of the price domain. Dragging DOWN moves the
      // visible window DOWN in price (you see the prices that were below).
      // Engages manual price-scale mode, mirroring TradingView's UX.
      if (Math.abs(dy) > 1) {
        const shift = dy * pricePerPx;
        setPriceDomain({ lo: startLo + shift, hi: startHi + shift });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // A tap (no pan) only deselects — placing order lines is intentionally
      // NOT done from a chart click; use the on-chart "Place Order" tag.
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [tool, candles.length, geo.plotW, geo.candleAreaH, domain.lo, domain.hi, isTradingAllowed, cursorTP]);

  // On-chart "Place Order" tag → drop entry/SL/TP at the given price for the
  // requested side. This is the ONLY way order lines are dropped on the chart;
  // a plain chart click never places. Forcing the side means dragging a Buy tag
  // above live still sizes SL below entry and TP above (long semantics).
  const placeSideAt = useCallback((side: 'Long' | 'Short', entryP: number) => {
    const slPct = 0.006;
    const rr = (Number(activeProfile?.minRiskRewardRatio) || 1.5) + 0.3;
    const slDist = entryP * slPct;
    const isBuy = side === 'Long';
    const slP = roundToTick(isBuy ? entryP - slDist : entryP + slDist, effectiveTick);
    const tpP = roundToTick(isBuy ? entryP + slDist * rr : entryP - slDist * rr, effectiveTick);
    setOrderPrice(String(entryP));
    setStopLoss(String(slP));
    setTakeProfit(String(tpP));
  }, [activeProfile, effectiveTick, setOrderPrice, setStopLoss, setTakeProfit]);

  // ---- on-chart action button ------------------------------------------
  // A single morphing button anchored to a draggable price (defaults to
  // live). While there's no order setup:
  //   • Sky-blue "Place Order" — clicking commits the button's current
  //     price as entry and generates default SL/TP (Long semantics).
  //   • Handle next to the button lets you drag its price first.
  // Once entry/SL/TP exist (set via this click or the V2 tags), the
  // button follows the entry price and morphs by direction (SL inferred):
  //   • SL below entry → "Open Long" green
  //   • SL above entry → "Open Short" red
  // Clicking the morphed button opens the Risk & Fee modal.
  const [actionDraftPrice, setActionDraftPrice] = useState<number | null>(null);
  // Hover crosshair — cursor position within the plot (mouse only; touch has no
  // hover so the crosshair never sticks). Drives the full-width + full-height
  // guide lines and the price (Y-axis) / time (X-axis) readouts.
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  // Whether the cursor is over (or actively dragging) the on-chart action
  // button — drives the "where the order will be placed" guide line.
  const [actionHover, setActionHover] = useState(false);
  const [draggingAction, setDraggingAction] = useState(false);
  const actionPrice = useMemo(() => {
    // While an order setup exists, the button follows the entry price so
    // the morphed label stays glued to the line it represents. Entry,
    // SL, TP are recomputed here from the latest state strings instead
    // of relying on the later-declared parsed values.
    const e = parseFloat(orderPrice);
    const t = parseFloat(takeProfit);
    const s = parseFloat(stopLoss);
    const setup = Number.isFinite(e) && e > 0
                && Number.isFinite(t) && t > 0
                && Number.isFinite(s) && s > 0;
    if (setup) return e;
    if (actionDraftPrice != null) return actionDraftPrice;
    if (Number.isFinite(liveNum)) return liveNum;
    return null;
  }, [orderPrice, takeProfit, stopLoss, actionDraftPrice, liveNum]);

  // Drag-handle pointer down — updates only the draft price. We track
  // `moved` so a tap (no drag) still falls through to the button's click.
  // `hasOrder` is recomputed inline because the parsed `hasOrder` const
  // is declared later in this function body (TDZ would crash render).
  const dragActionHandle = useCallback((e: React.PointerEvent) => {
    const eN = parseFloat(orderPrice);
    const tN = parseFloat(takeProfit);
    const sN = parseFloat(stopLoss);
    const setupExists = Number.isFinite(eN) && eN > 0
                      && Number.isFinite(tN) && tN > 0
                      && Number.isFinite(sN) && sN > 0;
    if (setupExists) return; // entry V2 tag owns the price once a setup exists
    e.preventDefault();
    e.stopPropagation();
    // Keep the "where the order will be placed" guide line visible for the
    // whole drag, even if the cursor briefly outruns the button at the edges.
    setDraggingAction(true);
    const startY = e.clientY;
    let moved = false;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const move = (ev: PointerEvent) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      if (Math.abs(ev.clientY - startY) > 3) moved = true;
      if (!moved) return;
      const r = overlay.getBoundingClientRect();
      const y = Math.max(0, Math.min(geo.plotH, ev.clientY - r.top));
      setActionDraftPrice(roundToTick(geo.yToPrice(y), effectiveTick));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDraggingAction(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [orderPrice, takeProfit, stopLoss, geo, effectiveTick]);

  // Placed-order / pending-order lines for the current symbol on the
  // current exchange. Read-only — these reflect live broker state, not
  // the in-progress order setup. The page already scopes positions /
  // pendingOrders to the active exchange, so filtering by symbol here
  // satisfies "only on the exchange it's placed".
  const liveLines = useMemo(() => {
    type Line = { id: string; kind: 'pos' | 'pending'; side: 'long' | 'short';
                  entry?: number; sl?: number; tp?: number; label: string };
    const out: Line[] = [];
    const toNum = (v: any) => {
      const n = parseFloat(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    for (const p of positions || []) {
      if (!p || p.symbol !== symbol) continue;
      const sideRaw = String(p.side || p.positionSide || '').toLowerCase();
      const side: 'long' | 'short' =
        sideRaw === 'sell' || sideRaw === 'short' ? 'short' : 'long';
      const entryP = toNum(p.avgPrice ?? p.entryPrice ?? p.price);
      const slP = toNum(p.stopLoss);
      const tpP = toNum(p.takeProfit);
      if (entryP || slP || tpP) {
        out.push({
          id: 'pos-' + (p._id || p.orderId || p.positionIdx || entryP || Math.random()),
          kind: 'pos', side, entry: entryP, sl: slP, tp: tpP,
          label: 'POSITION',
        });
      }
    }
    for (const o of pendingOrders || []) {
      if (!o || o.symbol !== symbol) continue;
      const sideRaw = String(o.side || '').toLowerCase();
      const side: 'long' | 'short' = sideRaw === 'sell' ? 'short' : 'long';
      const entryP = toNum(o.price ?? o.triggerPrice);
      const slP = toNum(o.stopLoss);
      const tpP = toNum(o.takeProfit);
      if (entryP || slP || tpP) {
        out.push({
          id: 'pend-' + (o._id || o.orderId || o.orderLinkId || entryP || Math.random()),
          kind: 'pending', side, entry: entryP, sl: slP, tp: tpP,
          label: 'PENDING',
        });
      }
    }
    return out;
  }, [positions, pendingOrders, symbol]);

  // ---- render -----------------------------------------------------------
  const entry = parseFloat(orderPrice);
  const tp = parseFloat(takeProfit);
  const sl = parseFloat(stopLoss);
  const hasOrder = Number.isFinite(entry) && entry > 0
                && Number.isFinite(tp) && tp > 0
                && Number.isFinite(sl) && sl > 0;
  const inferredSide: 'buy' | 'sell' | null =
    hasOrder && Number.isFinite(liveNum) ? (entry < liveNum ? 'buy' : 'sell') : null;

  const ticks = priceTicks(geo.lo, geo.hi);

  const RAIL: { id: DrawTool; tip: string; Icon: any }[] = [
    { id: 'cursor', tip: 'Cursor (pan + select)', Icon: Crosshair },
    { id: 'trend',  tip: 'Trend line', Icon: TrendingUp },
    { id: 'hline',  tip: 'Horizontal line', Icon: Minus },
    { id: 'box',    tip: 'Rectangle / box', Icon: Square },
  ];

  return (
    <div className="flex flex-col h-full min-h-[280px] sm:min-h-[340px] lg:min-h-0">
      {/* The old toolbar row above the chart was removed so it no longer steals
          vertical space: the "Clear drawings" control now floats inside the
          chart (top-right) and the draw/disabled status hint moved into the
          symbol row below. */}

      {/* Body: rail + plot */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* left tool rail */}
        <div className="flex flex-col gap-1 pr-2 border-r border-white/5">
          {RAIL.map(({ id, tip, Icon }) => (
            <button
              key={id}
              type="button"
              title={tip}
              onClick={() => { setTool(id); if (id !== 'cursor') setSelDraw(null); }}
              className={`w-8 h-8 flex items-center justify-center rounded ${
                tool === id ? 'bg-white/10 text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 pl-2 relative">
          <div className="flex items-center gap-2 flex-wrap text-xs mb-1">
            <span className="inline-block w-3 h-3 rounded-full bg-orange-400" />
            <b>{symbol} Perpetual</b>
            <span className="text-muted-foreground">· {TIMEFRAMES.find(t=>t.id===tf)?.label || tf} · {exchange}</span>
            {candles.length > 0 && (
              <span className="text-green-500 text-[11px] tabular-nums">
                C <i className="not-italic">{fmt(candles[candles.length - 1].c)}</i>
              </span>
            )}
            {Number.isFinite(liveNum) && (
              <span className="ml-2 text-green-500 text-[11px] tabular-nums">
                Live {fmt(liveNum)}
              </span>
            )}
            {/* Status hint (relocated from the removed toolbar row) — draw-mode
                prompt, or the trading-disabled reason. Pushed to the right. */}
            {(tool !== 'cursor' || !isTradingAllowed) && (
              <span className="ml-auto text-[11px] text-muted-foreground hidden md:inline">
                {tool === 'cursor'
                  ? (getDisabledReason || 'Trading disabled')
                  : `Draw on the chart · ${RAIL.find(r => r.id === tool)?.tip}`}
              </span>
            )}
          </div>

          <div ref={wrapRef} className="relative w-full" style={{ height: 'calc(100% - 22px)', minHeight: 220 }}>
            <canvas ref={canvasRef} className="absolute top-0 left-0" />

            {/* Clear-drawings control — floats inside the chart's top-right
                (just left of the price axis) instead of occupying a toolbar
                row above the chart. Only shown when drawings exist. */}
            {drawings.length > 0 && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setDrawings([]); setSelDraw(null); }}
                title="Clear all drawings"
                className="no-place absolute z-40 flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 bg-black/60 backdrop-blur text-[11px] text-muted-foreground hover:text-white hover:border-white/30 transition-colors"
                style={{ top: 6, right: AXIS_W + 8 }}
              >
                <Trash2 className="w-3 h-3" /> Clear ({drawings.length})
              </button>
            )}

            {/* price axis — drag to compress/expand, double-click to reset */}
            <div
              className="absolute top-0 right-0 border-l border-white/5"
              style={{ width: AXIS_W, height: geo.plotH, cursor: 'ns-resize', touchAction: 'none' }}
              title="Drag to compress / expand · double-click to reset"
              onPointerDown={onYAxisPointerDown}
              onDoubleClick={() => setPriceDomain(null)}
            >
              {ticks.map((p) => {
                const y = geo.priceToY(p);
                if (y < 6 || y > geo.plotH - 2) return null;
                return (
                  <div key={p} className="absolute right-2 text-[11px] text-white/50 tabular-nums" style={{ top: y, transform: 'translateY(-50%)' }}>
                    {fmt(p)}
                  </div>
                );
              })}
              {Number.isFinite(liveNum) && (
                <div className="absolute right-1 left-1 text-center text-[11px] font-bold rounded tabular-nums"
                     style={{ top: Math.max(8, Math.min(geo.plotH - 8, geo.priceToY(liveNum))), transform: 'translateY(-50%)',
                              background: '#e8590c', color: '#ffffff', padding: '2px 4px' }}>
                  {fmt(liveNum)}
                </div>
              )}
              {/* crosshair price readout — the price under the cursor */}
              {hover && (
                <div className="absolute right-1 left-1 text-center text-[11px] font-medium rounded tabular-nums pointer-events-none"
                     style={{ top: Math.max(8, Math.min(geo.plotH - 8, hover.y)), transform: 'translateY(-50%)',
                              background: '#374151', color: '#ffffff', padding: '1px 4px' }}>
                  {fmt(geo.yToPrice(hover.y))}
                </div>
              )}
            </div>

            {/* time axis — drag to compress/expand, double-click to reset */}
            <div
              className="absolute left-0 bottom-0 border-t border-white/5"
              style={{ height: TIME_H, right: AXIS_W, width: geo.plotW, cursor: 'ew-resize', touchAction: 'none' }}
              title="Drag to compress / expand · double-click to reset"
              onPointerDown={onXAxisPointerDown}
              onDoubleClick={() => setView(null)}
            >
              {timeTicks(candles, geo).map(({ i, t }) => {
                const x = geo.xOf(i);
                if (x < 16 || x > geo.plotW - 8) return null;
                return (
                  <div key={i} className="absolute text-[9px] sm:text-[11px] text-white/50 tabular-nums whitespace-nowrap"
                       style={{ left: x, bottom: 4, transform: 'translateX(-50%)' }}>
                    {fmtClock(t, tf)}
                  </div>
                );
              })}
              {/* crosshair time readout — the time under the cursor */}
              {hover && (
                <div className="absolute text-[9px] sm:text-[11px] font-medium tabular-nums whitespace-nowrap rounded pointer-events-none"
                     style={{ left: Math.max(20, Math.min(geo.plotW - 20, hover.x)), bottom: 3, transform: 'translateX(-50%)',
                              background: '#374151', color: '#ffffff', padding: '0 5px' }}>
                  {fmtClock(geo.xToT(hover.x), tf)}
                </div>
              )}
            </div>

            {/* overlay (drawings + order tools + pan-catcher) */}
            <div
              ref={overlayRef}
              onWheel={onWheel}
              onPointerDown={tool === 'cursor' ? startPan : startDraw}
              onMouseMove={(e) => {
                const el = overlayRef.current;
                if (!el) return;
                const r = el.getBoundingClientRect();
                const x = e.clientX - r.left;
                const y = e.clientY - r.top;
                if (x < 0 || y < 0 || x > geo.plotW || y > geo.plotH) { setHover(null); return; }
                setHover({ x, y });
              }}
              onMouseLeave={() => setHover(null)}
              className="absolute top-0 left-0"
              style={{
                width: geo.plotW, height: geo.plotH,
                cursor: tool === 'cursor'
                  ? (isTradingAllowed ? 'crosshair' : 'not-allowed')
                  : 'crosshair',
                touchAction: 'none',
                // Clip order / position guide lines that fall outside the
                // (possibly manually-zoomed) price domain so they never bleed
                // over the chart header. Clamped tags/buttons stay within
                // bounds, so this only hides genuinely off-screen lines.
                overflow: 'hidden',
              }}
            >
              {/* Hover crosshair — full-width + full-height guide lines that
                  follow the cursor (the price / time readouts live on the
                  axes). pointer-events:none so tags / buttons underneath stay
                  grabbable. */}
              {hover && (
                <>
                  <div className="pointer-events-none absolute" style={{ left: hover.x, top: 0, bottom: 0, borderLeft: '1px dashed rgba(255,255,255,0.3)' }} />
                  <div className="pointer-events-none absolute" style={{ top: hover.y, left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.3)' }} />
                </>
              )}

              {/* "Where the order will be placed" — a horizontal guide at the
                  action button's price while the cursor is over it (or it's
                  being dragged), in the pre-setup state. Once entry/SL/TP exist
                  the V2 entry line already shows the level, so this is skipped. */}
              {!hasOrder && (actionHover || draggingAction) && Number.isFinite(actionPrice as number) && (
                <div
                  className="no-place pointer-events-none absolute"
                  style={{
                    top: Math.max(0, Math.min(geo.plotH, geo.priceToY(actionPrice as number))),
                    left: 0, right: 0, transform: 'translateY(-50%)',
                    borderTop: '1px dashed rgba(250,204,21,0.95)',
                  }}
                />
              )}

              {/* drawings + selection handles */}
              <svg
                width={geo.plotW}
                height={geo.plotH}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
              >
                {[...drawings, ...(draft ? [draft] : [])].map((d) => {
                  const isDraft = d.id === '__draft';
                  const on = !isDraft && d.id === selDraw;
                  // All user-drawn shapes render white regardless of stored
                  // color; selection is shown via thicker stroke + handles.
                  const stroke = '#ffffff';
                  const grabPE = (!isDraft && tool === 'cursor') ? 'auto' : 'none';
                  if (d.type === 'hline' && Number.isFinite(d.p)) {
                    const y = geo.priceToY(d.p!);
                    return (
                      <g key={d.id} className="no-place">
                        <line x1={0} y1={y} x2={geo.plotW} y2={y} stroke={stroke}
                              strokeWidth={on ? 2 : 1.25} strokeDasharray="6 4" pointerEvents="none" />
                        {/* hit / drag region */}
                        <line x1={0} y1={y} x2={geo.plotW} y2={y} stroke="transparent" strokeWidth={11}
                              style={{ pointerEvents: grabPE, cursor: 'ns-resize' }}
                              onPointerDown={dragDrawing(d.id, 'hline')} />
                      </g>
                    );
                  }
                  if (d.type === 'trend' && d.a && d.b) {
                    const x1 = geo.tToX(d.a.t), y1 = geo.priceToY(d.a.p);
                    const x2 = geo.tToX(d.b.t), y2 = geo.priceToY(d.b.p);
                    return (
                      <g key={d.id} className="no-place">
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke}
                              strokeWidth={on ? 2.5 : 1.75} pointerEvents="none" />
                        {/* body drag hit area */}
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12}
                              style={{ pointerEvents: grabPE, cursor: 'move' }}
                              onPointerDown={dragDrawing(d.id, 'move')} />
                        {!isDraft && on && (
                          <>
                            <circle cx={x1} cy={y1} r={5} fill={stroke}
                                    style={{ pointerEvents: 'auto', cursor: 'grab' }}
                                    onPointerDown={dragDrawing(d.id, 'a')} />
                            <circle cx={x2} cy={y2} r={5} fill={stroke}
                                    style={{ pointerEvents: 'auto', cursor: 'grab' }}
                                    onPointerDown={dragDrawing(d.id, 'b')} />
                          </>
                        )}
                        {!isDraft && !on && (
                          <>
                            <circle cx={x1} cy={y1} r={3} fill={stroke} pointerEvents="none" />
                            <circle cx={x2} cy={y2} r={3} fill={stroke} pointerEvents="none" />
                          </>
                        )}
                      </g>
                    );
                  }
                  if (d.type === 'box' && d.a && d.b) {
                    const ax = geo.tToX(d.a.t), bx = geo.tToX(d.b.t);
                    const ay = geo.priceToY(d.a.p), by = geo.priceToY(d.b.p);
                    const x = Math.min(ax, bx);
                    const w = Math.abs(bx - ax);
                    const y = Math.min(ay, by);
                    const h = Math.abs(by - ay);
                    return (
                      <g key={d.id} className="no-place">
                        <rect x={x} y={y} width={w} height={h}
                              fill="#ffffff" fillOpacity={isDraft ? 0.06 : 0.08}
                              stroke={stroke} strokeWidth={on ? 2 : 1.25}
                              style={{ pointerEvents: isDraft ? 'none' : (tool === 'cursor' ? 'all' : 'none'),
                                       cursor: 'move' }}
                              onPointerDown={isDraft ? undefined : dragDrawing(d.id, 'move')} />
                        {!isDraft && on && (
                          <>
                            <circle cx={ax} cy={ay} r={5} fill={stroke}
                                    style={{ pointerEvents: 'auto', cursor: 'nwse-resize' }}
                                    onPointerDown={dragDrawing(d.id, 'a')} />
                            <circle cx={bx} cy={by} r={5} fill={stroke}
                                    style={{ pointerEvents: 'auto', cursor: 'nwse-resize' }}
                                    onPointerDown={dragDrawing(d.id, 'b')} />
                          </>
                        )}
                      </g>
                    );
                  }
                  return null;
                })}
              </svg>

              {/* delete chip for selected drawing — drawn above everything else */}
              {selDraw && tool === 'cursor' && (() => {
                const d = drawings.find((x) => x.id === selDraw);
                if (!d) return null;
                let x = 8, y = 8;
                if (d.type === 'hline' && Number.isFinite(d.p)) {
                  x = geo.plotW - 36; y = geo.priceToY(d.p!) - 24;
                } else if (d.a && d.b) {
                  const x1 = geo.tToX(d.a.t), x2 = geo.tToX(d.b.t);
                  const y1 = geo.priceToY(d.a.p), y2 = geo.priceToY(d.b.p);
                  x = Math.max(x1, x2) - 24; y = Math.min(y1, y2) - 24;
                }
                x = Math.max(4, Math.min(geo.plotW - 28, x));
                y = Math.max(4, Math.min(geo.plotH - 28, y));
                return (
                  <button
                    type="button"
                    className="no-place absolute z-50 w-6 h-6 flex items-center justify-center bg-red-500/90 hover:bg-red-500 text-white text-xs rounded shadow"
                    style={{ left: x, top: y, pointerEvents: 'auto' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrawings((arr) => arr.filter((dd) => dd.id !== selDraw));
                      setSelDraw(null);
                    }}
                    title="Delete drawing (or press Delete)"
                  >✕</button>
                );
              })()}

              {/* Live position / pending order info lines for this symbol.
                  Non-interactive — broker-state mirror, can't be dragged. */}
              {liveLines.map((ln) => {
                const c = ln.kind === 'pos'
                  ? { entry: '#A78BFA', sl: '#ef4444', tp: '#22c55e', tag: 'rgba(167,139,250,0.15)', tagBorder: 'rgba(167,139,250,0.4)' }
                  : { entry: '#60A5FA', sl: '#ef4444', tp: '#22c55e', tag: 'rgba(96,165,250,0.12)', tagBorder: 'rgba(96,165,250,0.35)' };
                return (
                  <React.Fragment key={ln.id}>
                    {Number.isFinite(ln.entry) && (
                      <div className="no-place absolute" style={{
                        top: geo.priceToY(ln.entry!), left: 0, right: 0,
                        transform: 'translateY(-50%)',
                        borderTop: `1px dashed ${c.entry}`,
                      }} />
                    )}
                    {Number.isFinite(ln.tp) && (
                      <div className="no-place absolute" style={{
                        top: geo.priceToY(ln.tp!), left: 0, right: 0,
                        transform: 'translateY(-50%)',
                        borderTop: `1px dotted ${c.tp}`,
                      }} />
                    )}
                    {Number.isFinite(ln.sl) && (
                      <div className="no-place absolute" style={{
                        top: geo.priceToY(ln.sl!), left: 0, right: 0,
                        transform: 'translateY(-50%)',
                        borderTop: `1px dotted ${c.sl}`,
                      }} />
                    )}
                    {Number.isFinite(ln.entry) && (
                      <div
                        className="no-place absolute flex items-center gap-1 text-[10px] font-bold tabular-nums rounded px-1.5 py-0.5"
                        style={{
                          top: geo.priceToY(ln.entry!), left: 6,
                          transform: 'translateY(-50%)',
                          background: c.tag, border: `1px solid ${c.tagBorder}`,
                          color: c.entry,
                        }}
                        title={`${ln.label} · ${ln.side.toUpperCase()}`}
                      >
                        {ln.label} {ln.side.toUpperCase()} · {fmt(ln.entry!)}
                      </div>
                    )}
                    {Number.isFinite(ln.tp) && (
                      <div className="no-place absolute text-[10px] font-bold tabular-nums rounded px-1.5 py-0.5"
                           style={{ top: geo.priceToY(ln.tp!), left: 6, transform: 'translateY(-50%)',
                                    background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)',
                                    color: c.tp }}>
                        TP {fmt(ln.tp!)}
                      </div>
                    )}
                    {Number.isFinite(ln.sl) && (
                      <div className="no-place absolute text-[10px] font-bold tabular-nums rounded px-1.5 py-0.5"
                           style={{ top: geo.priceToY(ln.sl!), left: 6, transform: 'translateY(-50%)',
                                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                                    color: c.sl }}>
                        SL {fmt(ln.sl!)}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Single morphing action button anchored to a draggable
                  price line. Sky-blue "Place Order" while no setup
                  exists; "Open Long" / "Open Short" once entry+SL pin a
                  direction. A small left-side grip handle lets the user
                  drag the button vertically to set the entry price
                  *before* clicking. While dragging, a faint price line
                  follows so the user can aim precisely; on click, if no
                  setup yet, entry/SL/TP populate at the button's price
                  and the V2 tags appear for further adjustment. */}
              {Number.isFinite(actionPrice as number) && (() => {
                // Clamp the rendered Y so the button cannot leave the
                // visible plot even when the underlying price is outside
                // the current zoom/pan domain. The displayed *label* still
                // shows the true actionPrice so the user sees where it
                // would actually be placed.
                const rawY = geo.priceToY(actionPrice as number);
                const BTN_PAD = 14; // half-height of the chip + small margin
                const aY = Math.max(BTN_PAD, Math.min(geo.plotH - BTN_PAD, rawY));
                // Determine button state. Once a setup exists, side is
                // implied from SL vs entry (same logic the PlaceOrderBar
                // uses). Otherwise it's the neutral sky-blue state.
                const setupReady =
                  Number.isFinite(entry) && entry > 0 &&
                  Number.isFinite(sl) && sl > 0;
                const side: 'Long' | 'Short' | null = setupReady
                  ? (sl < entry ? 'Long' : sl > entry ? 'Short' : null)
                  : null;
                const label = side === 'Long' ? 'Open Long'
                            : side === 'Short' ? 'Open Short'
                            : 'Place Order';
                const bg = side === 'Long'
                  ? 'linear-gradient(to right, #22C55E, #16A34A)'
                  : side === 'Short'
                    ? 'linear-gradient(to right, #EF4444, #DC2626)'
                    : 'linear-gradient(to right, #facc15, #eab308)';
                const borderCol = side === 'Long' ? 'rgba(34,197,94,0.7)'
                  : side === 'Short' ? 'rgba(239,68,68,0.7)'
                    : 'rgba(250,204,21,0.7)';
                return (
                  <div
                    className="no-place absolute z-30 flex items-stretch shadow-md"
                    onMouseEnter={() => setActionHover(true)}
                    onMouseLeave={() => setActionHover(false)}
                    style={{
                      top: aY,
                      left: 12,
                      transform: 'translateY(-50%)',
                      borderRadius: 6,
                      border: `1px solid ${borderCol}`,
                      background: bg,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Drag handle — only active in the pre-setup state */}
                    <div
                      role="slider"
                      title={hasOrder ? '' : 'Drag to set entry price'}
                      onPointerDown={dragActionHandle}
                      style={{
                        cursor: hasOrder ? 'default' : 'ns-resize',
                        width: 16,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'rgba(0,0,0,0.18)',
                        opacity: hasOrder ? 0.35 : 0.9,
                      }}
                    >
                      <svg width="9" height="14" viewBox="0 0 9 14" fill="none">
                        <circle cx="2" cy="3" r="1.1" fill="#000" />
                        <circle cx="7" cy="3" r="1.1" fill="#000" />
                        <circle cx="2" cy="7" r="1.1" fill="#000" />
                        <circle cx="7" cy="7" r="1.1" fill="#000" />
                        <circle cx="2" cy="11" r="1.1" fill="#000" />
                        <circle cx="7" cy="11" r="1.1" fill="#000" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      disabled={!isTradingAllowed}
                      title={!isTradingAllowed ? getDisabledReason
                            : side ? `Click to open ${side} at this price`
                            : 'Click to drop entry/SL/TP at this price · drag handle to reposition'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isTradingAllowed) return;
                        if (side) {
                          onRequestOpen(side);
                          return;
                        }
                        // Pre-setup click: commit the button's current
                        // price as entry and let the page-level state
                        // populate SL/TP (Long defaults — user can drag
                        // the V2 SL tag above entry to flip to Short).
                        const p = actionPrice as number;
                        placeSideAt('Long', p);
                      }}
                      style={{
                        background: 'transparent',
                        color: '#03150A',
                        padding: '5px 10px',
                        font: '700 11px/1 Inter, system-ui, sans-serif',
                        letterSpacing: '0.02em',
                        cursor: 'pointer',
                        border: 0,
                      }}
                    >
                      <span>{label}</span>
                      <span style={{ opacity: 0.75, marginLeft: 6 }} className="tabular-nums">
                        {fmt(actionPrice as number)}
                      </span>
                    </button>
                  </div>
                );
              })()}

              {/* V2 order overlay */}
              {hasOrder && (() => {
                const eY = geo.priceToY(entry);
                const tY = geo.priceToY(tp);
                const sY = geo.priceToY(sl);
                // The thin guide lines + profit/risk rail use the raw Y (they
                // get clipped by the overlay's overflow:hidden when off-screen).
                // The draggable tags, though, must stay reachable — pin them to
                // the plot edge when their price is outside the current zoom so
                // the user can always grab and drag them back. The label still
                // shows the true price.
                const TAG_PAD = 14;
                const clampTagY = (y: number) =>
                  Math.max(TAG_PAD, Math.min(Math.max(TAG_PAD, geo.plotH - TAG_PAD), y));
                const eTagY = clampTagY(eY);
                const tTagY = clampTagY(tY);
                const sTagY = clampTagY(sY);
                const side = inferredSide;
                return (
                  <>
                    <div className="no-place absolute" style={{
                      top: eY, left: 0, right: 0, transform: 'translateY(-50%)',
                      borderTop: `1px dashed ${side === 'sell' ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'}`,
                    }} />
                    <div className="no-place absolute" style={{
                      top: tY, left: 0, right: 0, transform: 'translateY(-50%)',
                      borderTop: '1px solid rgba(34,197,94,0.35)',
                    }} />
                    <div className="no-place absolute" style={{
                      top: sY, left: 0, right: 0, transform: 'translateY(-50%)',
                      borderTop: '1px solid rgba(239,68,68,0.35)',
                    }} />
                    <div className="no-place absolute" style={{ right: 0, top: 0, bottom: 0, width: 6, pointerEvents: 'none' }}>
                      <div style={{
                        position: 'absolute', right: 0, width: 6,
                        top: Math.min(eY, tY), height: Math.abs(tY - eY),
                        background: '#22c55e', opacity: 0.8,
                      }} />
                      <div style={{
                        position: 'absolute', right: 0, width: 6,
                        top: Math.min(eY, sY), height: Math.abs(sY - eY),
                        background: '#ef4444', opacity: 0.8,
                      }} />
                    </div>
                    <div
                      className="no-place absolute flex items-center gap-1 text-[11px] font-semibold tabular-nums rounded px-2 py-1"
                      style={{ top: tTagY, right: 10, transform: 'translateY(-50%)', background: '#22c55e', color: '#00140a',
                               cursor: 'ns-resize', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                      onPointerDown={vDrag('tp')}
                    >
                      <span className="text-[9px] font-bold tracking-wide">TP</span>
                      <b>{fmt(tp)}</b>
                    </div>
                    <div
                      className="no-place absolute flex items-center gap-1 text-[11px] font-semibold tabular-nums rounded px-2 py-1"
                      style={{ top: eTagY, right: 10, transform: 'translateY(-50%)', background: '#1B1B1B',
                               border: '1px solid rgba(255,255,255,0.2)',
                               boxShadow: `inset 3px 0 0 ${side === 'sell' ? '#ef4444' : '#22c55e'}, 0 2px 8px rgba(0,0,0,0.4)`,
                               cursor: 'ns-resize' }}
                      onPointerDown={vDrag('entry')}
                    >
                      <span className="text-[9px] font-bold tracking-wide opacity-85">
                        {side === 'sell' ? 'SELL' : 'BUY'}
                      </span>
                      <b>{fmt(entry)}</b>
                      <button
                        type="button"
                        className="ml-1 text-white/40 hover:text-white"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setOrderPrice(''); setTakeProfit(''); setStopLoss(''); }}
                      >✕</button>
                    </div>
                    <div
                      className="no-place absolute flex items-center gap-1 text-[11px] font-semibold tabular-nums rounded px-2 py-1"
                      style={{ top: sTagY, right: 10, transform: 'translateY(-50%)', background: '#ef4444', color: '#1a0000',
                               cursor: 'ns-resize', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                      onPointerDown={vDrag('sl')}
                    >
                      <span className="text-[9px] font-bold tracking-wide">SL</span>
                      <b>{fmt(sl)}</b>
                    </div>
                  </>
                );
              })()}
            </div>

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                Loading {exchange} candles…
              </div>
            )}
            {!loading && !candles.length && (loadError || (
              <span>No candles for {symbol} on {exchange}.</span>
            )) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-xs text-amber-300 px-4">
                <div className="font-semibold mb-1">Couldn&apos;t load {exchange.toUpperCase()} candles.</div>
                <div className="text-muted-foreground text-[11px] max-w-xs">
                  {loadError || `No data returned for ${symbol} at this timeframe. Try a different timeframe or switch back to TradingView.`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- helpers --------------------------------------------------------------

function nextId() {
  return 'd' + Date.now() + Math.random().toString(16).slice(2, 6);
}

function clampView(v: { start: number; end: number }, n: number) {
  if (n <= 1) return { start: 0, end: 1 };
  let span = v.end - v.start;
  if (span < MIN_VISIBLE) span = MIN_VISIBLE;
  if (span > n * 4) span = n * 4;
  let start = v.start;
  let end = start + span;
  // Allow panning a little past the right edge so you can see the live candle.
  const maxStart = n - 1 + span * 0.2;
  const minStart = -span * 0.2;
  if (start > maxStart) start = maxStart;
  if (start < minStart) start = minStart;
  end = start + span;
  return { start, end };
}

function roundToTick(p: number, tick: number) {
  if (!Number.isFinite(p) || !Number.isFinite(tick) || tick <= 0) return p;
  const r = Math.round(p / tick) * tick;
  // tickDecimals handles exponential notation correctly — using
  // tick.toString().split('.') alone fails for ticks like 1e-10 (no '.'
  // in the string, dp resolves to 0, and toFixed(0) wipes out the value
  // for sub-cent prices).
  const dp = Math.min(12, tickDecimals(tick));
  return +r.toFixed(dp);
}

function priceTicks(lo: number, hi: number) {
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return [];
  const target = span / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const muls = [1, 2, 5, 10];
  let step = mag;
  for (const m of muls) { step = mag * m; if (step >= target) break; }
  const out: number[] = [];
  const start = Math.ceil(lo / step) * step;
  for (let p = start; p <= hi; p += step) out.push(+p.toFixed(8));
  return out;
}

function timeTicks(candles: LiveCandle[], geo: { start: number; end: number; plotW?: number }) {
  if (!candles.length) return [] as { i: number; t: number }[];
  // Scale the number of time labels to the plot width so they don't run
  // together on narrow / mobile charts. ~85px per label keeps clear gaps.
  const plotW = geo.plotW ?? 600;
  const target = Math.max(2, Math.min(8, Math.round(plotW / 85)));
  const span = geo.end - geo.start;
  const step = Math.max(1, Math.floor(span / target));
  const out: { i: number; t: number }[] = [];
  const s = Math.max(0, Math.floor(geo.start));
  const e = Math.min(candles.length - 1, Math.ceil(geo.end));
  for (let i = s + step; i < e; i += step) out.push({ i, t: candles[i].t });
  return out;
}

function fmtPrice(p: number, tick?: number) {
  if (!Number.isFinite(p)) return '-';
  // Magnitude-derived minimum precision — guarantees a low-priced ticker
  // (0.0000xx) always shows enough decimals to be meaningful even if
  // tickSize hasn't loaded yet, or comes back at a coarse default.
  const magDp =
    p >= 1000 ? 1 :
    p >= 1    ? 3 :
    p >= 0.01 ? 6 :
                10;
  const tickDp = Number.isFinite(tick) && (tick as number) > 0
    ? tickDecimals(tick as number) : 0;
  // Use whichever is RICHER — never less precise than either source.
  const dp = Math.min(12, Math.max(tickDp, magDp));
  return p.toLocaleString('en-US', { maximumFractionDigits: dp });
}

function tickDecimals(tick: number): number {
  if (!Number.isFinite(tick) || tick <= 0) return 2;
  const s = tick.toString();
  if (s.includes('e-')) return Math.min(12, parseInt(s.split('e-')[1], 10));
  const dot = s.indexOf('.');
  return dot >= 0 ? Math.min(12, s.length - dot - 1) : 0;
}

function fmtClock(t: number, interval: string) {
  const d = new Date(t);
  const dayBased = interval === 'D' || interval === 'W' || interval === 'M' || /^\d+$/.test(interval) && parseInt(interval, 10) >= 1440;
  if (dayBased) {
    return `${String(d.getUTCMonth() + 1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
