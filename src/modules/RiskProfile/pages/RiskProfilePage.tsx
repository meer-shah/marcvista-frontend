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
import { Edit, Trash2, Plus, Info, Eye } from "lucide-react";
import DefaultIcon from "@/components/DefaultIcon";
import { riskProfileApi } from "@/lib/api";
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
  const [viewingProfile, setViewingProfile] = useState<IRiskProfile | null>(null);

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

  useEffect(() => {
    fetchProfiles();
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
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Risk Profiles</CardTitle>
              <Button onClick={handleCreate} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Profile
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {profiles.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No risk profiles yet. Create one to get started.</p>
              ) : (
                profiles.map((profile) => (
                  <div key={profile._id} className="flex flex-col p-4 rounded-lg bg-background/20 border border-white/10 gap-2">
                    {/* Row 1: Name + Toggle */}
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{profile.title}</span>
                      <Switch
                        checked={profile.ison}
                        onCheckedChange={(checked) => handleToggleActive(profile, checked)}
                      />
                    </div>
                    {/* Row 2: Description */}
                    <p className="text-sm text-muted-foreground">{profile.description || 'No description'}</p>
                    {/* Row 3: Badges + Visualize */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {profile.default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                        {profile.ison && <Badge variant="default" className="text-xs">Active</Badge>}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVisualize(profile._id)}
                        className="border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                      >
                        Visualize
                      </Button>
                    </div>
                    {/* Row 4: Action icons */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewingProfile(profile)}
                        title="View Parameters"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSetDefault(profile._id)}
                        disabled={profile.default}
                        title="Set as Default"
                        className="disabled:opacity-100"
                      >
                        <DefaultIcon active={profile.default} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(profile)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(profile)}
                        disabled={showDeleteDialog}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
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

    {/* View Parameters Dialog */}
    <Dialog open={!!viewingProfile} onOpenChange={(open) => !open && setViewingProfile(null)}>
      <DialogContent className="bg-[#1B1B1B] border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle>{viewingProfile?.title} — Parameters</DialogTitle>
        </DialogHeader>
        {viewingProfile && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Initial Risk / Trade', value: `${viewingProfile.initialRiskPerTrade}%` },
              { label: 'Min Risk/Reward Ratio', value: `${viewingProfile.minRiskRewardRatio}` },
              { label: 'Increase on Win', value: `${viewingProfile.increaseOnWin}%` },
              { label: 'Decrease on Loss', value: `${viewingProfile.decreaseOnLoss}%` },
              { label: 'Max Risk', value: `${viewingProfile.maxRisk}%` },
              { label: 'Min Risk', value: `${viewingProfile.minRisk}%` },
              { label: 'SL Allowed / Day', value: `${viewingProfile.SLallowedperday}` },
              { label: 'Reset Point', value: `${viewingProfile.reset}` },
              { label: 'Growth Threshold', value: `${viewingProfile.growthThreshold}%` },
              { label: 'Payout %', value: `${viewingProfile.payoutPercentage}%` },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded-lg bg-white/5 border border-white/8">
                <div className="font-semibold">{item.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>

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
