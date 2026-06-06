import { useRef, useState, useEffect, useCallback } from "react";

interface ChartPoint {
  name: string;
  t: number;
  balance: number;
  benchmark?: number;
}

interface Props {
  data: ChartPoint[];
  timeframes: string[];
  activeTimeframe: string;
  onTimeframeChange: (tf: string) => void;
  loading?: boolean;
}

const fmtMoney = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${v.toFixed(0)}`;
};

/**
 * Portfolio performance chart (orange theme).
 *  - white "Portfolio" equity line with a diagonal-hatch area fill
 *  - yellow "Benchmark" line = the active goal's on-pace target path
 *  - a single draggable marker showing the portfolio return at that point
 */
const PortfolioPerformanceChart = ({
  data,
  timeframes,
  activeTimeframe,
  onTimeframeChange,
  loading,
}: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [H, setH] = useState(240);
  const padL = 6;
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
  const hasBench = data.some((d) => d.benchmark != null);
  const plotW = Math.max(1, width - padL - padR);
  const baseY = H - padB;
  const plotH = H - padT - padB;

  // Scale to the combined min..max of both series (small padding) so the curve
  // uses nearly the full height and small balance changes are visible.
  const vals: number[] = [];
  data.forEach((d) => {
    vals.push(d.balance);
    if (d.benchmark != null) vals.push(d.benchmark);
  });
  const dataMin = vals.length ? Math.min(...vals) : 0;
  const dataMax = vals.length ? Math.max(...vals) : 1;
  const span = dataMax - dataMin || Math.max(1, dataMax * 0.02);
  const padV = span * 0.08;
  const yMin = dataMin - padV;
  const yMax = dataMax + padV;
  const yRange = yMax - yMin || 1;

  const xAt = (i: number) => (N <= 1 ? padL + plotW / 2 : padL + (i / (N - 1)) * plotW);
  const yAt = (v: number) => baseY - ((v - yMin) / yRange) * plotH;

  const line = (key: "balance" | "benchmark") =>
    data
      .map((d, i) => {
        const v = key === "balance" ? d.balance : d.benchmark;
        if (v == null) return null;
        return `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(v)}`;
      })
      .filter(Boolean)
      .join(" ");

  const portfolioPath = line("balance");
  const benchPath = hasBench ? line("benchmark") : "";
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
  const pct = first > 0 ? ((selV - first) / first) * 100 : 0;
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
      {/* Header: heading + legend (left), timeframe tabs (right) */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-white/90 truncate">Portfolio Performance</span>
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-white/80">
            <span className="w-2 h-2 rounded-full bg-[#facc15]" /> Benchmark
          </span>
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-white/80">
            <span className="w-2 h-2 rounded-full bg-white" /> Portfolio
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                activeTimeframe === tf ? "bg-white text-[#e8590c]" : "text-white/70 hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={wrapRef} className="w-full flex-1 min-h-0 select-none">
        {loading ? (
          <div className="w-full h-full bg-white/10 animate-pulse rounded-lg" />
        ) : (
          <svg width="100%" height={H} style={{ display: "block", touchAction: "none" }}>
            <defs>
              <pattern id="pp-hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="2.5" />
              </pattern>
            </defs>

            {/* Portfolio hatch area */}
            {areaPath && <path d={areaPath} fill="url(#pp-hatch)" />}

            {/* Baseline */}
            <line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />

            {/* Benchmark line (goal pace) */}
            {benchPath && (
              <path d={benchPath} fill="none" stroke="#facc15" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Portfolio line */}
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
                  <text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight={500} fill={up ? "#86efac" : "#fca5a5"}>
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

export default PortfolioPerformanceChart;
