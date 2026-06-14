import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Edit, Trash2, Plus, Info, Eye, BarChart3 } from "lucide-react";
import DefaultIcon from "@/components/DefaultIcon";
import { riskProfileApi, orderApi } from "@/lib/api";
import { toast } from "sonner";

// Interface matching backend RiskProfile model
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
  // Runtime fields (not from backend initially, but may be present)
  previousrisk?: number;
  currentrisk?: number;
  consecutiveWins?: number;
  consecutiveLosses?: number;
}

const RiskProfilePage = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<IRiskProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState<IRiskProfile | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<IRiskProfile | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // True when there's an open position or pending order on the CURRENT
  // exchange. While true, the active risk profile can't be switched — its
  // streak math is mid-trade and changing profiles would corrupt it.
  const [hasOpenTrade, setHasOpenTrade] = useState(false);

  const emptyProfile = {
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
    setAsDefault: false
  };

  const [newProfile, setNewProfile] = useState(emptyProfile);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const data = await riskProfileApi.getAll();
      setProfiles(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch risk profiles');
    } finally {
      setLoading(false);
    }
  };

  // Check for an open position / pending order on the current exchange so we
  // can lock profile-switching while a trade is live. Tolerant of errors
  // (e.g. no connected exchange) — defaults to "no open trade".
  const checkOpenTrades = async () => {
    try {
      const [pos, ord] = await Promise.all([
        orderApi.getPositions().catch(() => []),
        orderApi.getOrders().catch(() => []),
      ]);
      const p = Array.isArray(pos) ? pos : [];
      const o = Array.isArray(ord) ? ord : [];
      setHasOpenTrade(p.length > 0 || o.length > 0);
    } catch {
      setHasOpenTrade(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
    checkOpenTrades();
  }, []);

  const validateForm = () => {
    // Validate minRiskRewardRatio > 0
    if (newProfile.minRiskRewardRatio <= 0) {
      toast.error('Minimum Risk to Reward Ratio must be greater than 0');
      return false;
    }

    // Validate minRisk <= maxRisk
    if (newProfile.minRisk > newProfile.maxRisk) {
      toast.error('Min Risk cannot be greater than Max Risk');
      return false;
    }

    // Validate percentages are within 0-100 (excluding increaseOnWin which can exceed 100)
    const percentageFields = [
      newProfile.initialRiskPerTrade,
      newProfile.payoutPercentage,
      newProfile.decreaseOnLoss,
      newProfile.SLallowedperday,
      newProfile.maxRisk,
      newProfile.minRisk,
      newProfile.growthThreshold
    ];

    for (const value of percentageFields) {
      if (value < 0 || value > 100) {
        toast.error('All percentage fields must be between 0 and 100');
        return false;
      }
    }

    return true;
  };

  const handleCreate = () => {
    setEditingProfile(null);
    setNewProfile(emptyProfile);
    setIsCreating(true);
  };

  const handleEdit = (profile: IRiskProfile) => {
    if (profile.ison) {
      toast.error('Active risk profile cannot be edited. Deactivate it first.');
      return;
    }
    setEditingProfile(profile);
    setNewProfile({
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
      setAsDefault: profile.default
    });
    setIsCreating(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (editingProfile) {
        await riskProfileApi.update(editingProfile._id, {
          title: newProfile.title,
          description: newProfile.description,
          SLallowedperday: newProfile.SLallowedperday,
          initialRiskPerTrade: newProfile.initialRiskPerTrade,
          increaseOnWin: newProfile.increaseOnWin,
          decreaseOnLoss: newProfile.decreaseOnLoss,
          maxRisk: newProfile.maxRisk,
          minRisk: newProfile.minRisk,
          reset: newProfile.reset,
          growthThreshold: newProfile.growthThreshold,
          payoutPercentage: newProfile.payoutPercentage,
          minRiskRewardRatio: newProfile.minRiskRewardRatio
        });
        toast.success('Risk profile updated successfully');
      } else {
        await riskProfileApi.create({
          title: newProfile.title,
          description: newProfile.description,
          SLallowedperday: newProfile.SLallowedperday,
          initialRiskPerTrade: newProfile.initialRiskPerTrade,
          increaseOnWin: newProfile.increaseOnWin,
          decreaseOnLoss: newProfile.decreaseOnLoss,
          maxRisk: newProfile.maxRisk,
          minRisk: newProfile.minRisk,
          reset: newProfile.reset,
          growthThreshold: newProfile.growthThreshold,
          payoutPercentage: newProfile.payoutPercentage,
          minRiskRewardRatio: newProfile.minRiskRewardRatio,
          isDefault: newProfile.setAsDefault
        });
        toast.success('Risk profile created successfully');
      }
      setIsCreating(false);
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save risk profile');
    }
  };

  const handleSaveAndVisualize = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (editingProfile) {
        // For editing: just save and close modal (no navigation)
        await riskProfileApi.update(editingProfile._id, {
          title: newProfile.title,
          description: newProfile.description,
          SLallowedperday: newProfile.SLallowedperday,
          initialRiskPerTrade: newProfile.initialRiskPerTrade,
          increaseOnWin: newProfile.increaseOnWin,
          decreaseOnLoss: newProfile.decreaseOnLoss,
          maxRisk: newProfile.maxRisk,
          minRisk: newProfile.minRisk,
          reset: newProfile.reset,
          growthThreshold: newProfile.growthThreshold,
          payoutPercentage: newProfile.payoutPercentage,
          minRiskRewardRatio: newProfile.minRiskRewardRatio
        });
        toast.success('Risk profile updated successfully');
        setIsCreating(false);
        fetchProfiles();
      } else {
        // For creating: save and navigate to visualization page (no toast)
        const result: any = await riskProfileApi.create({
          title: newProfile.title,
          description: newProfile.description,
          SLallowedperday: newProfile.SLallowedperday,
          initialRiskPerTrade: newProfile.initialRiskPerTrade,
          increaseOnWin: newProfile.increaseOnWin,
          decreaseOnLoss: newProfile.decreaseOnLoss,
          maxRisk: newProfile.maxRisk,
          minRisk: newProfile.minRisk,
          reset: newProfile.reset,
          growthThreshold: newProfile.growthThreshold,
          payoutPercentage: newProfile.payoutPercentage,
          minRiskRewardRatio: newProfile.minRiskRewardRatio,
          isDefault: newProfile.setAsDefault
        });
        const profileId = result.data._id;
        setIsCreating(false);
        fetchProfiles();
        navigate(`/risk-profile/${profileId}/simulate`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save risk profile');
    }
  };

  const handleDelete = (profile: IRiskProfile) => {
    setDeletingProfile(profile);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!deletingProfile) return;

    try {
      await riskProfileApi.delete(deletingProfile._id);
      toast.success('Risk profile deleted successfully');
      fetchProfiles();
      setShowDeleteDialog(false);
      setDeletingProfile(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete profile');
      setShowDeleteDialog(false);
      setDeletingProfile(null);
    }
  };

  const handleToggleActive = async (profile: IRiskProfile, checked: boolean) => {
    // Can't change the active profile while a trade is live on this exchange —
    // the streak/risk math is mid-trade and switching would corrupt it.
    if (hasOpenTrade) {
      toast.error('You have an open trade on this exchange. Close it before changing the active risk profile.');
      return;
    }
    // Enforce on the client too: last remaining profile can't be deactivated.
    if (!checked && profiles.length <= 1) {
      toast.error('Cannot deactivate your only risk profile. Create another profile first.');
      return;
    }
    try {
      await riskProfileApi.activate(profile._id, checked);
      toast.success(checked ? `Profile "${profile.title}" activated` : `Profile "${profile.title}" deactivated`);
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle profile');
      fetchProfiles(); // Revert to server state
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await riskProfileApi.setDefault(id);
      toast.success('Default profile updated');
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to set default');
    }
  };

  const handleVisualize = (profileId: string) => {
    navigate(`/risk-profile/${profileId}/simulate`);
  };

  return (
    <>
      <div>
        <div className="space-y-3">
          <Card className="bg-[#0a0a0a] border-white/[0.07] rounded-2xl shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)]">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm font-medium text-gray-200">Risk Profiles</CardTitle>
              <button
                type="button"
                onClick={handleCreate}
                title="Add Profile"
                aria-label="Add Profile"
                className="w-8 h-8 rounded-full bg-[#e8590c] hover:bg-[#c54a08] flex items-center justify-center transition-colors border border-transparent"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {profiles.length === 0 ? (
                <p className="text-center py-8 text-gray-500">No risk profiles yet. Create one to get started.</p>
              ) : (
                profiles.map((profile) => {
                  const isLast = profiles.length <= 1;
                  const active = profile.ison;
                  // Row appearance: active → orange; inactive DEFAULT → white;
                  // inactive non-default → dark. Text + icon colors follow.
                  const rowBg = active
                    ? 'bg-[#e8590c] border-[#e8590c]'
                    : profile.default
                      ? 'bg-white border-black/5 hover:bg-gray-50'
                      : 'bg-[#141414] border-white/10 hover:bg-[#1a1a1a]';
                  const titleText = active ? 'text-white' : profile.default ? 'text-gray-900' : 'text-gray-100';
                  const descText = active ? 'text-white/70' : profile.default ? 'text-gray-400' : 'text-gray-500';
                  const iconBtn = active
                    ? 'text-white/80 hover:text-white hover:bg-white/15'
                    : profile.default
                      ? 'text-gray-600 hover:text-gray-900 hover:bg-black/5'
                      : 'text-gray-400 hover:text-white hover:bg-white/10';
                  const delBtn = active
                    ? 'text-white/80 hover:text-white hover:bg-white/15'
                    : profile.default
                      ? 'text-gray-600 hover:text-red-600 hover:bg-black/5'
                      : 'text-gray-400 hover:text-red-400 hover:bg-white/10';
                  return (
                    <div
                      key={profile._id}
                      className={`rounded-xl border shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] transition-colors ${rowBg}`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4">
                        {/* Left: switch + title + meta */}
                        <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                          <Switch
                            checked={profile.ison}
                            onCheckedChange={(checked) => handleToggleActive(profile, checked)}
                            disabled={(profile.ison && isLast) || hasOpenTrade}
                            title={
                              hasOpenTrade
                                ? 'Open trade on this exchange — close it before changing the active profile.'
                                : profile.ison && isLast ? 'Cannot deactivate your only profile' : undefined
                            }
                            className={`shrink-0 mt-0.5 md:mt-0 data-[state=checked]:bg-white data-[state=checked]:border-[#333333] data-[state=checked]:[&>span]:bg-[#facc15] ${
                              profile.default && !active ? 'border-black/30' : 'border-white/40'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium truncate ${titleText}`}>{profile.title}</span>
                            </div>
                            <p className={`text-[11px] mt-0.5 truncate ${descText}`}>
                              {profile.description || 'No description'}
                            </p>
                          </div>
                        </div>

                        {/* Right: primary actions + icon actions */}
                        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:justify-end shrink-0">
                          <div className={`flex items-center ml-auto md:ml-2 ${active ? 'border-white/25' : 'border-black/10'}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleVisualize(profile._id)}
                              title="Visualize"
                              className={`w-8 h-8 ${iconBtn}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSetDefault(profile._id)}
                              disabled={profile.default}
                              title="Set as default"
                              className={`w-8 h-8 disabled:opacity-100 ${iconBtn}`}
                            >
                              <DefaultIcon active={profile.default} />
                            </Button>
                            {active ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/real-performance')}
                                title="Performance"
                                className={`w-8 h-8 ${iconBtn}`}
                              >
                                <BarChart3 className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(profile)}
                                title="Edit"
                                className={`w-8 h-8 ${iconBtn}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(profile)}
                              disabled={showDeleteDialog}
                              title="Delete"
                              className={`w-8 h-8 ${delBtn}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogContent className="bg-[#1B1B1B] border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingProfile ? 'Edit Risk Profile' : 'Create Risk Profile'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={newProfile.title}
                      onChange={(e) => setNewProfile({...newProfile, title: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={newProfile.description}
                      onChange={(e) => setNewProfile({...newProfile, description: e.target.value})}
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
                      inputMode="decimal"
                      pattern="[0-9]*[.]?[0-9]+"
                      value={newProfile.initialRiskPerTrade}
                      onChange={(e) => setNewProfile({...newProfile, initialRiskPerTrade: Number(e.target.value)})}
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
                            <p>Specify the minimum acceptable risk to reward ratio for trades. Must be greater than 0. Ratio of potential profit to potential loss.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={newProfile.minRiskRewardRatio}
                      onChange={(e) => setNewProfile({...newProfile, minRiskRewardRatio: Number(e.target.value)})}
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
                      value={newProfile.payoutPercentage}
                      onChange={(e) => setNewProfile({...newProfile, payoutPercentage: Number(e.target.value)})}
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
                      value={newProfile.increaseOnWin}
                      onChange={(e) => setNewProfile({...newProfile, increaseOnWin: Number(e.target.value)})}
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
                      value={newProfile.decreaseOnLoss}
                      onChange={(e) => setNewProfile({...newProfile, decreaseOnLoss: Number(e.target.value)})}
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
                      value={newProfile.SLallowedperday}
                      onChange={(e) => setNewProfile({...newProfile, SLallowedperday: Number(e.target.value)})}
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
                      value={newProfile.reset}
                      onChange={(e) => setNewProfile({...newProfile, reset: Number(e.target.value)})}
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
                      value={newProfile.maxRisk}
                      onChange={(e) => setNewProfile({...newProfile, maxRisk: Number(e.target.value)})}
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
                      value={newProfile.minRisk}
                      onChange={(e) => setNewProfile({...newProfile, minRisk: Number(e.target.value)})}
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
                      value={newProfile.growthThreshold}
                      onChange={(e) => setNewProfile({...newProfile, growthThreshold: Number(e.target.value)})}
                    />
                  </div>
                </div>

                {/* Only show "Set as Default" switch for new profiles */}
                {!editingProfile && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={newProfile.setAsDefault}
                      onCheckedChange={(checked) => setNewProfile({...newProfile, setAsDefault: checked})}
                    />
                    <Label>Set as Default</Label>
                  </div>
                )}

                <div className="flex space-x-2">
                  <Button type="button" onClick={handleSaveAndVisualize} className="flex-1">
                    {editingProfile ? 'Save Risk Profile' : 'Visualize Risk Profile'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Risk Profile?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the risk profile "{deletingProfile?.title}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default RiskProfilePage;
