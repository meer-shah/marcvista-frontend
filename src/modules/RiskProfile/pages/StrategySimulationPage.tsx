import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Save, Edit, Trash2, Info, ArrowLeft } from "lucide-react";
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
import { riskProfileApi } from "@/lib/api";
import BalanceCurveChart from "@/modules/UserPortfolio/components/BalanceCurveChart";
import CubeBar from "@/modules/UserPortfolio/components/CubeBar";
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
  // Keep the Trade Breakdown table scrolled to the bottom so the most recent
  // (last) simulated trades are in view by default — table is chronological.
  const tradeTableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tradeTableRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [simulationData?.tradeDetails]);
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
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate('/risk-profile')}
          title="Back to Risk Profiles"
          aria-label="Back to Risk Profiles"
          className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10"
        >
          <ArrowLeft className="w-4 h-4 text-gray-300" />
        </button>
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
      <div>
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/risk-profile')}
                title="Back"
                aria-label="Back"
                className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10"
              >
                <ArrowLeft className="w-4 h-4 text-gray-300" />
              </button>
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
          <Card className="bg-[#0a0a0a] border-white/[0.07] rounded-2xl shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)]">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-gray-200">Simulation Parameters</CardTitle>
            </CardHeader>
            <CardContent className="py-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label htmlFor="winRate" className="text-[11px] text-muted-foreground">Win Rate (%)</Label>
                  <Input
                    id="winRate"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={winRate}
                    onChange={(e) => setWinRate(Number(e.target.value))}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="riskRewardRatio" className="text-[11px] text-muted-foreground">Risk to Reward Ratio</Label>
                  <Input
                    id="riskRewardRatio"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={riskRewardRatio}
                    onChange={(e) => setRiskRewardRatio(Number(e.target.value))}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="accountSize" className="text-[11px] text-muted-foreground">Account Size (USDT)</Label>
                  <Input
                    id="accountSize"
                    type="number"
                    min="1"
                    step="10"
                    value={accountSize}
                    onChange={(e) => setAccountSize(Number(e.target.value))}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="numberOfTrades" className="text-[11px] text-muted-foreground">Number of Trades</Label>
                  <Input
                    id="numberOfTrades"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={numberOfTrades}
                    onChange={(e) => setNumberOfTrades(Number(e.target.value))}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
              <div className="mt-3">
                <Button onClick={handleRunStrategy} disabled={running} className="w-full h-8 text-xs">
                  {running ? 'Running...' : 'Run Strategy'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Section */}
          {simulationData && (
            <>
              {/* Account growth curve (left) + strategy results stats (right) */}
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 min-w-0 h-[260px]">
                  <BalanceCurveChart data={simulationData.balanceOverTrades.map((p) => ({ name: String(p.trade), balance: p.balance }))} />
                </div>
                <div className="lg:w-64 lg:h-[260px] shrink-0 rounded-2xl bg-white border border-black/5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] p-3 flex flex-col overflow-hidden">
                  <div className="text-xs font-medium text-gray-900 mb-1">Strategy Results</div>
                  <div className="flex flex-col gap-2 w-full flex-1 justify-center">
                    {(() => {
                      const s = simulationData.summary;
                      const f = (n: number) => (n ?? 0).toFixed(2);
                      const money = [s.netProfit, s.totalProfit, s.totalLoss, s.finalBalance, s.maxBalance, s.minBalance].map(Number);
                      const maxMoney = Math.max(1, ...money.map((v) => Math.abs(v || 0)));
                      const noBar = [
                        { label: 'Wins / Losses', value: `${s.wins} / ${s.losses}` },
                        { label: 'Max / Min Balance', value: `${f(s.maxBalance)} / ${f(s.minBalance)}` },
                      ];
                      const bars = [
                        { label: 'Win Rate', value: `${f(s.winRate)}%`, frac: (Number(s.winRate) || 0) / 100 },
                        { label: 'Net Profit', value: f(s.netProfit), frac: Math.abs(Number(s.netProfit) || 0) / maxMoney },
                        { label: 'Max Drawdown', value: `${f(s.maxDrawdown)}%`, frac: (Number(s.maxDrawdown) || 0) / 100 },
                        { label: 'Total Profit', value: f(s.totalProfit), frac: Math.abs(Number(s.totalProfit) || 0) / maxMoney },
                        { label: 'Total Loss', value: f(s.totalLoss), frac: Math.abs(Number(s.totalLoss) || 0) / maxMoney },
                        { label: 'Final Balance', value: f(s.finalBalance), frac: Math.abs(Number(s.finalBalance) || 0) / maxMoney },
                      ];
                      return (
                        <>
                          <div className="space-y-1.5">
                            {noBar.map((st) => (
                              <div key={st.label} className="flex items-baseline justify-between gap-2 leading-none">
                                <span className="text-[10px] text-gray-900">{st.label}</span>
                                <span className="text-[9px] font-medium tracking-tight text-gray-500">{st.value}</span>
                              </div>
                            ))}
                          </div>
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

              {/* Trade Breakdown */}
              <div>
                <div className="text-sm font-medium text-gray-200 mb-2">Trade Breakdown</div>
                <div ref={tradeTableRef} className="overflow-auto h-[155px] rounded-2xl border border-white/10 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-black [&::-webkit-scrollbar-corner]:bg-black [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full">
                  <table className="w-full text-[11px] [&_th]:!py-1 [&_td]:!py-1 [&_th]:!px-2 [&_td]:!px-2">
                    <thead className="sticky top-0 z-10 bg-[#0a0a0a]">
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left">#</th>
                        <th className="text-left">Date</th>
                        <th className="text-left">Dir</th>
                        <th className="text-right">Risk%</th>
                        <th className="text-left">Result</th>
                        <th className="text-right">PNL</th>
                        <th className="text-right">Payout</th>
                        <th className="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulationData.tradeDetails.map((trade) => (
                        <tr key={trade.tradeNumber} className="border-b hover:bg-white/[0.02]">
                          <td className="text-muted-foreground">{trade.tradeNumber}</td>
                          <td className="whitespace-nowrap text-muted-foreground">{trade.date}</td>
                          <td>
                            <span className={['buy', 'long'].includes(String(trade.direction).toLowerCase()) ? 'text-green-500' : 'text-red-500'}>{trade.direction}</span>
                          </td>
                          <td className="text-right">{trade.riskPercent}%</td>
                          <td>
                            <Badge className={`${trade.outcome === 'Win' ? 'bg-[#16a34a]' : 'bg-[#dc2626]'} text-white text-[10px] px-2 rounded-full justify-center min-w-[66px] border-transparent`}>{trade.outcome}</Badge>
                          </td>
                          <td className={`text-right font-medium ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{trade.pnl.toFixed(2)}</td>
                          <td className="text-right">{trade.payout.toFixed(2)}</td>
                          <td className="text-right font-medium">{trade.newBalance.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="flex gap-3 justify-end">
                <Button onClick={handleDiscard} className="bg-[#dc2626] hover:bg-[#b91c1c] text-white px-5 justify-center">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Discard
                </Button>
                <Button onClick={handleSaveProfile} className="px-5 justify-center">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
