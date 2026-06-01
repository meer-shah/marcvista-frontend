import { useRef, useState, useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";

interface ChartPoint {
  name: string;
  balance: number;
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
 * Fully custom SVG portfolio chart (no chart library).
 *  - pale-blue bar histogram across the whole range
 *  - blue area overlay over the selected range (actual performance)
 *  - two draggable round handles on the axis to pick a range between two
 *    timestamps; the header shows the performance between them
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
  // Height is measured from the container so the chart fills whatever height
  // the card is given (the grid sizes the card to match the goals card).
  const [H, setH] = useState(240);
  const padL = 12;
  const padR = 12;
  const padT = 34; // room for the value tooltips
  const padB = 30; // room for month labels + handles

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
  const maxBal = Math.max(1, ...data.map((d) => d.balance));
  const plotW = Math.max(1, width - padL - padR);
  const baseY = H - padB;
  const plotH = H - padT - padB;

  const xAt = (i: number) => (N <= 1 ? padL + plotW / 2 : padL + (i / (N - 1)) * plotW);
  const yAt = (v: number) => baseY - (v / maxBal) * plotH;

  // Selected range as data indices. Reset to a middle band whenever the
  // dataset changes (e.g. timeframe switch) so handles never point at stale rows.
  const [sel, setSel] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  useEffect(() => {
    if (N <= 1) {
      setSel({ a: 0, b: Math.max(0, N - 1) });
      return;
    }
    setSel({ a: Math.round((N - 1) * 0.33), b: Math.round((N - 1) * 0.72) });
  }, [N]);

  const lo = Math.min(sel.a, sel.b);
  const hi = Math.max(sel.a, sel.b);

  const drag = useRef<"a" | "b" | null>(null);

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
      const idx = idxFromClientX(e.clientX);
      setSel((prev) => (drag.current === "a" ? { ...prev, a: idx } : { ...prev, b: idx }));
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [idxFromClientX]);

  const gap = plotW / Math.max(1, N - 1);
  const barW = Math.max(1, Math.min(10, gap * 0.6));

  // Area path over the selected range.
  const sliced = data.slice(lo, hi + 1).map((d, k) => ({ x: xAt(lo + k), y: yAt(d.balance) }));
  const linePath = sliced.map((p, k) => (k === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const areaPath = sliced.length ? `${linePath} L${xAt(hi)},${baseY} L${xAt(lo)},${baseY} Z` : "";

  const av = data[lo]?.balance ?? 0;
  const bv = data[hi]?.balance ?? 0;
  const latest = data[N - 1]?.balance ?? 0;
  const pct = av > 0 ? (bv - av) / av * 100 : 0;
  const up = pct >= 0;

  // Axis ticks: show a label when it changes from the previous shown one and
  // there's at least ~44px of room — keeps the dense histogram readable.
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
    <div className="rounded-2xl bg-[#1B1B1B] text-white p-5 border border-white/10 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <button className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
          <div>
            <div className="text-sm text-gray-400 mb-1">Portfolio Performance</div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold tracking-tight">{fmtMoney(latest)}</span>
              <span className={`text-sm font-semibold ${up ? "text-green-500" : "text-red-500"}`}>
                {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Timeframe tabs */}
        <div className="flex items-center gap-0.5 shrink-0">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTimeframe === tf ? "bg-white text-gray-900" : "text-gray-400 hover:text-white"
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
          <div className="w-full h-full bg-white/5 animate-pulse rounded-lg" />
        ) : (
          <svg width="100%" height={H} style={{ display: "block", touchAction: "none" }}>
            <defs>
              <linearGradient id="ppFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            {/* Selection band */}
            <rect
              x={xAt(lo)}
              y={padT}
              width={Math.max(0, xAt(hi) - xAt(lo))}
              height={plotH}
              fill="rgba(96,165,250,0.10)"
            />

            {/* Bars */}
            {data.map((d, i) => {
              const h = (d.balance / maxBal) * plotH;
              const inSel = i >= lo && i <= hi;
              return (
                <rect
                  key={i}
                  x={xAt(i) - barW / 2}
                  y={baseY - h}
                  width={barW}
                  height={Math.max(0, h)}
                  rx={2}
                  fill={inSel ? "#60a5fa" : "rgba(96,165,250,0.22)"}
                />
              );
            })}

            {/* Actual-performance area over the selection */}
            {areaPath && <path d={areaPath} fill="url(#ppFill)" />}
            {linePath && <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth={2} />}

            {/* Baseline */}
            <line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

            {/* Axis labels */}
            {labelTicks.map((i) => (
              <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#9ca3af">
                {data[i].name}
              </text>
            ))}

            {/* Draggable handles + value tooltips */}
            {([
              { k: "a" as const, i: sel.a },
              { k: "b" as const, i: sel.b },
            ]).map(({ k, i }) => {
              const cx = xAt(i);
              const v = data[i]?.balance ?? 0;
              const ty = Math.max(padT - 6, yAt(v) - 30);
              return (
                <g key={k}>
                  <line x1={cx} y1={padT} x2={cx} y2={baseY} stroke="#3b82f6" strokeWidth={1.5} />
                  {/* value tooltip */}
                  <g transform={`translate(${Math.max(46, Math.min(plotW - 46 + padL, cx))}, ${ty})`}>
                    <rect x={-42} y={-11} width={84} height={22} rx={6} fill="#0A0A0A" stroke="rgba(255,255,255,0.15)" />
                    <text x={0} y={4} textAnchor="middle" fontSize={10} fill="#ffffff">
                      <tspan fill="#9ca3af">Actual </tspan>
                      <tspan fontWeight={600}>{fmtMoney(v)}</tspan>
                    </text>
                  </g>
                  <circle cx={cx} cy={yAt(v)} r={3.5} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
                  {/* handle on the axis (drag target) */}
                  <circle
                    cx={cx}
                    cy={baseY}
                    r={9}
                    fill="#ffffff"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    style={{ cursor: "ew-resize" }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      drag.current = k;
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};

export default PortfolioPerformanceChart;
