import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, ExternalLink, Target, Trophy, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useNavigate } from "react-router-dom";
import { orderApi, goalApi, newsApi } from "@/lib/api";

const timeframes = ["1H", "24H", "1W", "1M", "3M", "6M"];

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
  const MS = { "1H": 3_600_000, "24H": 86_400_000, "1W": 7 * 86_400_000, "1M": 30 * 86_400_000, "3M": 90 * 86_400_000, "6M": 180 * 86_400_000 };
  const windowMs = MS[tf as keyof typeof MS] ?? MS["1W"];
  const windowStart = now - windowMs;

  // Trades inside window, sorted ascending by time
  const windowTrades = allTrades
    .filter(t => Number(t.updatedAt || t.closedAt || 0) >= windowStart)
    .sort((a, b) => Number(a.updatedAt || a.closedAt || 0) - Number(b.updatedAt || b.closedAt || 0));

  // Trades after window start have already been added to currentBalance.
  // Baseline = currentBalance - sum of window trades pnl
  const windowPnlSum = windowTrades.reduce((s, t) => s + parseFloat(t.closedPnl ?? t.pnl ?? 0), 0);
  const baseline = currentBalance - windowPnlSum;

  // Bucket definitions
  const buckets: { label: string; end: number }[] = [];
  if (tf === "1H") {
    for (let i = 1; i <= 6; i++) buckets.push({ label: `${i * 10}m`, end: windowStart + i * (windowMs / 6) });
  } else if (tf === "24H") {
    const labels = ["04h", "08h", "12h", "16h", "20h", "24h"];
    for (let i = 0; i < 6; i++) buckets.push({ label: labels[i], end: windowStart + (i + 1) * (windowMs / 6) });
  } else if (tf === "1W") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) buckets.push({ label: days[i], end: windowStart + (i + 1) * (windowMs / 7) });
  } else if (tf === "1M") {
    for (let i = 1; i <= 4; i++) buckets.push({ label: `W${i}`, end: windowStart + i * (windowMs / 4) });
  } else if (tf === "3M") {
    const now3 = new Date(now);
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now3.getFullYear(), now3.getMonth() - i, 1);
      buckets.push({ label: d.toLocaleString("default", { month: "short" }), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() });
    }
  } else {
    const now6 = new Date(now);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now6.getFullYear(), now6.getMonth() - i, 1);
      buckets.push({ label: d.toLocaleString("default", { month: "short" }), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() });
    }
  }

  // Accumulate pnl per bucket
  let running = baseline;
  const points: ChartPoint[] = [];
  for (const bucket of buckets) {
    const inBucket = windowTrades.filter(t => Number(t.updatedAt || t.closedAt || 0) <= bucket.end);
    const pnl = inBucket.reduce((s, t) => s + parseFloat(t.closedPnl ?? t.pnl ?? 0), 0);
    running = baseline + pnl;
    points.push({ name: bucket.label, balance: Math.max(0, parseFloat(running.toFixed(2))) });
  }

  // If no trades, return flat line at current balance
  if (points.every(p => p.balance === baseline)) {
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
    const id = setInterval(fetchMarket, 30_000); // More frequent updates for futures
    return () => clearInterval(id);
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
        const [balRes, tradeRes, posRes, orderRes] = await Promise.all([
          orderApi.getBalance(),
          orderApi.getTradeHistory(),
          orderApi.getPositions(),
          orderApi.getOrders()
        ]);

        const balance = parseFloat(balRes?.balance ?? 0);
        setRealBalance(balance);

        const trades: any[] = tradeRes?.trades ?? (Array.isArray(tradeRes) ? tradeRes : []);
        setAllTrades(trades);

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
  const chartData = buildChartData(allTrades, currentBalance, activeTimeframe);

  // Calculate changePercent from chartData
  const firstPoint = chartData[0]?.balance ?? 0;
  const lastPoint = chartData[chartData.length - 1]?.balance ?? 0;
  const changePercent = firstPoint > 0 
    ? parseFloat(((lastPoint - firstPoint) / firstPoint * 100).toFixed(2)) 
    : 0;

  const isUp = changePercent >= 0;

  const winPct = winrateData.total > 0 ? Math.round((winrateData.wins / winrateData.total) * 100) : 0;
  const goalPct = goalsData ? Math.min(Math.round((goalsData.current / goalsData.target) * 100), 100) : 0;

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
      {/* Header row */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-end gap-3"
      >
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground mb-1">Portfolio Balance</p>
          <div className="flex items-center gap-3 flex-wrap min-h-[40px]">
            {portfolioLoading ? (
              <div className="h-9 w-40 bg-white/5 animate-pulse rounded-md" />
            ) : (
              <>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
                  ${currentBalance.toLocaleString()}.00
                </h1>
                <Badge
                  className={`text-xs font-semibold px-2 py-0.5 ${
                    isUp
                      ? "bg-green-500/15 text-green-400 border-green-500/20"
                      : "bg-red-500/15 text-red-400 border-red-500/20"
                  }`}
                  variant="outline"
                >
                  {isUp ? "↑" : "↓"} {Math.abs(changePercent)}%
                </Badge>
                {fetchError && (
                  <Badge variant="destructive" className="text-[10px] py-0">
                    {fetchError}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
        {/* Timeframe selector */}
        <div className="sm:ml-auto flex items-center gap-0.5 bg-[#1B1B1B]/80 border border-white/10 rounded-lg p-1 flex-wrap max-w-full">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeTimeframe === tf
                  ? "bg-primary text-black"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Main grid: chart + news */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 w-full min-w-0 overflow-hidden">
        {/* Portfolio Chart */}
        <motion.div
          className="lg:col-span-2 min-w-0 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Portfolio Chart</CardTitle>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isUp ? (
                    <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className={isUp ? "text-green-400" : "text-red-400"}>
                    {isUp ? "+" : ""}${(lastPoint - firstPoint).toLocaleString()} this period
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div style={{ width: "100%", height: 260 }}>
                {portfolioLoading ? (
                  <div className="w-full h-full bg-white/5 animate-pulse rounded-lg flex items-center justify-center">
                    <Activity className="w-8 h-8 text-white/10 animate-spin" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4ADE80" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4ADE80" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#71717a", fontSize: 10 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1B1B1B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                        formatter={(value: number) => [`$${value.toLocaleString()}`, "Balance"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="balance"
                        stroke="#4ADE80"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#balanceGradient)"
                        dot={false}
                        activeDot={{ r: 4, fill: "#4ADE80" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* News feed */}
        <motion.div
          className="min-w-0 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Market News</CardTitle>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-3 max-h-[260px] sm:max-h-[300px] overflow-y-auto pr-1">
                {newsLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-3 rounded-lg bg-background/20 border border-white/5 space-y-2">
                        <div className="h-3 bg-white/5 rounded animate-pulse w-full" />
                        <div className="h-3 bg-white/5 rounded animate-pulse w-2/3" />
                      </div>
                    ))
                  : newsItems.length > 0
                  ? newsItems.map((news, i) => (
                      <a
                        key={i}
                        href={news.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block p-3 rounded-lg bg-background/20 hover:bg-background/40 transition-colors border border-white/5"
                      >
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors mb-1.5">
                          {news.title}
                        </p>
                        <div className="flex items-center gap-2">
                          {news.categories[0] && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/10 text-muted-foreground">
                              {news.categories[0]}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">{formatTimeAgo(news.pubDate)}</span>
                        </div>
                      </a>
                    ))
                  : (
                    <p className="text-xs text-muted-foreground text-center py-4">Unable to load news</p>
                  )}
              </div>
            </CardContent>
          </Card>
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
