import { motion } from "framer-motion";
import { useState, useEffect, useMemo, useCallback } from "react";
import PortfolioPerformanceChart from "@/modules/Dashboard/components/PortfolioPerformanceChart";
import GoalsRingCard from "@/modules/Dashboard/components/GoalsRingCard";
import BalanceDistributionCard from "@/modules/Dashboard/components/BalanceDistributionCard";
import WinRateGaugeCard from "@/modules/Dashboard/components/WinRateGaugeCard";
import DailyPerformanceHeatmap from "@/modules/Dashboard/components/DailyPerformanceHeatmap";
import TrendingMarketCard from "@/modules/Dashboard/components/TrendingMarketCard";
import { buildDividedGoals } from "@/lib/goals";
import { orderApi, goalApi } from "@/lib/api";
import { toast } from "sonner";

const timeframes = ["1W", "1M", "3M", "6M", "1Y", "All"];

type ChartPoint = { name: string; t: number; balance: number; benchmark?: number };

/** Build cumulative balance chart points from sorted trades for a given timeframe.
 *  baseline = balance before all those trades (currentBalance - sum of their pnl).
 */
function buildChartData(
  allTrades: any[],
  currentBalance: number,
  tf: string
): ChartPoint[] {
  const now = Date.now();
  const MS = { "1H": 3_600_000, "24H": 86_400_000, "1W": 7 * 86_400_000, "1M": 30 * 86_400_000, "3M": 90 * 86_400_000, "6M": 180 * 86_400_000, "1Y": 365 * 86_400_000, "All": 100 * 365 * 86_400_000 };
  const windowMs = MS[tf as keyof typeof MS] ?? MS["1W"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthShort = (d: Date) => d.toLocaleString("default", { month: "short" });

  // One bar per fine-grained time unit: 1W → hourly, 1M → daily, 3M → daily,
  // 6M → every 2 days, 1Y/All → weekly. labelFn produces the (coarse) axis
  // label; the chart de-duplicates and spaces them out.
  let stepMs: number;
  let labelFn: (d: Date) => string;
  if (tf === "1W") {
    // One bar per hour, labelled by day.
    stepMs = 3_600_000;
    labelFn = (d) => DAYS[d.getDay()];
  } else if (tf === "1M") {
    // One bar per hour, labelled by date.
    stepMs = 3_600_000;
    labelFn = (d) => `${d.getDate()}`;
  } else {
    // Above a month → one bar per day, labelled by month.
    stepMs = 86_400_000;
    labelFn = monthShort;
  }

  const count = Math.max(2, Math.min(Math.ceil(windowMs / stepMs), 800));
  const windowStart = now - count * stepMs;

  // Robust timestamp parse — app-ledger trades store ISO date strings (e.g.
  // "2026-06-01T..."), exchange trades store epoch ms. Number("2026-…") is NaN,
  // which previously dropped every app trade and left the chart flat.
  const tradeMs = (t: any): number => {
    const raw = t.closedAt ?? t.updatedAt ?? t.createdAt ?? t.time;
    if (raw == null) return NaN;
    if (typeof raw === "number") return raw;
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) return parsed;
    const n = Number(raw);
    return isNaN(n) ? NaN : n;
  };
  const tradePnl = (t: any): number => {
    const v = parseFloat(t.closedPnl ?? t.pnl ?? t.profit ?? t.realisedPnl ?? 0);
    return isNaN(v) ? 0 : v;
  };

  // Trades inside window, sorted ascending by time
  const windowTrades = allTrades
    .filter((t) => {
      const ms = tradeMs(t);
      return !isNaN(ms) && ms >= windowStart;
    })
    .sort((a, b) => tradeMs(a) - tradeMs(b));

  // Baseline = balance before the window's trades = currentBalance − their pnl.
  const windowPnlSum = windowTrades.reduce((s, t) => s + tradePnl(t), 0);
  const baseline = currentBalance - windowPnlSum;

  // Cumulative balance at the end of each bucket — single pass over sorted trades.
  const points: ChartPoint[] = [];
  let ti = 0;
  let running = baseline;
  for (let i = 1; i <= count; i++) {
    const end = windowStart + i * stepMs;
    while (ti < windowTrades.length && tradeMs(windowTrades[ti]) <= end) {
      running += tradePnl(windowTrades[ti]);
      ti++;
    }
    points.push({ name: labelFn(new Date(end)), t: end, balance: Math.max(0, parseFloat(running.toFixed(2))) });
  }

  // No trades in window → flat line at current balance.
  if (windowTrades.length === 0) {
    return points.map(p => ({ ...p, balance: currentBalance }));
  }
  return points;
}

const PERIOD_DAYS: Record<string, number> = { Daily: 1, Weekly: 7, Monthly: 30, Quarterly: 91, Yearly: 365 };

/** Overlay the goal's on-pace target path as the benchmark series. */
function withBenchmark(points: ChartPoint[], goal: any, currentBalance: number): ChartPoint[] {
  if (!goal || !points.length) return points;
  const goalAmount = Number(goal.goalAmount) || 0;
  if (goalAmount <= 0) return points;
  const goalStart = new Date(goal.createdAt ?? Date.now()).getTime();
  const durMs = (PERIOD_DAYS[goal.goalType] ?? 30) * 86_400_000;
  const goalEnd = goalStart + durMs;
  // Equity at goal creation ≈ current balance minus profit booked since then.
  const startEquity = currentBalance - (Number(goal.actualProfit) || 0);
  return points.map((p) => {
    const frac = Math.max(0, Math.min(1, (p.t - goalStart) / (goalEnd - goalStart || 1)));
    return { ...p, benchmark: startEquity + goalAmount * frac };
  });
}

const DashboardPage = () => {
  const [activeTimeframe, setActiveTimeframe] = useState("1W");
  const [winrateData, setWinrateData] = useState({ wins: 0, losses: 0, total: 0 });
  const [goalsList, setGoalsList] = useState<any[]>([]);
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // Fetch portfolio data (balance + trades)
  useEffect(() => {
    const fetchPortfolio = async () => {
      setPortfolioLoading(true);
      try {
        const [balSettled, tradeSettled] = await Promise.allSettled([
          orderApi.getBalance(),
          orderApi.getTradeHistory()
        ]);
        const balRes = balSettled.status === 'fulfilled' ? balSettled.value : null;
        const tradeRes = tradeSettled.status === 'fulfilled' ? tradeSettled.value : null;

        const balance = parseFloat(balRes?.balance ?? 0);
        setRealBalance(balance);

        const trades: any[] = tradeRes?.trades ?? (Array.isArray(tradeRes) ? tradeRes : []);
        setAllTrades(trades);

        // Win rate from the canonical Trade ledger (orderApi.getMyTrades) so the
        // count matches the Portfolio page's Trade Breakdown — outcome-tagged
        // Win/Loss, not Bybit closed-pnl (which only returns recent fills).
        try {
          const myData = await orderApi.getMyTrades();
          const myTrades: any[] = Array.isArray(myData) ? myData : (myData?.trades ?? []);
          const closed = myTrades.filter((t) => t.outcome === 'Win' || t.outcome === 'Loss');
          const wins = closed.filter((t) => t.outcome === 'Win').length;
          const losses = closed.filter((t) => t.outcome === 'Loss').length;
          setWinrateData({ wins, losses, total: wins + losses });

          // The canonical ledger has real pnl + timestamps for every trade, so use
          // it to drive the equity curve + goal rings (the exchange trade history
          // can be empty/unavailable, which is why the chart looked flat).
          if (myTrades.length) setAllTrades(myTrades);
        } catch {
          /* leave win rate at default */
        }

      } catch (err: any) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setPortfolioLoading(false);
      }
    };
    fetchPortfolio();
  }, []);

  // Fetch goals (reusable — also called after create/delete)
  const fetchGoals = useCallback(async () => {
    try {
      const res = await goalApi.getAll();
      const goals: any[] = Array.isArray(res) ? res : res?.goals ?? [];
      setGoalsList(goals);
    } catch {
      // not connected or no goals
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Create / delete a goal — mirrors the Portfolio page logic.
  const handleCreateGoal = useCallback(
    async (goalType: string, goalAmount: number) => {
      try {
        await goalApi.create({ goalType, goalAmount });
        toast.success("Goal created successfully");
        await fetchGoals();
      } catch (err: any) {
        toast.error(err?.message || "Failed to create goal");
        throw err;
      }
    },
    [fetchGoals]
  );

  const handleDeleteGoal = useCallback(async () => {
    const id = goalsList[0]?._id;
    if (!id) return;
    try {
      await goalApi.delete(id);
      toast.success("Goal deleted successfully");
      await fetchGoals();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete goal");
      throw err;
    }
  }, [goalsList, fetchGoals]);

  const currentBalance = realBalance ?? 0;
  const chartData = useMemo(
    () => withBenchmark(buildChartData(allTrades, currentBalance, activeTimeframe), goalsList[0], currentBalance),
    [allTrades, currentBalance, activeTimeframe, goalsList]
  );

  const winPct = winrateData.total > 0 ? Math.round((winrateData.wins / winrateData.total) * 100) : 0;

  // Concentric goal rings: outer (largest period) → inner (shortest period).
  // Targets + progress come from the shared @/lib/goals helper.
  // The number of rings shown adapts dynamically to the active goal type.
  const goalRings = useMemo(() => {
    if (!goalsList || goalsList.length === 0) return [];

    const activeGoal = goalsList[0];
    const orderMap: Record<string, string[]> = {
      Yearly: ["Yearly", "Quarterly", "Monthly", "Weekly", "Daily"],
      Quarterly: ["Quarterly", "Monthly", "Weekly", "Daily"],
      Monthly: ["Monthly", "Weekly", "Daily"],
      Weekly: ["Weekly", "Daily"],
      Daily: ["Daily"],
    };

    const activeOrder = orderMap[activeGoal.goalType] || ["Monthly", "Weekly", "Daily"];

    // Orange → yellow palette to match the dashboard theme (WinRate card #e8590c).
    const colors: Record<string, string> = {
      Yearly: "#e8590c",
      Quarterly: "#f97316",
      Monthly: "#fb923c",
      Weekly: "#fbbf24",
      Daily: "#facc15",
    };

    const enriched = buildDividedGoals(goalsList, allTrades);
    // Prefer the main goal for a period; otherwise the derived (sub) one.
    const byType: Record<string, { amount: number; achieved: number; progress: number }> = {};
    for (const e of enriched) {
      if (!byType[e.type] || e.isMain) {
        byType[e.type] = { amount: e.amount, achieved: e.achieved ?? 0, progress: e.progress ?? 0 };
      }
    }

    // Align the largest (main) goal ring with the backend's authoritative
    // progress: actualProfit (realised pnl since goal creation) ÷ goalAmount.
    byType[activeGoal.goalType] = {
      amount: Number(activeGoal.goalAmount) || 0,
      achieved: Number(activeGoal.actualProfit ?? byType[activeGoal.goalType]?.achieved ?? 0),
      progress: Number(activeGoal.progress ?? byType[activeGoal.goalType]?.progress ?? 0),
    };

    return activeOrder.map((type) => {
      const e = byType[type];
      return {
        label: type,
        target: e?.amount ?? 0,
        current: e?.achieved ?? 0,
        pct: e ? Math.min(1, (e.progress ?? 0) / 100) : 0,
        color: colors[type],
      };
    });
  }, [goalsList, allTrades]);

  // The single goal the user actually set (the largest period). Shown up top of
  // the rings card with its backend progress.
  const mainGoal = goalsList[0]
    ? {
        label: String(goalsList[0].goalType ?? "Goal"),
        target: Number(goalsList[0].goalAmount) || 0,
        current: Number(goalsList[0].actualProfit ?? 0),
        pct: Math.max(0, Math.min(1, Number(goalsList[0].progress ?? 0) / 100)),
      }
    : null;

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 overflow-x-hidden">
      {/* Main grid: chart, goal rings, heatmap, win rate, balance, trending */}
      <div className="grid grid-cols-1 lg:grid-cols-6 lg:items-stretch gap-4 sm:gap-6 w-full min-w-0 overflow-hidden">
        {/* Portfolio Chart */}
        <motion.div
          className="lg:col-span-5 lg:row-start-1 min-w-0 overflow-hidden lg:h-[150px]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <PortfolioPerformanceChart
            data={chartData}
            timeframes={timeframes}
            activeTimeframe={activeTimeframe}
            onTimeframeChange={setActiveTimeframe}
            loading={portfolioLoading}
          />
        </motion.div>

        {/* Yearly goal rings — row 1, right column */}
        <motion.div
          className="lg:col-start-6 lg:row-start-1 min-w-0 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <GoalsRingCard
            rings={goalRings}
            mainGoal={mainGoal}
            hasGoals={goalsList.length > 0}
            onCreateGoal={handleCreateGoal}
            onDeleteGoal={handleDeleteGoal}
          />
        </motion.div>

        {/* Daily Performance heatmap — row 2, fills the left two columns */}
        <motion.div
          className="lg:col-start-1 lg:col-span-3 lg:row-start-2 min-w-0 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <DailyPerformanceHeatmap />
        </motion.div>

        {/* Win Rate (square) + Balance distribution (wider) — row 2, right half */}
        {/* Right column, row 2: Win Rate + Balance on top, Trending below —
            sits beside the Daily Performance heatmap, all within one screen. */}
        <motion.div
          className="lg:col-start-4 lg:col-span-3 lg:row-start-2 min-w-0 overflow-hidden flex flex-col gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            <div className="lg:w-[150px] lg:shrink-0">
              <WinRateGaugeCard
                winPct={winPct}
                wins={winrateData.wins}
                losses={winrateData.losses}
                total={winrateData.total}
              />
            </div>
            <div className="flex-1 min-w-0">
              <BalanceDistributionCard />
            </div>
          </div>
          <TrendingMarketCard />
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardPage;
