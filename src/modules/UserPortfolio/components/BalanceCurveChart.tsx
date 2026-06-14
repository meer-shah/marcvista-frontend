import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";

interface ChartPoint {
  name: string;
  balance: number;
}

interface Props {
  data: ChartPoint[];
  loading?: boolean;
  /** Optional controls rendered at the right of the chart header. */
  controls?: ReactNode;
}

const fmtMoney = (v: number) => {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}$${a.toFixed(0)}`;
};

/**
 * Balance-over-trades curve — the same orange / white diagonal-hatch visual as
 * the Dashboard's PortfolioPerformanceChart, but without the benchmark line or
 * the timeframe tabs (this curve is per-trade, not time-windowed).
 *  - white equity line with a hatched area fill
 *  - a single draggable marker showing the % change from the start at that point
 */
const BalanceCurveChart = ({ data, loading, controls }: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [H, setH] = useState(240);
  const padL = 42; // room for the Y-axis balance labels
  const padR = 6;
  const padT = 8;
  const padB = 16;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setWidth(e.contentRect.width);
        if (e.contentRect.height > 0) setH(Math.round(e.contentRect.height));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const N = data.length;
  const plotW = Math.max(1, width - padL - padR);
  const baseY = H - padB;
  const plotH = H - padT - padB;

  // Scale to the data's min..max (small padding) so the curve uses nearly the
  // full height and small balance changes stay visible.
  const vals = data.map((d) => d.balance);
  const dataMin = vals.length ? Math.min(...vals) : 0;
  const dataMax = vals.length ? Math.max(...vals) : 1;
  const span = dataMax - dataMin || Math.max(1, Math.abs(dataMax) * 0.02);
  const padV = span * 0.08;
  const yMin = dataMin - padV;
  const yMax = dataMax + padV;
  const yRange = yMax - yMin || 1;

  // Y-axis tick values spanning the actual balance range.
  const Y_TICKS = 4;
  const yTickVals = Array.from(
    { length: Y_TICKS + 1 },
    (_, k) => dataMin + (k / Y_TICKS) * (dataMax - dataMin)
  );

  const xAt = (i: number) => (N <= 1 ? padL + plotW / 2 : padL + (i / (N - 1)) * plotW);
  const yAt = (v: number) => baseY - ((v - yMin) / yRange) * plotH;

  const portfolioPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(d.balance)}`)
    .join(" ");
  const areaPath =
    N > 0 ? `${portfolioPath} L${xAt(N - 1)},${baseY} L${xAt(0)},${baseY} Z` : "";

  // Single draggable marker.
  const [sel, setSel] = useState(0);
  useEffect(() => {
    setSel(N <= 1 ? 0 : Math.round((N - 1) * 0.5));
  }, [N]);

  const drag = useRef(false);
  const idxFromClientX = useCallback(
    (clientX: number) => {
      const el = wrapRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left - padL;
      const frac = Math.max(0, Math.min(1, x / plotW));
      return Math.round(frac * (N - 1));
    },
    [plotW, N]
  );
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      setSel(idxFromClientX(e.clientX));
    };
    const up = () => {
      drag.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [idxFromClientX]);

  const first = data[0]?.balance ?? 0;
  const selV = data[sel]?.balance ?? 0;
  const pct = first !== 0 ? ((selV - first) / Math.abs(first)) * 100 : 0;
  const up = pct >= 0;

  // Axis labels — de-duplicated and spaced.
  const labelTicks: number[] = [];
  {
    let lastX = -Infinity;
    let lastLabel: string | null = null;
    for (let i = 0; i < N; i++) {
      const x = xAt(i);
      if (data[i].name !== lastLabel && x - lastX >= 44) {
        labelTicks.push(i);
        lastX = x;
        lastLabel = data[i].name;
      }
    }
  }

  return (
    <div className="relative rounded-2xl bg-[#e8590c] text-white p-3 border border-white/10 h-full flex flex-col overflow-hidden">
      {/* Header: heading + legend (left), optional controls (right) */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-white/90 truncate">Balance Over Trades</span>
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-white/80">
            <span className="w-2 h-2 rounded-full bg-white" /> Balance
          </span>
        </div>
        {controls && <div className="flex items-center gap-2 shrink-0">{controls}</div>}
      </div>

      {/* Chart */}
      <div ref={wrapRef} className="w-full flex-1 min-h-0 select-none">
        {loading ? (
          <div className="w-full h-full bg-white/10 animate-pulse rounded-lg" />
        ) : (
          <svg width="100%" height={H} style={{ display: "block", touchAction: "none" }}>
            <defs>
              <pattern id="bc-hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="2.5" />
              </pattern>
            </defs>

            {/* Y-axis: gridlines + balance labels */}
            {yTickVals.map((v, k) => (
              <g key={`y-${k}`}>
                <line x1={padL} y1={yAt(v)} x2={padL + plotW} y2={yAt(v)} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
                <text x={padL - 5} y={yAt(v) + 3} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.8)">
                  {fmtMoney(v)}
                </text>
              </g>
            ))}

            {/* Hatched area under the equity line */}
            {areaPath && <path d={areaPath} fill="url(#bc-hatch)" />}

            {/* Baseline */}
            <line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />

            {/* Equity line */}
            {portfolioPath && (
              <path d={portfolioPath} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Axis labels */}
            {labelTicks.map((i) => (
              <text key={i} x={xAt(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.8)">
                {data[i].name}
              </text>
            ))}

            {/* Draggable marker */}
            {N > 0 && (
              <g>
                <line
                  x1={xAt(sel)}
                  y1={padT}
                  x2={xAt(sel)}
                  y2={baseY}
                  stroke="rgba(255,255,255,0.7)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
                {/* % badge */}
                <g transform={`translate(${Math.max(34, Math.min(plotW - 34 + padL, xAt(sel)))}, ${Math.max(16, yAt(selV) - 26)})`}>
                  <rect x={-32} y={-12} width={64} height={24} rx={6} fill="#1a0a00" fillOpacity={0.85} />
                  <text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight={500} fill={up ? "#22c55e" : "#ef4444"}>
                    {up ? "+" : ""}{pct.toFixed(2)}%
                  </text>
                </g>
                <circle
                  cx={xAt(sel)}
                  cy={yAt(selV)}
                  r={6}
                  fill="#e8590c"
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    drag.current = true;
                  }}
                />
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
};

export default BalanceCurveChart;
