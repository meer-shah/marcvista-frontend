import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { AppCard } from "@/components/common";

export interface GoalRing {
  label: string;   // Yearly / Quarterly / Monthly / Weekly / Daily
  current: number;
  target: number;
  pct: number;     // 0..1
  color: string;
}

interface MainGoal {
  label: string;   // the goal the user actually set (largest period)
  target: number;
  current: number;
  pct: number;     // 0..1 (from backend)
}

type GoalType = "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";

interface Props {
  rings: GoalRing[];
  mainGoal?: MainGoal | null;
  /** Whether the user already has a goal set (drives delete vs add control). */
  hasGoals?: boolean;
  /** Create a new goal. Mirrors the Portfolio page logic. */
  onCreateGoal?: (goalType: GoalType, goalAmount: number) => Promise<void> | void;
  /** Delete the active goal. */
  onDeleteGoal?: () => Promise<void> | void;
}

const fmtMoney = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(v)}`;
};

const GoalsRingCard = ({ rings, mainGoal, hasGoals = false, onCreateGoal, onDeleteGoal }: Props) => {
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newGoal, setNewGoal] = useState<{ type: GoalType; target: number }>({ type: "Daily", target: 0 });
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!newGoal.target || newGoal.target <= 0) return;
    setBusy(true);
    try {
      await onCreateGoal?.(newGoal.type, newGoal.target);
      setIsCreatingGoal(false);
      setNewGoal({ type: "Daily", target: 0 });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDeleteGoal?.();
      setShowDeleteDialog(false);
    } finally {
      setBusy(false);
    }
  };

  const hasAny = rings.some((r) => r.target > 0);
  const activeRings = hasAny ? rings.filter((r) => r.target > 0) : rings;
  const N = Math.max(1, activeRings.length);

  // viewBox + gauge geometry
  const VBW = 320;
  const VBH = 280;
  const cx = 224; // pushed right to leave the left column free for the legend
  const cy = 158; // pushed down so the top-right corner is free for the action icon
  const R_max = 82;
  const R_step = 12;
  const SW = 9;
  // Speedometer sweep. ROT rotates the whole gauge clockwise (degrees).
  const ROT = 40;
  const startAngle = 140 + ROT;
  const endAngle = 400 + ROT; // 260° sweep
  const sweep = endAngle - startAngle;

  const pointAt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const arcPath = (r: number, a0: number, a1: number) => {
    const p0 = pointAt(r, a0);
    const p1 = pointAt(r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
  };

  const geo = activeRings.map((r, i) => {
    const rad = R_max - i * R_step;
    const pct = Math.max(0, Math.min(1, r.pct));
    return {
      r,
      rad,
      pct,
      tip: pointAt(rad, endAngle), // other end — where the label connects
      isInner: i === N - 1,
      trackPath: arcPath(rad, startAngle, endAngle),
      progressPath: arcPath(rad, startAngle, startAngle + pct * sweep),
      hasProgress: pct > 0,
    };
  });

  const num = mainGoal ? Math.round(mainGoal.pct * 100) : 0;

  return (
    <AppCard className="relative w-full aspect-[8/7] sm:aspect-auto sm:h-[clamp(160px,26vh,230px)] lg:h-[clamp(150px,23vh,195px)] overflow-hidden">
      {/* Heading (HTML overlay so it matches the other cards' 14px size, instead
          of the down-scaled SVG text). */}
      <div className="absolute top-4 left-5 z-10 text-sm font-medium text-gray-200">
        {mainGoal ? `${mainGoal.label} Goal` : "Goals"}
      </div>

      {/* Top-right action — delete the active goal, or add one if none set */}
      {hasGoals ? (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            title="Delete goal"
            className="absolute top-4 right-4 z-10 w-6 h-6 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10"
          >
            <Trash2 className="w-3 h-3 text-gray-300 hover:text-red-400" />
          </button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Goal?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this goal? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {busy ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Dialog open={isCreatingGoal} onOpenChange={setIsCreatingGoal}>
          <DialogTrigger asChild>
            <button
              type="button"
              title="Add goal"
              className="absolute top-4 right-4 z-10 w-6 h-6 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10"
            >
              <Plus className="w-3 h-3 text-gray-300" />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Goal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Goal Type</Label>
                <Select
                  value={newGoal.type}
                  onValueChange={(v) => setNewGoal((g) => ({ ...g, type: v as GoalType }))}
                >
                  <SelectTrigger className="bg-background/20 border-white/10 text-base h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="space-y-1">
                    {(["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"] as const).map((t) => (
                      <SelectItem key={t} value={t} className="text-base py-2.5">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Target Amount ($)</Label>
                <Input
                  type="number"
                  min={0}
                  value={newGoal.target || ""}
                  onChange={(e) => setNewGoal((g) => ({ ...g, target: parseFloat(e.target.value) || 0 }))}
                  placeholder="e.g. 500"
                  className="bg-background/20 border-white/10"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={busy}
                className="w-full rounded-full bg-gradient-to-r from-[#e8590c] to-[#f59e0b] hover:opacity-90 transition-opacity text-black font-semibold"
              >
                {busy ? "Creating…" : "Create Goal"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height="100%" className="block select-none">
        <defs>
          <pattern id="goal-stripes" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="3" />
          </pattern>
        </defs>

        {/* Big number (top-left) — heading is an HTML overlay above */}
        <text x={22} y={112} fontSize={50} fontWeight={400} fill="#ffffff" letterSpacing="-0.03em">
          {num}
        </text>
        <text x={24} y={138} fontSize={15} fontWeight={500} fill="#9ca3af">
          {mainGoal ? `${fmtMoney(mainGoal.current)} of ${fmtMoney(mainGoal.target)}` : "no active goals"}
        </text>

        {/* Gauge arcs */}
        {geo.map((g, i) => (
          <g key={`ring-${i}`}>
            <path d={g.trackPath} fill="none" stroke="#262626" strokeWidth={SW} strokeLinecap="round" />
            {g.hasProgress && (
              <path
                d={g.progressPath}
                fill="none"
                stroke={g.isInner ? "url(#goal-stripes)" : g.r.color}
                strokeWidth={SW}
                strokeLinecap="round"
              />
            )}
          </g>
        ))}

        {/* Legend — only the Daily goal value (the main goal is the big number
            up top). Shown larger now that the rest of the rows are gone. */}
        {(() => {
          const daily = activeRings.find((r) => r.label === "Daily");
          if (!daily) return null;
          return (
            <g>
              <text x={20} y={208} fontSize={14} fontWeight={500} fill="#9ca3af">
                Daily
              </text>
              <text x={20} y={246} fontSize={30} fontWeight={400} fill={daily.color} letterSpacing="-0.02em">
                {daily.target > 0 ? fmtMoney(daily.target) : "—"}
              </text>
            </g>
          );
        })()}
      </svg>
    </AppCard>
  );
};

export default GoalsRingCard;
