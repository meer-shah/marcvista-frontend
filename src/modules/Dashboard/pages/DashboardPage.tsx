import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, ExternalLink, Target, Trophy, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PortfolioPerformanceChart from "@/modules/Dashboard/components/PortfolioPerformanceChart";
import GoalsRingCard from "@/modules/Dashboard/components/GoalsRingCard";
import { buildDividedGoals } from "@/lib/goals";
import { useNavigate } from "react-router-dom";
import { orderApi, goalApi, newsApi } from "@/lib/api";

const timeframes = ["1W", "1M", "3M", "6M", "1Y", "All"];

type ChartPoint = { name: string; balance: number };

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

  // Trades inside window, sorted ascending by time
  const windowTrades = allTrades
    .filter(t => Number(t.updatedAt || t.closedAt || 0) >= windowStart)
    .sort((a, b) => Number(a.updatedAt || a.closedAt || 0) - Number(b.updatedAt || b.closedAt || 0));

  // Baseline = balance before the window's trades = currentBalance − their pnl.
  const windowPnlSum = windowTrades.reduce((s, t) => s + parseFloat(t.closedPnl ?? t.pnl ?? 0), 0);
  const baseline = currentBalance - windowPnlSum;

  // Cumulative balance at the end of each bucket — single pass over sorted trades.
  const points: ChartPoint[] = [];
  let ti = 0;
  let running = baseline;
  for (let i = 1; i <= count; i++) {
    const end = windowStart + i * stepMs;
    while (
      ti < windowTrades.length &&
      Number(windowTrades[ti].updatedAt || windowTrades[ti].closedAt || 0) <= end
    ) {
      running += parseFloat(windowTrades[ti].closedPnl ?? windowTrades[ti].pnl ?? 0);
      ti++;
    }
    points.push({ name: labelFn(new Date(end)), balance: Math.max(0, parseFloat(running.toFixed(2))) });
  }

  // No trades in window → flat line at current balance.
  if (windowTrades.length === 0) {
    return points.map(p => ({ ...p, balance: currentBalance }));
  }
  return points;
}

interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  low_24h: number;
  high_24h: number;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  categories: string[];
}

const BYBIT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "LINKUSDT"];

const DashboardPage = () => {
  const navigate = useNavigate();
  const [activeTimeframe, setActiveTimeframe] = useState("1W");
  const [marketCoins, setMarketCoins] = useState<CoinMarket[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [winrateData, setWinrateData] = useState({ wins: 0, losses: 0, total: 0 });
  const [goalsData, setGoalsData] = useState<{ current: number; target: number; label: string } | null>(null);
  const [goalsList, setGoalsList] = useState<any[]>([]);
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [activeTrade, setActiveTrade] = useState<any>(null);
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch live market data (Bybit Futures)
  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const res = await fetch(
          `https://api.bybit.com/v5/market/tickers?category=linear`
        );
        const json = await res.json();
        if (json.retCode === 0 && json.result?.list) {
          const list = json.result.list;
          const filtered = list
            .filter((t: any) => BYBIT_SYMBOLS.includes(t.symbol))
            .map((t: any) => ({
              id: t.symbol,
              symbol: t.symbol.replace("USDT", ""),
              name: t.symbol.replace("USDT", ""),
              current_price: parseFloat(t.lastPrice),
              price_change_percentage_24h: parseFloat(t.price24hPcnt || 0) * 100,
              low_24h: parseFloat(t.lowPrice24h),
              high_24h: parseFloat(t.highPrice24h),
            }));
          setMarketCoins(filtered);
        }
      } catch (err) {
        console.error("Bybit market fetch error:", err);
      } finally {
        setMarketLoading(false);
      }
    };
    fetchMarket();
    // Skip ticks while the tab/page is hidden — iOS Safari throttles timers
    // aggressively in background anyway, but explicit gating prevents a burst
    // of queued fetches firing when the user returns to the tab.
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchMarket();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchMarket();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Fetch news via our backend proxy (most reliable)
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const items = await newsApi.getNews();
        if (items && items.length > 0) {
          setNewsItems(items);
        }
      } catch (err) {
        console.error("News fetch error:", err);
      } finally {
        setNewsLoading(false);
      }
    };
    fetchNews();
  }, []);

  // Fetch portfolio data (balance + trades + positions + orders)
  useEffect(() => {
    const fetchPortfolio = async () => {
      setPortfolioLoading(true);
      setFetchError(null);
      try {
        const [balSettled, tradeSettled, posSettled, orderSettled] = await Promise.allSettled([
          orderApi.getBalance(),
          orderApi.getTradeHistory(),
          orderApi.getPositions(),
          orderApi.getOrders()
        ]);
        const balRes = balSettled.status === 'fulfilled' ? balSettled.value : null;
        const tradeRes = tradeSettled.status === 'fulfilled' ? tradeSettled.value : null;
        const posRes = posSettled.status === 'fulfilled' ? posSettled.value : null;
        const orderRes = orderSettled.status === 'fulfilled' ? orderSettled.value : null;

        const balance = parseFloat(balRes?.balance ?? 0);
        setRealBalance(balance);

        const trades: any[] = tradeRes?.trades ?? (Array.isArray(tradeRes) ? tradeRes : []);
        setAllTrades(trades);

        const anyFailure = [balSettled, tradeSettled, posSettled, orderSettled].some(
          (r) => r.status === 'rejected'
        );
        if (anyFailure && !trades.length && balance === 0) {
          setFetchError('API Connection Error');
        }

        // Winrate stats
        const wins = trades.filter((t) => parseFloat(t.closedPnl ?? t.pnl ?? 0) > 0).length;
        const losses = trades.filter((t) => parseFloat(t.closedPnl ?? t.pnl ?? 0) < 0).length;
        const total = wins + losses;
        setWinrateData({ wins, losses, total });

        // Active trades & pending orders
        const positions = Array.isArray(posRes) ? posRes : posRes?.result?.list || [];
        if (positions.length > 0) setActiveTrade(positions[0]);
        
        const orders = Array.isArray(orderRes) ? orderRes : orderRes?.result?.list || [];
        if (orders.length > 0) setPendingOrder(orders[0]);

      } catch (err: any) {
        console.error("Dashboard fetch error:", err);
        setFetchError("API Connection Error");
      } finally {
        setPortfolioLoading(false);
      }
    };
    fetchPortfolio();
  }, []);

  // Fetch goals
  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const res = await goalApi.getAll();
        const goals: any[] = Array.isArray(res) ? res : res?.goals ?? [];
        setGoalsList(goals);
        if (goals.length > 0) {
          const g = goals[0];
          setGoalsData({
            current: g.currentAmount ?? g.currentValue ?? 0,
            target: g.goalAmount ?? g.targetAmount ?? g.target ?? 0,
            label: g.goalType ?? g.title ?? "Goal",
          });
        }
      } catch {
        // not connected or no goals
      }
    };
    fetchGoals();
  }, []);

  const currentBalance = realBalance ?? 0;
  const chartData = useMemo(
    () => buildChartData(allTrades, currentBalance, activeTimeframe),
    [allTrades, currentBalance, activeTimeframe]
  );

  const winPct = winrateData.total > 0 ? Math.round((winrateData.wins / winrateData.total) * 100) : 0;
  const goalPct = goalsData ? Math.min(Math.round((goalsData.current / goalsData.target) * 100), 100) : 0;

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

    const colors: Record<string, string> = {
      Yearly: "#f43f5e",
      Quarterly: "#fb923c",
      Monthly: "#facc15",
      Weekly: "#34d399",
      Daily: "#60a5fa",
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

  const showCard1 = activeTrade !== null || pendingOrder !== null;

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 overflow-x-hidden">
      {/* Main grid: chart + news */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 w-full min-w-0 overflow-hidden">
        {/* Portfolio Chart */}
        <motion.div
          className="lg:col-span-3 min-w-0 overflow-hidden"
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

        {/* Goals rings — pushed lower to sit toward the bottom of the column */}
        <motion.div
          className="min-w-0 overflow-hidden flex items-start"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <GoalsRingCard rings={goalRings} mainGoal={mainGoal} />
        </motion.div>
      </div>

      {/* Bottom metric cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className={`grid gap-3 sm:gap-4 w-full ${showCard1 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}
      >
        {showCard1 && (
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                {activeTrade ? "Active Position" : "Pending Order"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeTrade ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-foreground">{activeTrade.symbol}</span>
                    <span className={parseFloat(activeTrade.unrealisedPnL) >= 0 ? "text-green-400" : "text-red-400"}>
                      {parseFloat(activeTrade.unrealisedPnL) >= 0 ? "+" : ""}{activeTrade.unrealisedPnL}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Size: {activeTrade.size} | Entry: {activeTrade.avgEntryPrice}</p>
                </div>
              ) : pendingOrder ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-foreground">{pendingOrder.symbol}</span>
                    <Badge variant="outline" className="text-[10px] py-0 h-4 border-primary/30 text-primary">
                      {pendingOrder.side} {pendingOrder.type}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Price: {pendingOrder.price} | Qty: {pendingOrder.qty}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs italic">No active trades</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Win Rate */}
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {winrateData.total === 0 ? (
              <p className="text-xs text-muted-foreground">No trade history yet. Connect Bybit to see your stats.</p>
            ) : (
              <>
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-3xl font-bold text-foreground">{winPct}%</span>
                  <span className="text-xs text-muted-foreground mb-1">
                    {winrateData.wins}W / {winrateData.losses}L
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-green-300 rounded-full transition-all duration-700"
                    style={{ width: `${winPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Last {winrateData.total} trades</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Goals */}
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-400" />
              {goalsData?.label ?? "Monthly Goal"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!goalsData ? (
              <p className="text-xs text-muted-foreground">No goals set. Add one from the Risk Profile page.</p>
            ) : (
              <>
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-3xl font-bold text-foreground">{goalPct}%</span>
                  <span className="text-xs text-muted-foreground mb-1">
                    ${goalsData.current.toLocaleString()} / ${goalsData.target.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-300 rounded-full transition-all duration-700"
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  ${(goalsData.target - goalsData.current).toLocaleString()} remaining
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Live Market quick-access */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Live Market</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate("/exchange")}
                className="text-xs text-primary hover:text-primary hover:bg-primary/10"
              >
                Open Exchange →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-white/10">
                    {["Asset", "Price", "24h Change", "24h Low", "24h High", ""].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {marketLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b border-white/5">
                          <td colSpan={6} className="py-3 px-3">
                            <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
                          </td>
                        </tr>
                      ))
                    : marketCoins.map((coin) => {
                        const change = coin.price_change_percentage_24h ?? 0;
                        return (
                          <tr key={coin.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-primary">
                                    {coin.symbol.toUpperCase()[0]}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-xs">{coin.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{coin.symbol.toUpperCase()}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-medium text-xs">
                              ${coin.current_price.toLocaleString()}
                            </td>
                            <td className={`py-3 px-3 text-xs font-medium ${change >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                            </td>
                            <td className="py-3 px-3 text-xs text-muted-foreground">
                              ${coin.low_24h?.toLocaleString() ?? "—"}
                            </td>
                            <td className="py-3 px-3 text-xs text-muted-foreground">
                              ${coin.high_24h?.toLocaleString() ?? "—"}
                            </td>
                            <td className="py-3 px-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 text-primary border-primary/30 hover:bg-primary/10"
                                onClick={() => navigate(`/trading?symbol=${coin.id}`)}
                              >
                                Trade
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default DashboardPage;
