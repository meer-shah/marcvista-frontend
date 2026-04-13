import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Save, Edit, Trash2, Info } from "lucide-react";
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { riskProfileApi } from "@/lib/api";
import { toast } from "sonner";
import generateData from "@/modules/RiskProfile/constants/Achartddata";

interface IRiskProfile {
  _id: string;
  title: string;
  description?: string;
  SLallowedperday: number;
  initialRiskPerTrade: number;
  increaseOnWin: number;
  decreaseOnLoss: number;
  maxRisk: number;
  minRisk: number;
  reset: number;
  growthThreshold: number;
  payoutPercentage: number;
  minRiskRewardRatio: number;
  ison: boolean;
  default: boolean;
  createdAt: string;
}

interface TradeResult {
  tradeNumber: number;
  date: string;
  direction: 'Buy' | 'Sell';
  riskPercent: number;
  outcome: 'Win' | 'Loss';
  pnl: number;
  payout: number;
  newBalance: number;
}

interface SimulationSummary {
  winRate: number;
  riskToRewardRatio: number;
  accountSize: number;
  noOfTrades: number;
  finalBalance: number;
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  wins: number;
  losses: number;
  maxDrawdown: number;
  maxBalance: number;
  minBalance: number;
}

interface SimulationData {
  summary: SimulationSummary;
  tradeDetails: TradeResult[];
  balanceOverTrades: Array<{ trade: number; balance: number }>;
}

const StrategySimulationPage: React.FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<IRiskProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<IRiskProfile | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    SLallowedperday: 100,
    initialRiskPerTrade: 0,
    increaseOnWin: 0,
    decreaseOnLoss: 0,
    maxRisk: 100,
    minRisk: 0,
    reset: 10000,
    growthThreshold: 0,
    payoutPercentage: 0,
    minRiskRewardRatio: 1,
    setAsDefault: false,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // User-adjustable parameters (defaults from profile)
  const [winRate, setWinRate] = useState(50);
  const [riskRewardRatio, setRiskRewardRatio] = useState(2);
  const [accountSize, setAccountSize] = useState(1000);
  const [numberOfTrades, setNumberOfTrades] = useState(100);

  useEffect(() => {
    if (profileId) {
      fetchProfile();
    }
  }, [profileId]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await riskProfileApi.getSingle(profileId!);
      setProfile(data);
      // Set defaults from profile
      setWinRate(50);
      setRiskRewardRatio(data.minRiskRewardRatio || 2);
      setAccountSize(1000);
      setNumberOfTrades(100);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch profile');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  const handleRunStrategy = async () => {
    if (!profile) return;

    // Validate risk to reward ratio meets minimum requirement from profile
    if (riskRewardRatio < profile.minRiskRewardRatio) {
      toast.error(`Risk to Reward Ratio cannot be less than ${profile.minRiskRewardRatio}`);
      return;
    }

    setRunning(true);
    try {
      // Simulate with a small delay for UX
      await new Promise(resolve => setTimeout(resolve, 500));

      // Call the exact same function from old frontend
      const results = generateData(
        numberOfTrades,                    // count
        winRate / 100,                     // winRate (as decimal)
        riskRewardRatio,                   // riskRewardRatio
        accountSize,                       // accountSize
        profile.initialRiskPerTrade || 1,  // initialRiskPerTrade
        profile.increaseOnWin || 0,        // increaseOnWin
        profile.decreaseOnLoss || 0,       // decreaseOnLoss
        profile.maxRisk || 100,            // maxRisk
        profile.minRisk || 0,              // minRisk
        profile.reset || 100,              // reset
        profile.growthThreshold || 0,      // growthThreshold
        profile.payoutPercentage || 0,     // payoutPercentage
        profile.SLallowedperday || 100     // SLallowedperday
      );

      // Transform the data to match our display format
      const transformedData: SimulationData = {
        summary: {
          winRate: winRate,
          riskToRewardRatio: riskRewardRatio,
          accountSize: accountSize,
          noOfTrades: numberOfTrades,
          finalBalance: parseFloat(results[results.length - 1].NewBalance),
          totalProfit: 0, // Will calculate from data
          totalLoss: 0,
          netProfit: 0,
          wins: results.filter(t => t.Outcome === 'Win').length,
          losses: results.filter(t => t.Outcome === 'Loss').length,
          maxDrawdown: 0, // Could calculate
          maxBalance: parseFloat(Math.max(...results.map(t => parseFloat(t.NewBalance))).toFixed(2)),
          minBalance: parseFloat(Math.min(...results.map(t => parseFloat(t.NewBalance))).toFixed(2)),
        },
        tradeDetails: results.map((r, idx) => ({
          tradeNumber: r.No,
          date: r.Date,
          direction: r.TradeDirection as 'Buy' | 'Sell',
          riskPercent: parseFloat(r.RiskPercentage),
          outcome: r.Outcome as 'Win' | 'Loss',
          pnl: parseFloat(r.PNL),
          payout: parseFloat(r.Payout),
          newBalance: parseFloat(r.NewBalance),
        })),
        balanceOverTrades: results
          .filter((_, idx) => (idx + 1) % Math.ceil(numberOfTrades / 50) === 0 || idx === results.length - 1)
          .map(r => ({
            trade: r.No,
            balance: parseFloat(r.NewBalance),
          })),
      };

      // Calculate total profit/loss
      transformedData.summary.totalProfit = transformedData.tradeDetails
        .filter(t => t.outcome === 'Win')
        .reduce((sum, t) => sum + t.pnl, 0);
      transformedData.summary.totalLoss = Math.abs(transformedData.tradeDetails
        .filter(t => t.outcome === 'Loss')
        .reduce((sum, t) => sum + t.pnl, 0));
      transformedData.summary.netProfit = transformedData.summary.totalProfit - transformedData.summary.totalLoss;

      // Calculate max drawdown
      let peak = transformedData.summary.accountSize;
      let maxDD = 0;
      for (const trade of transformedData.tradeDetails) {
        if (trade.newBalance > peak) peak = trade.newBalance;
        const dd = ((peak - trade.newBalance) / peak) * 100;
        if (dd > maxDD) maxDD = dd;
      }
      transformedData.summary.maxDrawdown = maxDD;

      setSimulationData(transformedData);
      toast.success('Strategy simulation complete');
    } catch (err: any) {
      toast.error(err.message || 'Failed to run simulation');
    } finally {
      setRunning(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile || !simulationData) return;

    try {
      // Here you could save the simulation results or update the profile with the new parameters
      // For now, navigate back to risk profiles
      toast.success('Profile saved successfully');
      navigate('/risk-profile');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile');
    }
  };

  const handleDiscard = () => {
    if (!profile) return;
    setShowDeleteDialog(true);
  };

  const confirmDiscard = async () => {
    if (!profile) return;

    try {
      await riskProfileApi.delete(profile._id);
      toast.success('Risk profile deleted successfully');
      navigate('/risk-profile');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete profile');
      setShowDeleteDialog(false);
    }
  };

  const handleEdit = () => {
    if (!profile) return;
    setEditingProfile(profile);
    setEditForm({
      title: profile.title,
      description: profile.description || '',
      SLallowedperday: profile.SLallowedperday,
      initialRiskPerTrade: profile.initialRiskPerTrade,
      increaseOnWin: profile.increaseOnWin,
      decreaseOnLoss: profile.decreaseOnLoss,
      maxRisk: profile.maxRisk,
      minRisk: profile.minRisk,
      reset: profile.reset,
      growthThreshold: profile.growthThreshold,
      payoutPercentage: profile.payoutPercentage,
      minRiskRewardRatio: profile.minRiskRewardRatio,
      setAsDefault: profile.default,
    });
    setIsEditing(true);
  };

  const validateEditForm = () => {
    // Validate minRiskRewardRatio > 0
    if (editForm.minRiskRewardRatio <= 0) {
      toast.error('Minimum Risk to Reward Ratio must be greater than 0');
      return false;
    }

    // Validate minRisk <= maxRisk
    if (editForm.minRisk > editForm.maxRisk) {
      toast.error('Min Risk cannot be greater than Max Risk');
      return false;
    }

    // Validate percentages are within 0-100 (excluding increaseOnWin which can exceed 100)
    const percentageFields = [
      editForm.initialRiskPerTrade,
      editForm.payoutPercentage,
      editForm.decreaseOnLoss,
      editForm.SLallowedperday,
      editForm.maxRisk,
      editForm.minRisk,
      editForm.growthThreshold
    ];

    for (const value of percentageFields) {
      if (value < 0 || value > 100) {
        toast.error('All percentage fields must be between 0 and 100');
        return false;
      }
    }

    return true;
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    if (!validateEditForm()) {
      return;
    }

    try {
      await riskProfileApi.update(editingProfile._id, {
        title: editForm.title,
        description: editForm.description,
        SLallowedperday: editForm.SLallowedperday,
        initialRiskPerTrade: editForm.initialRiskPerTrade,
        increaseOnWin: editForm.increaseOnWin,
        decreaseOnLoss: editForm.decreaseOnLoss,
        maxRisk: editForm.maxRisk,
        minRisk: editForm.minRisk,
        reset: editForm.reset,
        growthThreshold: editForm.growthThreshold,
        payoutPercentage: editForm.payoutPercentage,
        minRiskRewardRatio: editForm.minRiskRewardRatio,
      });
      toast.success('Profile updated successfully');
      setIsEditing(false);
      // Refresh profile data
      fetchProfile();
      // Re-run simulation with updated parameters if available
      if (simulationData) {
        handleRunStrategy();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="bg-red-500/20 border-red-500">
          <CardContent className="p-4">
            <p>Profile not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Strategy Simulation</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{profile.title}</span>
              <Button variant="ghost" size="icon" onClick={handleEdit}>
                <Edit className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Parameter Inputs Card */}
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
            <CardHeader>
              <CardTitle className="text-lg">Simulation Parameters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="winRate">Win Rate (%)</Label>
                  <Input
                    id="winRate"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={winRate}
                    onChange={(e) => setWinRate(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="riskRewardRatio">Risk to Reward Ratio</Label>
                  <Input
                    id="riskRewardRatio"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={riskRewardRatio}
                    onChange={(e) => setRiskRewardRatio(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="accountSize">Account Size (USDT)</Label>
                  <Input
                    id="accountSize"
                    type="number"
                    min="1"
                    step="10"
                    value={accountSize}
                    onChange={(e) => setAccountSize(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="numberOfTrades">Number of Trades</Label>
                  <Input
                    id="numberOfTrades"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={numberOfTrades}
                    onChange={(e) => setNumberOfTrades(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={handleRunStrategy} disabled={running} className="w-full">
                  {running ? 'Running...' : 'Run Strategy'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Section */}
          {simulationData && (
            <>
              {/* Summary Stats - WITHOUT input fields */}
              <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg">Strategy Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Win Rate — full width */}
                  <div className="text-center p-4 bg-background/20 rounded-lg">
                    <div className="text-3xl font-bold">{simulationData.summary.winRate.toFixed(2)}%</div>
                    <div className="text-sm text-muted-foreground mt-1">Win Rate</div>
                  </div>

                  {/* 8 metrics in a 4-col grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-background/20 rounded-lg">
                      <div className="text-xl font-bold text-green-500">+{simulationData.summary.totalProfit.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Total Profit</div>
                    </div>
                    <div className="text-center p-3 bg-background/20 rounded-lg">
                      <div className="text-xl font-bold text-red-500">-{simulationData.summary.totalLoss.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Total Loss</div>
                    </div>
                    <div className="text-center p-3 bg-background/20 rounded-lg">
                      <div className={`text-xl font-bold ${simulationData.summary.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {simulationData.summary.netProfit >= 0 ? '+' : ''}{simulationData.summary.netProfit.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">Net P&L</div>
                    </div>
                    <div className="text-center p-3 bg-background/20 rounded-lg">
                      <div className="text-xl font-bold">{simulationData.summary.wins}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Wins</div>
                    </div>
                    <div className="text-center p-3 bg-background/20 rounded-lg">
                      <div className="text-xl font-bold text-red-500">{simulationData.summary.losses}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Losses</div>
                    </div>
                    <div className="text-center p-3 bg-background/20 rounded-lg">
                      <div className="text-xl font-bold">{simulationData.summary.finalBalance.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Final Balance</div>
                    </div>
                    <div className="text-center p-3 bg-background/20 rounded-lg">
                      <div className="text-xl font-bold text-green-500">{simulationData.summary.maxBalance.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Max Balance</div>
                    </div>
                    <div className="text-center p-3 bg-background/20 rounded-lg">
                      <div className="text-xl font-bold text-red-500">{simulationData.summary.minBalance.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Min Balance</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Account Growth Chart */}
              <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg">Account Growth Over Trades</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-96 bg-background/10 rounded-lg p-4">
                    <ChartContainer
                      config={{
                        balance: { label: "Account Balance", color: "#22c55e" },
                      }}
                      className="w-full h-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={simulationData.balanceOverTrades}>
                          <XAxis dataKey="trade" />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line
                            type="monotone"
                            dataKey="balance"
                            stroke="#22c55e"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Trade Details Table */}
              <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg">Trade Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead className="sticky top-0 bg-[#1B1B1B]">
                        <tr className="border-b border-white/10 text-xs text-muted-foreground">
                          <th className="text-left py-2 pr-2">#</th>
                          <th className="text-left py-2 pr-2">Date</th>
                          <th className="text-left py-2 pr-2">Dir</th>
                          <th className="text-left py-2 pr-2">Risk%</th>
                          <th className="text-left py-2 pr-2">Result</th>
                          <th className="text-left py-2 pr-2">PNL</th>
                          <th className="text-left py-2 pr-2">Payout</th>
                          <th className="text-left py-2">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulationData.tradeDetails.map((trade) => (
                          <tr key={trade.tradeNumber} className="border-b border-white/5 hover:bg-background/10">
                            <td className="py-2">{trade.tradeNumber}</td>
                            <td className="py-2">{trade.date}</td>
                            <td className="py-2">{trade.direction}</td>
                            <td className="py-2">{trade.riskPercent}%</td>
                            <td className={`py-2 ${trade.outcome === 'Win' ? 'text-green-500' : 'text-red-500'}`}>
                              {trade.outcome}
                            </td>
                            <td className={`py-2 ${trade.pnl > 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {trade.pnl.toFixed(2)}
                            </td>
                            <td className="py-2">{trade.payout.toFixed(2)}</td>
                            <td className="py-2">{trade.newBalance.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Bottom Action Buttons */}
              <div className="flex gap-4 justify-end">
                <Button variant="destructive" onClick={handleDiscard} className="w-32">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Discard
                </Button>
                <Button onClick={handleSaveProfile} className="w-32">
                  <Save className="w-4 h-4 mr-2" />
                  Save Risk Profile
                </Button>
              </div>
            </>
          )}

          {/* Edit Profile Dialog */}
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
            <DialogContent className="bg-[#1B1B1B] border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Risk Profile</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="editTitle">Title *</Label>
                    <Input
                      id="editTitle"
                      value={editForm.title}
                      onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="editDescription">Description</Label>
                    <Input
                      id="editDescription"
                      value={editForm.description}
                      onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Initial Risk Per Trade (%)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the amount of risk you're willing to take per trade as a percentage of your account. This field is required. Must be between 0 and 100.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editForm.initialRiskPerTrade}
                      onChange={(e) => setEditForm({...editForm, initialRiskPerTrade: Number(e.target.value)})}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Minimum Risk to Reward Ratio</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the minimum acceptable risk to reward ratio for trades. Must be greater than 0.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={editForm.minRiskRewardRatio}
                      onChange={(e) => setEditForm({...editForm, minRiskRewardRatio: Number(e.target.value)})}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Payout Percentage (%)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the payout percentage for the trades. Must be between 0 and 100. This is the percentage of profit you take when you win.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editForm.payoutPercentage}
                      onChange={(e) => setEditForm({...editForm, payoutPercentage: Number(e.target.value)})}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Increase on Win (%)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the percentage increase in risk after reaching a winning checkpoint. Can be positive or negative. Positive values compound gains.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      value={editForm.increaseOnWin}
                      onChange={(e) => setEditForm({...editForm, increaseOnWin: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Decrease on Loss (%)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the percentage decrease in risk after a losing trade. Must be between 0 and 100. This helps protect your capital.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editForm.decreaseOnLoss}
                      onChange={(e) => setEditForm({...editForm, decreaseOnLoss: Number(e.target.value)})}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>SL Allowed Per Day</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the maximum number of stop loss hits allowed per day. Must be 1 or higher. Once reached, trading stops for the day.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={editForm.SLallowedperday}
                      onChange={(e) => setEditForm({...editForm, SLallowedperday: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Reset Point</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the number of consecutive wins or losses after which your risk resets to the initial value. Must be 0 or higher. Set to 0 to disable.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={editForm.reset}
                      onChange={(e) => setEditForm({...editForm, reset: Number(e.target.value)})}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Max Risk (%)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the maximum risk percentage allowed per trade. Must be between 0 and 100. Your risk will never exceed this limit.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editForm.maxRisk}
                      onChange={(e) => setEditForm({...editForm, maxRisk: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Min Risk (%)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the minimum risk percentage allowed per trade. Must be between 0 and 100. Your risk will never go below this limit.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editForm.minRisk}
                      onChange={(e) => setEditForm({...editForm, minRisk: Number(e.target.value)})}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Growth Threshold</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[14rem]">
                            <p>Specify the % percent of account growth after which you will get a payout. Must be between 0 and 100. Set to 0 to disable.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editForm.growthThreshold}
                      onChange={(e) => setEditForm({...editForm, growthThreshold: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full">
                  Save Changes
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Risk Profile?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete the risk profile "{profile?.title}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  );
};

export default StrategySimulationPage;
