import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from "framer-motion";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Treemap } from "recharts";
import { Trash2 } from "lucide-react";
import { portfolioSummaryApi, orderApi, connectionApi } from "@/lib/api";
// orderApi.getMyTrades() is the canonical Trade collection — used for win/loss, long/short
import { toast } from "sonner";
import BalanceCurveChart from "@/modules/UserPortfolio/components/BalanceCurveChart";
import CubeBar from "@/modules/UserPortfolio/components/CubeBar";
import { MotionCard, ExchangeBadge, TradeBadge } from "@/components/common";

interface PortfolioSummary {
  balance: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  winRate: number;
  totalTrades: number;
  avgTradeProfit: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  bestCoins: { symbol: string; pnl: number }[];
  worstCoins: { symbol: string; pnl: number }[];
  tradingVolumePerCoin: { symbol: string; volume: number; percentage: number }[];
  monthlyProfit: { month: string; profit: number }[];
  longShortData: { name: string; value: number; fill: string }[];
}

// ── Trading-volume heatmap (treemap) ──────────────────────────────────────
// Renders volume-per-coin as a heatmap: each coin is a tile sized by its
// volume share AND shaded on a brand-orange intensity scale (brighter = more
// volume). sqrt spreads the low end so small-volume coins stay visible.
const volumeShade = (ratio: number) => {
  const t = Math.sqrt(Math.max(0, Math.min(1, ratio)));
  // 3-stop gradient: white (lowest) → yellow (mid) → brand orange (highest)
  const white = [255, 255, 255], yellow = [250, 204, 21], orange = [232, 89, 12];
  const mix = (a: number[], b: number[], u: number) =>
    `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * u)).join(', ')})`;
  return t < 0.5 ? mix(white, yellow, t / 0.5) : mix(yellow, orange, (t - 0.5) / 0.5);
};

// Treemap leaf renderer. recharts clones this element and injects the node's
// layout (x/y/width/height) + the original datum fields (symbol/percentage/volume).
const VolumeHeatCell = (props: any) => {
  const { x, y, width, height, maxPct } = props;
  const symbol = String(props.symbol ?? props.name ?? '');
  const pct = Number(props.percentage ?? props.value ?? 0);
  const volume = Number(props.volume ?? 0);
  const ratio = maxPct > 0 ? pct / maxPct : 0;
  const showLabel = width > 46 && height > 26;
  const showPct = width > 46 && height > 42;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} ry={4} fill={volumeShade(ratio)} stroke="#0a0a0a" strokeWidth={2} />
      <title>{`${symbol}: ${pct.toFixed(1)}%${volume ? ` · vol ${volume.toLocaleString()}` : ''}`}</title>
      {showLabel && (
        <text x={x + 7} y={y + 17} fill="#2a1500" fontSize={11} fontWeight={600}>{symbol}</text>
      )}
      {showPct && (
        <text x={x + 7} y={y + 31} fill="rgba(42,21,0,0.7)" fontSize={10}>{pct.toFixed(1)}%</text>
      )}
    </g>
  );
};

const UserPortfolioPage = () => {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [trades, setTrades] = useState<any[]>([]); // Closed trade history
  const [loading, setLoading] = useState(true);
  const [includeExternal, setIncludeExternal] = useState<boolean>(true);
  // PAGE-WIDE exchange filter — applies to balance, stats, charts, AND
  // trade breakdown. 'all' = cumulative across every connected exchange.
  const [exchangeFilter, setExchangeFilter] = useState<string>('all');
  // Per-exchange balances + total, refreshed alongside the portfolio summary.
  const [exchangeBalances, setExchangeBalances] = useState<{ total: number; balances: Array<{ exchange: string; balance: number; mode: string; ok: boolean }> }>({ total: 0, balances: [] });
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  const fetchPortfolioSummary = async (includeExternalOverride?: boolean) => {
    try {
      const data = await portfolioSummaryApi.getSummary({
        includeExternal: includeExternalOverride ?? includeExternal,
      });
      setSummary(data);
    } catch (err: any) {
      console.error('Error fetching portfolio summary:', err);
      toast.error(err.message || 'Failed to fetch portfolio summary');
    }
  };

  const fetchTrades = async () => {
    try {
      const data = await orderApi.getMyTrades();
      setTrades(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching trades:', err);
      setTrades([]);
    }
  };

  const fetchExchangeBalances = async () => {
    try {
      const data = await connectionApi.getAllBalances();
      setExchangeBalances(data || { total: 0, balances: [] });
    } catch { /* tolerate */ }
  };

  // Polling function to update data without loading indicator.
  // Uses allSettled so one failing endpoint doesn't blank the entire view.
  const pollAllData = useCallback(async () => {
    // NOTE: positions are intentionally NOT fetched here — this page never
    // renders live positions (long/short stats derive from `trades`), so the
    // old getPositions() call was a redundant external broker round-trip on a
    // 5s cadence. portfolio-summary already carries positions if ever needed.
    const [summaryRes, tradesRes, balancesRes] = await Promise.allSettled([
      portfolioSummaryApi.getSummary({ includeExternal }),
      orderApi.getMyTrades(),
      connectionApi.getAllBalances(),
    ]);
    if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
    if (tradesRes.status === 'fulfilled') {
      setTrades(Array.isArray(tradesRes.value) ? tradesRes.value : []);
    }
    if (balancesRes.status === 'fulfilled') setExchangeBalances(balancesRes.value);
  }, [includeExternal]);

  // Initial data fetch on mount
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      await Promise.allSettled([
        fetchPortfolioSummary(),
        fetchTrades(),
        fetchExchangeBalances(),
      ]);
      setLoading(false);
    };
    fetchAllData();
  }, []);

  // Set up polling for real-time updates.
  // Skip ticks while the tab is hidden (iOS Safari battery / backgrounded
  // tab) and force one fresh fetch on re-visibility so the user sees current
  // data immediately without waiting for the next interval.
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pollAllData();
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pollAllData();
    };
    const onTradeUpdated = () => { pollAllData(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('marcvista:trade-updated', onTradeUpdated);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('marcvista:trade-updated', onTradeUpdated);
    };
  }, [pollAllData]);

  // Refetch summary when external-trade toggle flips so server-computed metrics match.
  useEffect(() => {
    fetchPortfolioSummary(includeExternal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeExternal]);

  // Filtered trades honour:
  //   1. external-toggle (app-only vs include exchange-synced trades)
  //   2. PAGE-WIDE exchangeFilter ('all' or a specific exchange id)
  // Includes Pending so the Trade Breakdown can show in-flight trades. Consumers
  // that count completed outcomes (win/loss stats, balance curve, coin PnL) should
  // use `closedVisibleTrades` instead so Pending doesn't inflate counts.
  const visibleTrades = React.useMemo(() => {
    let out = trades;
    if (!includeExternal) out = out.filter(t => (t.source || 'app') === 'app');
    if (exchangeFilter !== 'all') out = out.filter(t => (t.exchange || 'bybit') === exchangeFilter);
    return out;
  }, [trades, includeExternal, exchangeFilter]);
  const closedVisibleTrades = React.useMemo(
    () => visibleTrades.filter(t => t.outcome === 'Win' || t.outcome === 'Loss'),
    [visibleTrades]
  );

  const externalTradeCount = trades.filter(t => t.source === 'external').length;

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      const res = await orderApi.clearTradeHistory();
      toast.success(`Cleared ${res.deletedCount ?? 0} trades.`);
      setTrades([]);
      await fetchPortfolioSummary(includeExternal);
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear trade history');
    } finally {
      setClearingHistory(false);
      setShowClearHistoryDialog(false);
    }
  };


  // Compute long/short stats from closed trade history
  const longShortStats = (() => {
    const longTrades = closedVisibleTrades.filter(t => (t.side === 'Buy' || t.side === 'Long'));
    const shortTrades = closedVisibleTrades.filter(t => (t.side === 'Sell' || t.side === 'Short'));
    const longPnl = longTrades.reduce((sum, t) => sum + parseFloat(t.closedPnl ?? t.pnl ?? 0), 0);
    const shortPnl = shortTrades.reduce((sum, t) => sum + parseFloat(t.closedPnl ?? t.pnl ?? 0), 0);
    const longProfit = longTrades.reduce((sum, t) => { const v = parseFloat(t.closedPnl ?? t.pnl ?? 0); return sum + (v > 0 ? v : 0); }, 0);
    const longLoss = longTrades.reduce((sum, t) => { const v = parseFloat(t.closedPnl ?? t.pnl ?? 0); return sum + (v < 0 ? v : 0); }, 0);
    const shortProfit = shortTrades.reduce((sum, t) => { const v = parseFloat(t.closedPnl ?? t.pnl ?? 0); return sum + (v > 0 ? v : 0); }, 0);
    const shortLoss = shortTrades.reduce((sum, t) => { const v = parseFloat(t.closedPnl ?? t.pnl ?? 0); return sum + (v < 0 ? v : 0); }, 0);
    return { longCount: longTrades.length, shortCount: shortTrades.length, longPnl, shortPnl, longProfit, longLoss, shortProfit, shortLoss };
  })();

  // ── All-profiles performance (mirrors RealPerformancePage, uses visibleTrades) ──
  const fmt2 = (n: number) => (n ?? 0).toFixed(2);

  // Closed trades only — drives the balance curve and summary stats.
  const perfTrades = React.useMemo(() => {
    return [...visibleTrades]
      .filter(t => t.outcome === 'Win' || t.outcome === 'Loss')
      .sort((a, b) => {
        const at = Number(new Date(a.placedAt || a.closedAt || 0));
        const bt = Number(new Date(b.placedAt || b.closedAt || 0));
        return at - bt;
      });
  }, [visibleTrades]);

  // Pending trades (in-flight) — shown at the top of Trade Breakdown so the
  // user sees their just-placed order immediately. Excluded from summary stats.
  const pendingTrades = React.useMemo(() => {
    return [...visibleTrades]
      .filter(t => t.outcome === 'Pending')
      .sort((a, b) => {
        const at = Number(new Date(a.placedAt || 0));
        const bt = Number(new Date(b.placedAt || 0));
        return bt - at; // newest first
      });
  }, [visibleTrades]);

  const allProfilesPerf = React.useMemo(() => {
    if (perfTrades.length === 0 && pendingTrades.length === 0) return null;

    // Starting equity for the balance curve. App-placed trades record
    // `balanceBefore`, but external/synced trades don't — that left the baseline
    // at 0, which made the curve start at 0 (and run negative) and forced Max
    // Drawdown to 0 (peak never rose above 0). When `balanceBefore` is missing,
    // reconstruct the real starting equity = live balance − net realised PnL.
    const firstBalanceBefore = Number((perfTrades[0] || pendingTrades[0])?.balanceBefore) || 0;
    const netRealisedPnl = perfTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
    const liveBalance = Number(summary?.balance) || 0;
    const startingBalance = firstBalanceBefore > 0
      ? firstBalanceBefore
      : (liveBalance > 0 ? liveBalance - netRealisedPnl : 0);
    let running = startingBalance;
    let maxBalance = startingBalance;
    let minBalance = startingBalance;
    let peak = startingBalance;
    let maxDrawdown = 0;
    let wins = 0, losses = 0, totalProfit = 0, totalLoss = 0;

    const balanceOverTrades: { trade: number; balance: number }[] = [
      { trade: 0, balance: startingBalance },
    ];
    const closedDetails = perfTrades.map((t, i) => {
      const pnl = Number(t.pnl) || 0;
      running += pnl;
      if (pnl > 0) { wins++; totalProfit += pnl; }
      else { losses++; totalLoss += Math.abs(pnl); }
      if (running > maxBalance) maxBalance = running;
      if (running < minBalance) minBalance = running;
      if (running > peak) peak = running;
      const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
      balanceOverTrades.push({ trade: i + 1, balance: running });

      const entry = Number(t.entryPrice) || 0;
      const sl = t.stopLoss != null ? Number(t.stopLoss) : null;
      const tp = t.takeProfit != null ? Number(t.takeProfit) : null;
      let rr = '—';
      if (sl != null && tp != null && entry) {
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(tp - entry);
        if (risk > 0) rr = `1:${(reward / risk).toFixed(2)}`;
      }

      return {
        tradeNumber: t.tradeNumber || i + 1,
        date: t.closedAt || t.placedAt,
        symbol: t.symbol,
        side: t.side,
        source: (t.source || 'app') as 'app' | 'external',
        riskProfileName: t.riskProfileName || '—',
        riskPercent: t.riskPercent ?? null,
        rr,
        sl, tp, entry,
        pnl,
        payout: Number(t.payout) || 0,
        fees: t.fees != null ? Number(t.fees) : (t.cumExecFee != null ? Number(t.cumExecFee) : null),
        outcome: t.outcome,
        exchange: t.exchange || 'bybit',
        balanceAfter: running,
      };
    });

    // Build pending rows — pnl=0, balanceAfter shows projected (no change yet).
    const pendingDetails = pendingTrades.map((t) => {
      const entry = Number(t.entryPrice) || 0;
      const sl = t.stopLoss != null ? Number(t.stopLoss) : null;
      const tp = t.takeProfit != null ? Number(t.takeProfit) : null;
      let rr = '—';
      if (sl != null && tp != null && entry) {
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(tp - entry);
        if (risk > 0) rr = `1:${(reward / risk).toFixed(2)}`;
      }
      return {
        tradeNumber: t.tradeNumber || '·',
        date: t.placedAt,
        symbol: t.symbol,
        side: t.side,
        source: (t.source || 'app') as 'app' | 'external',
        riskProfileName: t.riskProfileName || '—',
        riskPercent: t.riskPercent ?? null,
        rr,
        sl, tp, entry,
        pnl: 0,
        payout: 0,
        fees: null,
        outcome: 'Pending' as const,
        exchange: t.exchange || 'bybit',
        balanceAfter: running, // unchanged until close
      };
    });

    // Chronological: oldest closed trade first → newest at the bottom, with any
    // in-flight pending trades after them. The table auto-scrolls to the bottom
    // (see effect below) so the most recent trades are what you see by default.
    const tradeDetails = [...closedDetails, ...pendingDetails];

    const totalTrades = wins + losses;
    return {
      summary: {
        winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
        totalProfit,
        totalLoss,
        netProfit: totalProfit - totalLoss,
        wins,
        losses,
        finalBalance: running,
        maxBalance,
        minBalance,
        maxDrawdown,
      },
      balanceOverTrades,
      tradeDetails,
    };
  }, [perfTrades, pendingTrades, summary?.balance]);

  // Keep the Trade Breakdown table scrolled to the bottom by default — the
  // table is chronological (newest last), so the most recent trades are the
  // ones in view without the user having to scroll.
  const tradeTableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tradeTableRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [allProfilesPerf?.tradeDetails]);

  // Compute best/worst coins from CLOSED trade history (Pending excluded).
  const coinPnlMap: Record<string, number> = {};
  closedVisibleTrades.forEach(t => {
    const sym = t.symbol || t.coin || '';
    if (!sym) return;
    const pnl = parseFloat(t.closedPnl ?? t.pnl ?? 0);
    coinPnlMap[sym] = (coinPnlMap[sym] || 0) + pnl;
  });
  const coinPnlList = Object.entries(coinPnlMap).map(([symbol, pnl]) => ({ symbol, pnl }));
  const tradesBestCoins = [...coinPnlList].sort((a, b) => b.pnl - a.pnl).filter(c => c.pnl > 0).slice(0, 5);
  const tradesWorstCoins = [...coinPnlList].sort((a, b) => a.pnl - b.pnl).filter(c => c.pnl < 0).slice(0, 5);

  // Compute long/short pie data from trade history (always use actual trade counts)
  const computedLongShortData = (() => {
    const total = longShortStats.longCount + longShortStats.shortCount;
    return [
      { name: 'Long', value: total > 0 ? (longShortStats.longCount / total) * 100 : 0, fill: '#16a34a' },
      { name: 'Short', value: total > 0 ? (longShortStats.shortCount / total) * 100 : 0, fill: '#dc2626' }
    ];
  })();

  return (
    <>
      <div className="space-y-3 w-full min-w-0 -mb-1 sm:-mb-3 lg:-mb-4">

          {/* Page-wide Exchange Filter — applies to ALL stats / charts / tables below.
              Only rendered when more than one exchange is connected. */}
          {exchangeBalances.balances.length > 1 && (
            <MotionCard className="w-full min-w-0 h-full" delay={0}>
              <CardContent className="py-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Filter:</span>
                  {['all', ...exchangeBalances.balances.map(b => b.exchange)].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setExchangeFilter(opt)}
                      className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors capitalize ${
                        exchangeFilter === opt
                          ? 'bg-gradient-to-r from-orange-500 to-orange-600 border-[#e8590c]/50 text-white font-medium'
                          : 'bg-white/[0.05] border-white/10 text-gray-200 hover:bg-white/10'
                      }`}
                    >
                      {opt === 'all' ? 'All (cumulative)' : opt}
                    </button>
                  ))}
                </div>
              </CardContent>
            </MotionCard>
          )}

          {/* Trade Metrics Summary - full width. */}
          <MotionCard className="w-full min-w-0 h-full" delay={0.05}>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium text-gray-200">Trade Metrics Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {(() => {
                const metricsData = [
                  { label: 'Avg Trade P&L', value: `$${(summary?.avgTradeProfit ?? 0).toFixed(2)}`, color: (summary?.avgTradeProfit ?? 0) >= 0 ? 'text-green-500' : 'text-red-500' },
                  { label: 'Best Trade', value: `$${(summary?.bestTrade?.pnl ?? 0).toFixed(2)}`, sub: summary?.bestTrade?.symbol, color: 'text-green-500' },
                  { label: 'Worst Trade', value: `$${(summary?.worstTrade?.pnl ?? 0).toFixed(2)}`, sub: summary?.worstTrade?.symbol, color: 'text-red-500' },
                  { label: 'Realized P&L', value: `$${(summary?.totalRealizedPnl ?? 0).toFixed(2)}`, color: (summary?.totalRealizedPnl ?? 0) >= 0 ? 'text-green-500' : 'text-red-500' },
                  { label: 'Unrealized P&L', value: `$${(summary?.totalUnrealizedPnl ?? 0).toFixed(2)}`, color: (summary?.totalUnrealizedPnl ?? 0) >= 0 ? 'text-green-500' : 'text-red-500' },
                  { label: 'Total Trades', value: String(summary?.totalTrades ?? 0), sub: externalTradeCount > 0 ? `${externalTradeCount} external` : undefined, color: 'text-foreground' },
                ];
                return (
                  <div className="grid grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-0.5">
                    {metricsData.map((m, i) => (
                      <div key={i} className="py-0.5 text-center">
                        <div className={`text-sm font-medium tracking-tight leading-tight ${m.color}`}>{m.value}</div>
                        {m.sub && <div className="text-[8px] text-muted-foreground leading-none">{m.sub}</div>}
                        <div className="text-[9px] text-muted-foreground leading-none">{m.label}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </MotionCard>


          {/* Trade Performance (All Profiles) — no outer card; content sits on the page */}
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
          >
            <CardContent className="p-0">
              {!allProfilesPerf ? (
                <p className="text-sm text-muted-foreground">
                  No closed trades yet. Place and close trades to populate this view.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Balance curve (left) + summary stats as a vertical column (right) */}
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* Balance curve — orange hatched style matching the Dashboard chart */}
                    <div className="flex-1 min-w-0 h-[clamp(260px,40vh,338px)]">
                      <BalanceCurveChart
                        data={allProfilesPerf.balanceOverTrades.map((p) => ({ name: String(p.trade), balance: p.balance }))}
                        controls={
                          <>
                            <div className="flex flex-col leading-tight text-right">
                              <span className="text-[10px] text-white/85">External trades</span>
                              <span className="text-[8px] font-medium text-white/70 leading-none">
                                {includeExternal ? 'Included' : 'Excluded'}
                              </span>
                            </div>
                            <Switch
                              checked={includeExternal}
                              onCheckedChange={setIncludeExternal}
                              aria-label="Include external trades"
                              className="scale-[0.7] border-white/40 data-[state=unchecked]:bg-black/20 data-[state=checked]:bg-white data-[state=checked]:border-[#333333] data-[state=checked]:[&>span]:bg-[#facc15]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowClearHistoryDialog(true)}
                              disabled={clearingHistory}
                              title="Clear Trade History"
                              aria-label="Clear Trade History"
                              className="w-6 h-6 rounded-full bg-white hover:bg-white/90 flex items-center justify-center transition-colors border border-white disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3 text-gray-700" />
                            </button>
                          </>
                        }
                      />
                    </div>

                    {/* Summary stats — vertical column on the right, vertically
                        centered against the chart. */}
                    <div className="lg:w-64 lg:h-[clamp(260px,40vh,338px)] shrink-0 rounded-2xl bg-white border border-black/5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] p-3 flex flex-col overflow-hidden">
                      <div className="text-xs font-medium text-gray-900 mb-1">Trade Breakdown</div>
                      <div className="flex flex-col gap-1 w-full flex-1 justify-center">
                        {(() => {
                          const s = allProfilesPerf.summary;
                          const money = [s.netProfit, s.totalProfit, s.totalLoss, s.finalBalance, s.maxBalance, s.minBalance].map(Number);
                          const maxMoney = Math.max(1, ...money.map((v) => Math.abs(v || 0)));
                          // Pair/ratio stats can't be a single bar — they sit grouped on top.
                          const noBar = [
                            { label: 'Wins / Losses', value: `${s.wins} / ${s.losses}` },
                            { label: 'Max / Min Balance', value: `${fmt2(s.maxBalance)} / ${fmt2(s.minBalance)}` },
                          ];
                          // Single-magnitude stats render as orange bars, grouped below.
                          const bars = [
                            { label: 'Win Rate', value: `${fmt2(s.winRate)}%`, frac: (Number(s.winRate) || 0) / 100, pos: true },
                            { label: 'Net Profit', value: fmt2(s.netProfit), frac: Math.abs(Number(s.netProfit) || 0) / maxMoney, pos: (Number(s.netProfit) || 0) >= 0 },
                            { label: 'Max Drawdown', value: `${fmt2(s.maxDrawdown)}%`, frac: (Number(s.maxDrawdown) || 0) / 100, pos: false },
                            { label: 'Total Profit', value: fmt2(s.totalProfit), frac: Math.abs(Number(s.totalProfit) || 0) / maxMoney, pos: true },
                            { label: 'Total Loss', value: fmt2(s.totalLoss), frac: Math.abs(Number(s.totalLoss) || 0) / maxMoney, pos: false },
                            { label: 'Final Balance', value: fmt2(s.finalBalance), frac: Math.abs(Number(s.finalBalance) || 0) / maxMoney, pos: (Number(s.finalBalance) || 0) >= 0 },
                          ];
                          return (
                            <>
                              {/* non-bar stats (upper) */}
                              <div className="space-y-1.5">
                                {noBar.map((st) => (
                                  <div key={st.label} className="flex items-baseline justify-between gap-2 leading-none">
                                    <span className="text-[10px] text-gray-900">{st.label}</span>
                                    <span className="text-[9px] font-medium tracking-tight text-gray-500">{st.value}</span>
                                  </div>
                                ))}
                              </div>
                              {/* bar stats (lower) */}
                              <div className="flex flex-col gap-1">
                                {bars.map((st) => (
                                  <div key={st.label} className="leading-none">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="text-[10px] text-gray-900">{st.label}</span>
                                      <span className="text-[9px] font-medium tracking-tight text-gray-500">{st.value}</span>
                                    </div>
                                    <div className="mt-0.5">
                                      <CubeBar frac={st.frac} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Trade Breakdown — fixed 4-row height; hidden when there are no trades. */}
                  {allProfilesPerf.tradeDetails.length > 0 && (
                  <div ref={tradeTableRef} className="table-scroll-dark h-[clamp(155px,24vh,200px)]">
                      <table className="w-full min-w-[min(100%,760px)] text-[9px] sm:text-[11px] [&_th]:!py-2 [&_td]:!py-1 [&_th]:!px-1.5 sm:[&_th]:!px-2 [&_td]:!px-1.5 sm:[&_td]:!px-2">
                        <thead className="sticky top-0 z-10 bg-[#0a0a0a]">
                          <tr className="border-b">
                            <th className="text-left p-2">#</th>
                            <th className="text-left p-2">Date</th>
                            <th className="text-left p-2">Risk Profile</th>
                            <th className="text-left p-2">Exchange</th>
                            <th className="text-left p-2">Symbol</th>
                            <th className="text-left p-2">Dir</th>
                            <th className="text-right p-2">Risk%</th>
                            <th className="text-right p-2" title="Reward:Risk from TP and SL">RR</th>
                            <th className="text-left p-2">Result</th>
                            <th className="text-right p-2">PNL</th>
                            <th className="text-right p-2">Fees</th>
                            <th className="text-right p-2">Payout</th>
                            <th className="text-right p-2">Balance</th>
                            <th className="text-left p-2">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allProfilesPerf.tradeDetails.map((t) => {
                            const isPending = t.outcome === 'Pending';
                            return (
                              <tr
                                key={`${t.tradeNumber}-${t.date}-${t.symbol}-${t.exchange}`}
                                className={`border-b ${isPending ? 'bg-yellow-500/5 animate-pulse' : 'hover:bg-white/[0.02]'}`}
                              >
                                <td className="p-2 text-muted-foreground">{t.tradeNumber}</td>
                                <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                                  {t.date ? new Date(t.date).toLocaleString() : '—'}
                                </td>
                                <td className="p-2 text-xs">
                                  <Badge variant="outline" className="text-[10px] px-2 rounded-full justify-center min-w-[clamp(50px,15vw,66px)]">{t.riskProfileName}</Badge>
                                </td>
                                <td className="p-2 text-xs">
                                  <ExchangeBadge exchange={t.exchange} />
                                </td>
                                <td className="p-2 font-medium">{t.symbol}</td>
                                <td className="p-2">
                                  <span className={String(t.side).toLowerCase() === 'buy' ? 'text-green-500' : 'text-red-500'}>{t.side}</span>
                                </td>
                                <td className="text-right p-2">{t.riskPercent != null ? `${fmt2(t.riskPercent)}%` : '—'}</td>
                                <td className="text-right p-2 text-muted-foreground" title={t.sl != null && t.tp != null ? `SL ${fmt2(t.sl)} / TP ${fmt2(t.tp)}` : 'No SL/TP set'}>
                                  {t.rr}
                                </td>
                                <td className="p-2">
                                  <TradeBadge outcome={t.outcome} />
                                </td>
                                <td className={`text-right p-2 font-medium ${isPending ? 'text-muted-foreground' : t.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {isPending ? '—' : fmt2(t.pnl)}
                                </td>
                                <td className="text-right p-2 text-muted-foreground">{t.fees != null ? `$${t.fees.toFixed(4)}` : '—'}</td>
                                <td className="text-right p-2">{fmt2(t.payout)}</td>
                                <td className="text-right p-2 font-medium">{fmt2(t.balanceAfter)}</td>
                                <td className="p-2">
                                  {t.source === 'external' ? (
                                    <Badge className="bg-[#facc15] text-black border-transparent text-[10px] px-2 rounded-full justify-center min-w-[clamp(50px,15vw,66px)]">Exchange</Badge>
                                  ) : (
                                    <Badge className="bg-[#e8590c] text-white border-transparent text-[10px] px-2 rounded-full justify-center min-w-[clamp(50px,15vw,66px)]">App</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </motion.div>

          {/* Trading Volume (80%) + Monthly Profit/Loss (20%) row */}
          <div className="flex flex-col lg:flex-row gap-3 w-full">
            <div className="w-full lg:w-[65%]">
            <MotionCard delay={0.2} className="min-w-0 h-full">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium text-gray-200">Trading Volume per Coin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[clamp(220px,39vh,420px)] w-full">
                  {summary?.tradingVolumePerCoin && summary.tradingVolumePerCoin.length > 0 ? (
                    (() => {
                      const coins = [...summary.tradingVolumePerCoin].sort((a, b) => b.percentage - a.percentage);
                      const maxPct = Math.max(...coins.map((c) => c.percentage), 0);
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <Treemap
                            data={coins}
                            dataKey="percentage"
                            nameKey="symbol"
                            stroke="#0a0a0a"
                            isAnimationActive={false}
                            content={<VolumeHeatCell maxPct={maxPct} />}
                          />
                        </ResponsiveContainer>
                      );
                    })()
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">No volume data</div>
                  )}
                </div>
                {/* Top-5 coin legend — each chip tinted with that coin's heatmap colour. */}
                {summary?.tradingVolumePerCoin && summary.tradingVolumePerCoin.length > 0 && (() => {
                  const sorted = [...summary.tradingVolumePerCoin].sort((a, b) => b.percentage - a.percentage);
                  const maxPct = Math.max(...sorted.map((c) => c.percentage), 0);
                  return (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {sorted.slice(0, 5).map((c) => (
                        <span
                          key={c.symbol}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium text-black"
                          style={{ backgroundColor: volumeShade(maxPct > 0 ? c.percentage / maxPct : 0) }}
                          title={`Volume $${Math.round(c.volume).toLocaleString()}`}
                        >
                          <span>{c.symbol}</span>
                          <span className="opacity-75">{c.percentage.toFixed(1)}%</span>
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </MotionCard>
            </div>
            <div className="w-full lg:w-[35%]">
            {/* Monthly Profit Chart */}
            <MotionCard delay={0.25} className="flex flex-col min-w-0 h-full">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium text-gray-200">Monthly Profit/Loss</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex items-center">
                <div className="h-[clamp(220px,39vh,420px)] w-full">
                  {summary?.monthlyProfit && summary.monthlyProfit.length > 0 ? (
                    <ChartContainer
                      config={{ profit: { label: "Profit/Loss", color: "#22c55e" } }}
                      className="w-full h-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={summary.monthlyProfit} margin={{ top: 5, right: 6, left: 0, bottom: 0 }} barCategoryGap="25%" maxBarSize={36}>
                          <XAxis
                            dataKey="month"
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                            tickFormatter={(m) => {
                              const d = new Date(`${m}-01`);
                              return isNaN(d.getTime()) ? m : d.toLocaleDateString('default', { month: 'short' });
                            }}
                          />
                          <YAxis
                            fontSize={9}
                            width={36}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                            {summary.monthlyProfit.map((entry: any, index: number) => (
                              <Cell key={`month-${index}`} fill={entry.profit >= 0 ? '#16a34a' : '#dc2626'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">No monthly data</div>
                  )}
                </div>
              </CardContent>
            </MotionCard>
            </div>
          </div>

          {/* Long/Short (80%) + Best/Worst (20%) row */}
          <div className="flex flex-col lg:flex-row gap-3 w-full min-w-0">
            <div className="w-full lg:w-[80%]">
            {/* Long/Short Analysis */}
            <MotionCard delay={0.3} className="min-w-0 h-full">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium text-gray-200">Long/Short Exposure</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex flex-col items-center gap-2 shrink-0 w-full sm:w-48">
                    <div className="h-[clamp(120px,19vh,220px)] w-full">
                      <ChartContainer
                        config={{ long: { label: "Long", color: "#22c55e" }, short: { label: "Short", color: "#ef4444" } }}
                        className="w-full h-full"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={computedLongShortData} cx="50%" cy="50%" innerRadius={30} outerRadius={48} dataKey="value">
                              {computedLongShortData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <ChartTooltip formatter={(value: any) => [`${Number(value).toFixed(1)}%`]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                        <span className="text-muted-foreground">Long</span>
                        <span className="font-medium text-green-500">{computedLongShortData[0].value.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        <span className="text-muted-foreground">Short</span>
                        <span className="font-medium text-red-500">{computedLongShortData[1].value.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center gap-5 flex-1 w-full">
                    {(() => {
                      const s = longShortStats;
                      const maxCount = Math.max(s.longCount, s.shortCount, 1);
                      const sideColor = (pnl: number) => (pnl >= 0 ? 'text-green-500' : 'text-red-500');
                      return (
                        <>
                          {/* Long — bar length ∝ trade count, stats above the bar */}
                          <div>
                            <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-0.5 text-xs mb-1.5">
                              <span className="font-medium text-green-500">Long · {s.longCount} trades</span>
                              <span className="text-muted-foreground">
                                Profit <span className="text-green-500">+${s.longProfit.toFixed(2)}</span>
                                {' · '}Loss <span className="text-red-500">${s.longLoss.toFixed(2)}</span>
                                {' · '}Net <span className={sideColor(s.longPnl)}>{s.longPnl >= 0 ? '+' : ''}${s.longPnl.toFixed(2)}</span>
                              </span>
                            </div>
                            <div className="h-2.5 w-full bg-white/[0.06] rounded-sm overflow-hidden">
                              <div className="h-full bg-green-600 rounded-sm" style={{ width: `${(s.longCount / maxCount) * 100}%` }} />
                            </div>
                          </div>
                          {/* Short — bar length ∝ trade count, stats above the bar */}
                          <div>
                            <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-0.5 text-xs mb-1.5">
                              <span className="font-medium text-red-500">Short · {s.shortCount} trades</span>
                              <span className="text-muted-foreground">
                                Profit <span className="text-green-500">+${s.shortProfit.toFixed(2)}</span>
                                {' · '}Loss <span className="text-red-500">${s.shortLoss.toFixed(2)}</span>
                                {' · '}Net <span className={sideColor(s.shortPnl)}>{s.shortPnl >= 0 ? '+' : ''}${s.shortPnl.toFixed(2)}</span>
                              </span>
                            </div>
                            <div className="h-2.5 w-full bg-white/[0.06] rounded-sm overflow-hidden">
                              <div className="h-full bg-red-600 rounded-sm" style={{ width: `${(s.shortCount / maxCount) * 100}%` }} />
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    {longShortStats.longCount === 0 && longShortStats.shortCount === 0 && (
                      <p className="text-sm text-muted-foreground">No trade history</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </MotionCard>
            </div>
            <div className="w-full lg:w-[20%]">
            {/* Best/Worst Coins */}
            <MotionCard delay={0.35} className="min-w-0 h-full">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium text-gray-200">Best & Worst Performing Coins</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <h4 className="text-[11px] font-medium mb-1 text-green-500">Best</h4>
                    {tradesBestCoins.length > 0 ? (
                      <div className="space-y-2">
                        {tradesBestCoins.map((coin, idx) => (
                          <div key={idx} className="flex justify-between text-[10px]">
                            <span>{coin.symbol}</span>
                            <span className="text-green-500">+${coin.pnl.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">No data</p>
                    )}
                  </div>
                  <div>
                    <h4 className="text-[11px] font-medium mb-1 text-red-500">Worst</h4>
                    {tradesWorstCoins.length > 0 ? (
                      <div className="space-y-2">
                        {tradesWorstCoins.map((coin, idx) => (
                          <div key={idx} className="flex justify-between text-[10px]">
                            <span>{coin.symbol}</span>
                            <span className="text-red-500">${coin.pnl.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">No data</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </MotionCard>
            </div>
          </div>
      </div>

    {/* Clear Trade History Confirmation Dialog */}
    <AlertDialog open={showClearHistoryDialog} onOpenChange={setShowClearHistoryDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear Trade History?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes every saved trade for your account and records the current time as
            your cutoff. Any trades that closed before this moment — including ones re-synced from Bybit —
            will stay hidden from the portfolio and trading-panel history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clearingHistory}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClearHistory}
            disabled={clearingHistory}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {clearingHistory ? 'Clearing…' : 'Clear History'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    </>
  );
};

export default UserPortfolioPage;
