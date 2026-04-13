import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { Plus, Trash2, Target, Info } from "lucide-react";
import { goalApi, portfolioSummaryApi, orderApi } from "@/lib/api";
import { toast } from "sonner";

interface Goal {
  _id: string;
  goalType: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  goalAmount: number;
  createdAt: string;
}

interface DividedGoal extends Goal {
  type: string;
  amount: number;
  parentType?: string;
  isMain?: boolean;
  isSub?: boolean;
  progress?: number; // 0-100
  achieved?: number; // profit achieved in current window
  windowStart?: Date;
  windowEnd?: Date;
  timeElapsed?: number; // days/hours elapsed in current window
  totalDuration?: number; // total days in window
}

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

const UserPortfolioPage = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dividedGoals, setDividedGoals] = useState<DividedGoal[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]); // Closed trade history
  const [loading, setLoading] = useState(true);
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({
    type: 'Daily' as Goal['type'],
    target: 0
  });
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [showDeleteGoalDialog, setShowDeleteGoalDialog] = useState(false);

  const fetchGoals = async () => {
    try {
      const data = await goalApi.getAll();
      setGoals(data.goals || []);
    } catch (err: any) {
      console.error('Error fetching goals:', err);
      toast.error(err.message || 'Failed to fetch goals');
    }
  };

  const fetchPortfolioSummary = async () => {
    try {
      const data = await portfolioSummaryApi.getSummary();
      setSummary(data);
    } catch (err: any) {
      console.error('Error fetching portfolio summary:', err);
      toast.error(err.message || 'Failed to fetch portfolio summary');
    }
  };

  const fetchPositions = async () => {
    try {
      const data = await orderApi.getPositions();
      setPositions(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching positions:', err);
      // Positions are optional for portfolio, don't set error
      setPositions([]);
    }
  };

  const fetchTrades = async () => {
    try {
      const data = await orderApi.getTradeHistory();
      const tradesArray = data?.trades || data;
      setTrades(Array.isArray(tradesArray) ? tradesArray : []);
    } catch (err: any) {
      console.error('Error fetching trades:', err);
      setTrades([]);
    }
  };

  // Polling function to update data without loading indicator
  const pollAllData = useCallback(async () => {
    try {
      const [goalsData, summaryData, positionsData, tradesData] = await Promise.all([
        goalApi.getAll(),
        portfolioSummaryApi.getSummary(),
        orderApi.getPositions(),
        orderApi.getTradeHistory()
      ]);
      setGoals(goalsData.goals || []);
      setSummary(summaryData);
      setPositions(Array.isArray(positionsData) ? positionsData : []);
      const tradesArray = tradesData?.trades || tradesData;
      setTrades(Array.isArray(tradesArray) ? tradesArray : []);
    } catch (err) {
      console.error('Polling error:', err);
      // Silently ignore; data will be stale until next successful poll
    }
  }, [setGoals, setSummary, setPositions, setTrades]);

  // Initial data fetch on mount
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchGoals(),
          fetchPortfolioSummary(),
          fetchPositions(),
          fetchTrades()
        ]);
      } catch (err: any) {
        toast.error(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
  }, []);

  // Set up polling for real-time updates
  useEffect(() => {
    const intervalId = setInterval(() => {
      pollAllData();
    }, 10000); // Poll every 10 seconds
    return () => clearInterval(intervalId);
  }, [pollAllData]);

  const calculateDividedGoals = (goal: Goal): DividedGoal[] => {
    const goalAmount = parseFloat(goal.goalAmount) || 0;
    const divided: DividedGoal[] = [];

    // Always add the main goal first
    divided.push({
      ...goal,
      type: goal.goalType,
      amount: goalAmount,
      isMain: true
    });

    // Add subdivided goals based on type
    switch(goal.goalType) {
      case 'Yearly':
        divided.push(
          {
            ...goal,
            type: 'Quarterly',
            amount: goalAmount / 4,
            parentType: goal.goalType,
            isSub: true
          },
          {
            ...goal,
            type: 'Monthly',
            amount: goalAmount / 12,
            parentType: goal.goalType,
            isSub: true
          },
          {
            ...goal,
            type: 'Weekly',
            amount: goalAmount / 52,
            parentType: goal.goalType,
            isSub: true
          },
          {
            ...goal,
            type: 'Daily',
            amount: goalAmount / 365,
            parentType: goal.goalType,
            isSub: true
          }
        );
        break;
      case 'Quarterly':
        divided.push(
          {
            ...goal,
            type: 'Monthly',
            amount: goalAmount / 3,
            parentType: goal.goalType,
            isSub: true
          },
          {
            ...goal,
            type: 'Weekly',
            amount: goalAmount / 13,
            parentType: goal.goalType,
            isSub: true
          },
          {
            ...goal,
            type: 'Daily',
            amount: goalAmount / 91,
            parentType: goal.goalType,
            isSub: true
          }
        );
        break;
      case 'Monthly':
        divided.push(
          {
            ...goal,
            type: 'Weekly',
            amount: goalAmount / 4,
            parentType: goal.goalType,
            isSub: true
          },
          {
            ...goal,
            type: 'Daily',
            amount: goalAmount / 30,
            parentType: goal.goalType,
            isSub: true
          }
        );
        break;
      case 'Weekly':
        divided.push({
          ...goal,
          type: 'Daily',
          amount: goalAmount / 7,
          parentType: goal.goalType,
          isSub: true
        });
        break;
      default:
        // For Daily and other types, no subdivision needed
        break;
    }

    return divided;
  };

  // Helper to get period length in days
  const getPeriodLengthDays = (periodType: string): number => {
    switch(periodType) {
      case 'Daily': return 1;
      case 'Weekly': return 7;
      case 'Monthly': return 30; // Approximate month
      case 'Quarterly': return 91;
      case 'Yearly': return 365;
      default: return 1;
    }
  };

  // Compute goal progress based on trades within current time window
  useEffect(() => {
    if (goals.length === 0) {
      setDividedGoals([]);
      return;
    }

    const now = new Date();
    const enrichedGoals: DividedGoal[] = [];

    goals.forEach(goal => {
      const divided = calculateDividedGoals(goal);
      divided.forEach(dg => {
        const periodLengthDays = getPeriodLengthDays(dg.type);
        const periodLengthMs = periodLengthDays * 24 * 60 * 60 * 1000;
        const createdAt = new Date(goal.createdAt);
        const elapsedMs = now.getTime() - createdAt.getTime();
        const periodIndex = Math.max(0, Math.floor(elapsedMs / periodLengthMs));
        const windowStart = new Date(createdAt.getTime() + periodIndex * periodLengthMs);
        const windowEnd = new Date(windowStart.getTime() + periodLengthMs);

        // Sum profits from trades closed within window (up to now)
        const windowTrades = trades.filter(t => {
          // Use only closedAt or updatedAt to ensure we're using closed trade timestamp
          const ts = Number(t.closedAt || t.updatedAt);
          if (!ts) return false;
          const tradeTime = new Date(ts);
          return tradeTime >= windowStart && tradeTime <= now;
        });

        const achieved = windowTrades.reduce((sum, t) => {
          const pnl = parseFloat(t.pnl || t.profit || 0);
          return sum + (isNaN(pnl) ? 0 : pnl);
        }, 0);

        const progress = dg.amount > 0 ? (achieved / dg.amount) * 100 : 0;

        enrichedGoals.push({
          ...dg,
          progress: Math.min(progress, 100), // Cap at 100% for display, but actual achieved may exceed
          achieved,
          windowStart,
          windowEnd,
          timeElapsed: (now.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000),
          totalDuration: periodLengthDays
        });
      });
    });

    setDividedGoals(enrichedGoals);
  }, [goals, trades]);

  const addGoal = async () => {
    if (!newGoal.target || newGoal.target <= 0) {
      toast.error('Please enter a valid goal amount');
      return;
    }

    try {
      await goalApi.create({
        goalType: newGoal.type as string,
        goalAmount: newGoal.target
      });
      toast.success('Goal created successfully');
      setIsCreatingGoal(false);
      setNewGoal({ type: 'Daily', target: 0 });
      fetchGoals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create goal');
    }
  };

  const deleteGoal = (goalId: string) => {
    setDeletingGoalId(goalId);
    setShowDeleteGoalDialog(true);
  };

  const confirmDeleteGoal = async () => {
    if (!deletingGoalId) return;

    try {
      await goalApi.delete(deletingGoalId);
      toast.success('Goal deleted successfully');
      fetchGoals();
      setShowDeleteGoalDialog(false);
      setDeletingGoalId(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete goal');
      setShowDeleteGoalDialog(false);
      setDeletingGoalId(null);
    }
  };

  // Compute long/short stats from closed trade history
  const longShortStats = (() => {
    const longTrades = trades.filter(t => (t.side === 'Buy' || t.side === 'Long'));
    const shortTrades = trades.filter(t => (t.side === 'Sell' || t.side === 'Short'));
    const longPnl = longTrades.reduce((sum, t) => sum + parseFloat(t.closedPnl ?? t.pnl ?? 0), 0);
    const shortPnl = shortTrades.reduce((sum, t) => sum + parseFloat(t.closedPnl ?? t.pnl ?? 0), 0);
    const longProfit = longTrades.reduce((sum, t) => { const v = parseFloat(t.closedPnl ?? t.pnl ?? 0); return sum + (v > 0 ? v : 0); }, 0);
    const longLoss = longTrades.reduce((sum, t) => { const v = parseFloat(t.closedPnl ?? t.pnl ?? 0); return sum + (v < 0 ? v : 0); }, 0);
    const shortProfit = shortTrades.reduce((sum, t) => { const v = parseFloat(t.closedPnl ?? t.pnl ?? 0); return sum + (v > 0 ? v : 0); }, 0);
    const shortLoss = shortTrades.reduce((sum, t) => { const v = parseFloat(t.closedPnl ?? t.pnl ?? 0); return sum + (v < 0 ? v : 0); }, 0);
    return { longCount: longTrades.length, shortCount: shortTrades.length, longPnl, shortPnl, longProfit, longLoss, shortProfit, shortLoss };
  })();

  // Compute best/worst coins from trade history
  const coinPnlMap: Record<string, number> = {};
  trades.forEach(t => {
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
      { name: 'Long', value: total > 0 ? (longShortStats.longCount / total) * 100 : 0, fill: '#22c55e' },
      { name: 'Short', value: total > 0 ? (longShortStats.shortCount / total) * 100 : 0, fill: '#ef4444' }
    ];
  })();

  return (
    <>
      <div className="space-y-4 sm:space-y-6 w-full min-w-0">

          {/* Win / Loss Overview - full width */}
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 w-full">
            <CardHeader>
              <CardTitle className="text-sm sm:text-lg">Win / Loss Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const winCount = trades.filter(t => parseFloat(t.closedPnl ?? t.pnl ?? 0) > 0).length;
                const lossCount = trades.filter(t => parseFloat(t.closedPnl ?? t.pnl ?? 0) < 0).length;
                const total = winCount + lossCount;
                const winPct = total > 0 ? Math.round((winCount / total) * 100) : 0;
                const winLossData = [
                  { name: 'Wins', value: winCount || 0, fill: '#22c55e' },
                  { name: 'Losses', value: lossCount || 0, fill: '#ef4444' },
                ];
                return (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="h-48 w-full sm:w-64 shrink-0">
                      <ChartContainer config={{ wins: { label: 'Wins', color: '#22c55e' }, losses: { label: 'Losses', color: '#ef4444' } }} className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={winLossData} cx="50%" cy="50%" innerRadius="35%" outerRadius="55%" dataKey="value">
                              {winLossData.map((entry, index) => (
                                <Cell key={`wl-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <ChartTooltip content={<ChartTooltipContent />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </div>
                    <div className="flex flex-col gap-3 flex-1 w-full">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
                        <div className="text-2xl font-bold text-blue-400">{winPct}%</div>
                        <div className="w-full bg-white/5 rounded-full h-2 mt-1 overflow-hidden">
                          <div className="h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700" style={{ width: `${winPct}%` }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                          <div className="font-bold text-green-400">{winCount}</div>
                          <div className="text-xs text-muted-foreground">Wins</div>
                        </div>
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                          <div className="font-bold text-red-400">{lossCount}</div>
                          <div className="text-xs text-muted-foreground">Losses</div>
                        </div>
                        <div className="p-3 rounded-lg bg-white/5 border border-white/8">
                          <div className="font-bold">{total}</div>
                          <div className="text-xs text-muted-foreground">Total Trades</div>
                        </div>
                        <div className="p-3 rounded-lg bg-white/5 border border-white/8">
                          <div className="font-bold">${(summary?.balance ?? 0).toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">Balance</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Trade Metrics Summary - full width */}
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 w-full">
            <CardHeader>
              <CardTitle className="text-sm sm:text-lg">Trade Metrics Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const metricsData = [
                  { label: 'Avg Trade P&L', value: `$${(summary?.avgTradeProfit ?? 0).toFixed(2)}`, color: (summary?.avgTradeProfit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400' },
                  { label: 'Best Trade', value: `$${(summary?.bestTrade?.pnl ?? 0).toFixed(2)}`, sub: summary?.bestTrade?.symbol, color: 'text-green-400' },
                  { label: 'Worst Trade', value: `$${(summary?.worstTrade?.pnl ?? 0).toFixed(2)}`, sub: summary?.worstTrade?.symbol, color: 'text-red-400' },
                  { label: 'Realized P&L', value: `$${(summary?.totalRealizedPnl ?? 0).toFixed(2)}`, color: (summary?.totalRealizedPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400' },
                  { label: 'Unrealized P&L', value: `$${(summary?.totalUnrealizedPnl ?? 0).toFixed(2)}`, color: (summary?.totalUnrealizedPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400' },
                  { label: 'Total Trades', value: String(summary?.totalTrades ?? 0), color: 'text-foreground' },
                ];
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {metricsData.map((m, i) => (
                      <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/8">
                        <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                        {m.sub && <div className="text-[10px] text-muted-foreground">{m.sub}</div>}
                        <div className="text-xs text-muted-foreground mt-0.5">{m.label}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>


          {/* Financial Goals */}
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 w-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-400" />
                  Financial Goals
                </CardTitle>
                {goals.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs gap-1"
                    onClick={() => deleteGoal(goals[0]._id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Goal
                  </Button>
                ) : (
                  <Dialog open={isCreatingGoal} onOpenChange={setIsCreatingGoal}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="border-white/10 text-xs gap-1">
                        <Plus className="w-3.5 h-3.5" /> Add Goal
                      </Button>
                    </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Goal</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label>Goal Type</Label>
                        <Select value={newGoal.type} onValueChange={(v) => setNewGoal(g => ({ ...g, type: v as Goal['type'] }))}>
                          <SelectTrigger className="bg-background/20 border-white/10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['Daily','Weekly','Monthly','Quarterly','Yearly'] as const).map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Target Amount ($)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={newGoal.target || ''}
                          onChange={(e) => setNewGoal(g => ({ ...g, target: parseFloat(e.target.value) || 0 }))}
                          placeholder="e.g. 500"
                          className="bg-background/20 border-white/10"
                        />
                      </div>
                      <Button onClick={addGoal} className="w-full button-gradient text-black font-semibold">
                        Create Goal
                      </Button>
                    </div>
                  </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {dividedGoals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No goals set. Add a goal to track your progress.</p>
              ) : (
                <div className="space-y-3">
                  {dividedGoals.map((dg, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border ${dg.isMain ? 'border-blue-500/20 bg-blue-500/5' : 'border-white/8 bg-white/3'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dg.isMain ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-muted-foreground'}`}>
                            {dg.type}
                          </span>
                          {dg.isSub && dg.parentType && (
                            <span className="text-[10px] text-muted-foreground">from {dg.parentType}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">${dg.amount.toFixed(2)}</span>
                          {dg.isMain && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-6 h-6 text-muted-foreground hover:text-red-400"
                              onClick={() => deleteGoal(dg._id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-blue-300 transition-all duration-700"
                          style={{ width: `${Math.min(dg.progress ?? 0, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                        <span>${(dg.achieved ?? 0).toFixed(2)} achieved</span>
                        <span>{Math.min(Math.round(dg.progress ?? 0), 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 w-full min-w-0">
            {/* Monthly Profit Chart */}
            <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
              <CardHeader>
                <CardTitle className="text-sm sm:text-lg">Monthly Profit/Loss</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 sm:h-64 w-full">
                  {summary?.monthlyProfit && summary.monthlyProfit.length > 0 ? (
                    <ChartContainer
                      config={{ profit: { label: "Profit/Loss", color: "#22c55e" } }}
                      className="w-full h-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={summary.monthlyProfit} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <XAxis dataKey="month" fontSize={12} />
                          <YAxis fontSize={12} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                            {summary.monthlyProfit.map((entry: any, index: number) => (
                              <Cell key={`month-${index}`} fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'} />
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
            </Card>

            {/* Trading Volume per Coin */}
            <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
              <CardHeader>
                <CardTitle className="text-sm sm:text-lg">Trading Volume per Coin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 sm:h-64 w-full">
                  {summary?.tradingVolumePerCoin && summary.tradingVolumePerCoin.length > 0 ? (
                    <ChartContainer
                      config={{}}
                      className="w-full h-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <Pie
                            data={summary.tradingVolumePerCoin}
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={60}
                            dataKey="percentage"
                            nameKey="symbol"
                          >
                            {summary.tradingVolumePerCoin.map((entry: any, index: number) => (
                              <Cell key={index} fill={['#F7931A', '#627EEA', '#F3BA2F', '#8b5cf6', '#22c55e', '#ef4444', '#3b82f6', '#eab308', '#ec4899', '#14b8a6'][index % 10]} />
                            ))}
                          </Pie>
                          <ChartTooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">No volume data</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Long/Short Analysis */}
            <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
              <CardHeader>
                <CardTitle className="text-sm sm:text-lg">Long/Short Exposure</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex flex-col items-center gap-2 shrink-0 w-full sm:w-48">
                    <div className="h-44 w-full">
                      <ChartContainer
                        config={{ long: { label: "Long", color: "#22c55e" }, short: { label: "Short", color: "#ef4444" } }}
                        className="w-full h-full"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={computedLongShortData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value">
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
                        <span className="font-semibold text-green-400">{computedLongShortData[0].value.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        <span className="text-muted-foreground">Short</span>
                        <span className="font-semibold text-red-400">{computedLongShortData[1].value.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 flex-1 w-full">
                    <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-green-400">Long</span>
                        <span className="text-xs text-muted-foreground">{longShortStats.longCount} trades</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground mb-0.5">Profit</div>
                          <div className="text-sm font-bold text-green-400">+${longShortStats.longProfit.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-0.5">Loss</div>
                          <div className="text-sm font-bold text-red-400">${longShortStats.longLoss.toFixed(2)}</div>
                        </div>
                      </div>
                      <div className={`text-xs mt-1.5 font-medium ${longShortStats.longPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        Net: {longShortStats.longPnl >= 0 ? '+' : ''}${longShortStats.longPnl.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-red-400">Short</span>
                        <span className="text-xs text-muted-foreground">{longShortStats.shortCount} trades</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground mb-0.5">Profit</div>
                          <div className="text-sm font-bold text-green-400">+${longShortStats.shortProfit.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-0.5">Loss</div>
                          <div className="text-sm font-bold text-red-400">${longShortStats.shortLoss.toFixed(2)}</div>
                        </div>
                      </div>
                      <div className={`text-xs mt-1.5 font-medium ${longShortStats.shortPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        Net: {longShortStats.shortPnl >= 0 ? '+' : ''}${longShortStats.shortPnl.toFixed(2)}
                      </div>
                    </div>
                    {longShortStats.longCount === 0 && longShortStats.shortCount === 0 && (
                      <p className="text-sm text-muted-foreground">No trade history</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Best/Worst Coins */}
            <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
              <CardHeader>
                <CardTitle className="text-sm sm:text-lg">Best & Worst Performing Coins</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-green-500">Best</h4>
                    {tradesBestCoins.length > 0 ? (
                      <div className="space-y-2">
                        {tradesBestCoins.map((coin, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>{coin.symbol}</span>
                            <span className="text-green-500">+${coin.pnl.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No data</p>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-red-500">Worst</h4>
                    {tradesWorstCoins.length > 0 ? (
                      <div className="space-y-2">
                        {tradesWorstCoins.map((coin, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>{coin.symbol}</span>
                            <span className="text-red-500">${coin.pnl.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No data</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
      </div>

    {/* Delete Goal Confirmation Dialog */}
    <AlertDialog open={showDeleteGoalDialog} onOpenChange={setShowDeleteGoalDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Goal?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this goal? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDeleteGoal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default UserPortfolioPage;
