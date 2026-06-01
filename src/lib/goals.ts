/**
 * Shared goal logic — single source of truth for how a user's one goal is
 * divided into sub-periods and how progress is computed. Used by both the
 * Portfolio page and the Dashboard goal rings so the rules never drift.
 *
 * Goals are stored as a SINGLE goal on the user (the backend allows only one).
 * The division into Quarterly/Monthly/Weekly/Daily is a presentation concern
 * computed here on the client.
 */

export type GoalType = "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";

export interface Goal {
  _id?: string;
  goalType: GoalType;
  goalAmount: number | string;
  createdAt?: string;
}

export interface DividedGoal extends Goal {
  type: string;
  amount: number;
  parentType?: string;
  isMain?: boolean;
  isSub?: boolean;
  // enriched progress fields
  progress?: number; // 0-100 (capped)
  achieved?: number; // profit achieved in current window
  windowStart?: Date;
  windowEnd?: Date;
  timeElapsed?: number; // days
  totalDuration?: number; // days
}

/** Divide one goal into its main + sub-period goals. */
export function calculateDividedGoals(goal: Goal): DividedGoal[] {
  const goalAmount = parseFloat(String(goal.goalAmount)) || 0;
  const divided: DividedGoal[] = [];

  // Always add the main goal first
  divided.push({ ...goal, type: goal.goalType, amount: goalAmount, isMain: true });

  switch (goal.goalType) {
    case "Yearly":
      divided.push(
        { ...goal, type: "Quarterly", amount: goalAmount / 4, parentType: goal.goalType, isSub: true },
        { ...goal, type: "Monthly", amount: goalAmount / 12, parentType: goal.goalType, isSub: true },
        { ...goal, type: "Weekly", amount: goalAmount / 52, parentType: goal.goalType, isSub: true },
        { ...goal, type: "Daily", amount: goalAmount / 365, parentType: goal.goalType, isSub: true }
      );
      break;
    case "Quarterly":
      divided.push(
        { ...goal, type: "Monthly", amount: goalAmount / 3, parentType: goal.goalType, isSub: true },
        { ...goal, type: "Weekly", amount: goalAmount / 13, parentType: goal.goalType, isSub: true },
        { ...goal, type: "Daily", amount: goalAmount / 91, parentType: goal.goalType, isSub: true }
      );
      break;
    case "Monthly":
      divided.push(
        { ...goal, type: "Weekly", amount: goalAmount / 4, parentType: goal.goalType, isSub: true },
        { ...goal, type: "Daily", amount: goalAmount / 30, parentType: goal.goalType, isSub: true }
      );
      break;
    case "Weekly":
      divided.push({ ...goal, type: "Daily", amount: goalAmount / 7, parentType: goal.goalType, isSub: true });
      break;
    default:
      // Daily — no subdivision
      break;
  }

  return divided;
}

/** Period length in days for a goal period type. */
export function getPeriodLengthDays(periodType: string): number {
  switch (periodType) {
    case "Daily": return 1;
    case "Weekly": return 7;
    case "Monthly": return 30; // approximate
    case "Quarterly": return 91;
    case "Yearly": return 365;
    default: return 1;
  }
}

/**
 * Enrich the divided goals with progress, based on trades within the current
 * rolling window (anchored to the goal's createdAt). Mirrors the original
 * Portfolio-page calculation exactly.
 */
export function buildDividedGoals(
  goals: Goal[],
  trades: any[],
  now: Date = new Date()
): DividedGoal[] {
  if (!goals || goals.length === 0) return [];

  const enriched: DividedGoal[] = [];

  goals.forEach((goal) => {
    const divided = calculateDividedGoals(goal);
    divided.forEach((dg) => {
      const periodLengthDays = getPeriodLengthDays(dg.type);
      const periodLengthMs = periodLengthDays * 24 * 60 * 60 * 1000;
      const createdAt = new Date(goal.createdAt ?? now);
      const elapsedMs = now.getTime() - createdAt.getTime();
      const periodIndex = Math.max(0, Math.floor(elapsedMs / periodLengthMs));
      const windowStart = new Date(createdAt.getTime() + periodIndex * periodLengthMs);
      const windowEnd = new Date(windowStart.getTime() + periodLengthMs);

      const windowTrades = (trades || []).filter((t) => {
        const ts = Number(t.closedAt || t.updatedAt);
        if (!ts) return false;
        const tradeTime = new Date(ts);
        return tradeTime >= windowStart && tradeTime <= now;
      });

      const achieved = windowTrades.reduce((sum, t) => {
        const pnl = parseFloat(t.closedPnl ?? t.pnl ?? t.profit ?? 0);
        return sum + (isNaN(pnl) ? 0 : pnl);
      }, 0);

      const progress = dg.amount > 0 ? (achieved / dg.amount) * 100 : 0;

      enriched.push({
        ...dg,
        progress: Math.min(progress, 100),
        achieved,
        windowStart,
        windowEnd,
        timeElapsed: (now.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000),
        totalDuration: periodLengthDays,
      });
    });
  });

  return enriched;
}
