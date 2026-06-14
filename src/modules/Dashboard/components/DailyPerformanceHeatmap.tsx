import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, TrendingUp, TrendingDown } from "lucide-react";
import { orderApi } from "@/lib/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const DURATIONS = [
  { label: "1 Month", months: 1 },
  { label: "2 Months", months: 2 },
  { label: "3 Months", months: 3 },
  { label: "6 Months", months: 6 },
  { label: "1 Year", months: 12 },
];

const fmtCurrency = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const colorFor = (pnl: number | undefined, maxAbs: number) => {
  if (pnl === undefined) return { bg: "#1c1c1c", text: "#4b5563" };
  if (pnl === 0) return { bg: "#e5e7eb", text: "#1a1a1a" };
  const r = maxAbs > 0 ? pnl / maxAbs : 0;
  if (r >= 0.6) return { bg: "#22c55e", text: "#04210f" };
  if (r >= 0.25) return { bg: "#4ade80", text: "#04210f" };
  if (r > 0) return { bg: "#bbf7d0", text: "#065f46" };
  if (r > -0.25) return { bg: "#fbbf24", text: "#3a2e00" };
  if (r > -0.6) return { bg: "#fb923c", text: "#3a1c00" };
  return { bg: "#f0443a", text: "#ffffff" };
};

type Tip = { text: string; sub: string; x: number; y: number } | null;

const DailyPerformanceHeatmap = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tip, setTip] = useState<Tip>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await orderApi.getMyTrades();
        if (alive) setTrades(Array.isArray(data) ? data : data?.trades ?? []);
      } catch {
        if (alive) setTrades([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const model = useMemo(() => {
    const dated = trades
      .map((t) => ({
        d: new Date(t.closedAt || t.placedAt || t.updatedAt || 0),
        pnl: parseFloat(t.closedPnl ?? t.pnl ?? 0),
        balanceBefore: Number(t.balanceBefore) || 0,
      }))
      .filter((x) => !isNaN(x.d.getTime()) && x.d.getTime() > 0)
      .sort((a, b) => a.d.getTime() - b.d.getTime());

    const daily: Record<string, number> = {};
    for (const x of dated) daily[keyOf(x.d)] = (daily[keyOf(x.d)] || 0) + x.pnl;

    const ref = dated.length ? dated[dated.length - 1].d : new Date();
    const rangeEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const rangeStart = new Date(ref.getFullYear(), ref.getMonth() - (months - 1), 1);

    let rangePnl = 0, active = 0, winDays = 0, lossDays = 0, maxAbs = 0;
    for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
      const v = daily[keyOf(d)];
      if (v !== undefined) {
        rangePnl += v; active++;
        if (v > 0) winDays++; else if (v < 0) lossDays++;
        if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
      }
    }
    const inRange = dated.filter((x) => x.d >= rangeStart && x.d <= rangeEnd);
    const startBalance = inRange.length ? inRange[0].balanceBefore : 0;
    const pct = startBalance > 0 ? (rangePnl / startBalance) * 100 : 0;

    // 1-month calendar cells
    const y = ref.getFullYear(), m = ref.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const prev = new Date(y, m, 0).getDate();
    const calCells: { d: Date; label: number; adjacent: boolean }[] = [];
    for (let i = firstDow - 1; i >= 0; i--) calCells.push({ d: new Date(y, m - 1, prev - i), label: prev - i, adjacent: true });
    for (let dd = 1; dd <= dim; dd++) calCells.push({ d: new Date(y, m, dd), label: dd, adjacent: false });
    let n = 1;
    while (calCells.length % 7 !== 0) calCells.push({ d: new Date(y, m + 1, n), label: n++, adjacent: true });
    const calRows = calCells.length / 7;

    // Multi-month: chronological day list (Sunday-aligned)
    const gridStart = addDays(rangeStart, -rangeStart.getDay());
    const gridEnd = addDays(rangeEnd, 6 - rangeEnd.getDay());
    const days: Date[] = [];
    for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) days.push(new Date(d));
    const numWeeks = days.length / 7;

    return {
      daily, ref, rangeStart, rangeEnd, rangePnl, active, winDays, lossDays, maxAbs, pct,
      hasData: dated.length > 0, calCells, calRows, days, numWeeks,
    };
  }, [trades, months]);

  const up = model.rangePnl >= 0;
  const rangeLabel =
    months === 1
      ? `${MONTHS[model.ref.getMonth()]} ${model.ref.getFullYear()}`
      : `${MON_SHORT[model.rangeStart.getMonth()]} – ${MON_SHORT[model.rangeEnd.getMonth()]} ${model.rangeEnd.getFullYear()}`;
  const subtitle = !model.hasData
    ? "No closed trades recorded yet."
    : `${rangeLabel}: ${model.active} active day${model.active === 1 ? "" : "s"}, ${model.winDays}W / ${model.lossDays}L · net ${up ? "+" : "−"}${fmtCurrency(Math.abs(model.rangePnl)).replace("-", "")}.`;

  const showTip = (e: React.MouseEvent, d: Date, pnl: number | undefined) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({
      text: `${MON_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      sub: pnl === undefined ? "No trades" : fmtCurrency(pnl),
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={cardRef}
      className="relative w-full h-[360px] lg:h-full lg:min-h-[300px] flex flex-col rounded-2xl bg-[#0a0a0a] border border-white/[0.06] overflow-hidden shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)] p-5"
      onMouseLeave={() => setTip(null)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-300">Daily Performance</h3>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-xs font-medium text-gray-200 transition-colors"
          >
            {DURATIONS.find((x) => x.months === months)?.label}
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 z-20 w-32 rounded-xl bg-[#1c1c1c] border border-white/10 shadow-xl py-1">
              {DURATIONS.map((d) => (
                <button
                  key={d.months}
                  onClick={() => { setMonths(d.months); setMenuOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                    d.months === months ? "text-primary font-medium" : "text-gray-300"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Total + badge */}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span className="text-xl sm:text-[26px] leading-none font-medium text-white tracking-tight">
          {loading ? "—" : fmtCurrency(model.rangePnl)}
        </span>
        {!loading && model.pct !== 0 && (
          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${up ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(model.pct).toFixed(2)}%
          </span>
        )}
      </div>
      <p className="text-[12px] leading-snug text-gray-400 mt-1.5 line-clamp-2">{subtitle}</p>

      {/* Heatmap — fills the remaining space, identical footprint for every duration */}
      <div className="flex-1 min-h-0 mt-3">
        {loading ? (
          <div className="w-full h-full grid grid-cols-7 grid-rows-5 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="rounded-md bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : months === 1 ? (
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5 shrink-0">
              {DOW.map((w, i) => (
                <div key={i} className="text-center text-[10px] font-medium text-gray-500">{w}</div>
              ))}
            </div>
            <div
              className="grid grid-cols-7 gap-1.5 flex-1 min-h-0"
              style={{ gridTemplateRows: `repeat(${model.calRows}, 1fr)` }}
            >
              {model.calCells.map((c, i) => {
                if (c.adjacent) {
                  return (
                    <div key={i} className="rounded-md flex items-center justify-center text-[11px] font-medium"
                      style={{ background: "#242424", color: "#5a5a5a" }}>
                      {c.label}
                    </div>
                  );
                }
                const pnl = model.daily[keyOf(c.d)];
                const { bg, text } = colorFor(pnl, model.maxAbs);
                return (
                  <div key={i}
                    onMouseEnter={(e) => showTip(e, c.d, pnl)}
                    onMouseMove={(e) => showTip(e, c.d, pnl)}
                    className="rounded-md flex items-center justify-center text-[11px] font-medium cursor-pointer"
                    style={{ background: bg, color: text }}>
                    {c.label}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5 h-full">
            <div className="flex flex-col shrink-0" style={{ width: 16 }}>
              {DOW.map((w, i) => (
                <div key={i} className="flex-1 flex items-center text-[9px] text-gray-600 leading-none">
                  {i % 2 === 1 ? w : ""}
                </div>
              ))}
            </div>
            <div
              className="flex-1 min-w-0 grid gap-[3px]"
              style={{ gridTemplateRows: "repeat(7, 1fr)", gridAutoFlow: "column", gridAutoColumns: "1fr" }}
            >
              {model.days.map((d, i) => {
                const inRange = d >= model.rangeStart && d <= model.rangeEnd;
                const pnl = model.daily[keyOf(d)];
                const bg = inRange ? colorFor(pnl, model.maxAbs).bg : "#141414";
                return (
                  <div key={i}
                    onMouseEnter={(e) => inRange && showTip(e, d, pnl)}
                    onMouseMove={(e) => inRange && showTip(e, d, pnl)}
                    style={{ background: bg, borderRadius: 2 }}
                    className={inRange ? "cursor-pointer" : ""} />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      {tip && (
        <div
          className="pointer-events-none absolute z-30 px-2.5 py-1.5 rounded-lg bg-black/90 border border-white/15 shadow-xl -translate-x-1/2 -translate-y-full"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          <div className="text-[10px] text-gray-400 whitespace-nowrap">{tip.text}</div>
          <div className="text-[12px] font-medium text-white whitespace-nowrap">{tip.sub}</div>
        </div>
      )}
    </div>
  );
};

export default DailyPerformanceHeatmap;
