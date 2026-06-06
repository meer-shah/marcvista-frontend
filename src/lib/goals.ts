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

/** Parse a trade's close time. App-ledger trades store ISO strings, exchange
 *  trades store epoch ms — Number("2026-…") is NaN, so handle both. */
function tradeMs(t: any): number {
  const raw = t.closedAt ?? t.updatedAt ?? t.createdAt ?? t.time;
  if (raw == null) return NaN;
  if (typeof raw === "number") return raw;
  const parsed = Date.parse(raw);
  if (!isNaN(parsed)) return parsed;
  const n = Number(raw);
  return isNaN(n) ? NaN : n;
}

/** Sum the realised pnl of trades whose close time falls in [from, to]. */
function sumPnl(trades: any[], from: Date, to: Date): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return (trades || []).reduce((sum, t) => {
    const ms = tradeMs(t);
    if (isNaN(ms) || ms < fromMs || ms > toMs) return sum;
    const pnl = parseFloat(t.closedPnl ?? t.pnl ?? t.profit ?? 0);
    return sum + (isNaN(pnl) ? 0 : pnl);
  }, 0);
}

/**
 * Enrich the divided goals with progress using DYNAMIC RE-PACING.
 *
 * Instead of fixed even slices, every sub-period target is "what you still need
 * per period, from here, to hit the main goal":
 *
 *     target = max(0, mainGoal − achievedSinceStart) ÷ periodsRemaining
 *
 * So a missed day lowers `achievedSinceStart`, which raises `remaining`, which
 * pushes the daily / weekly / monthly targets UP until the goal is back on pace.
 * Symmetrically, getting ahead lowers them; once the goal is fully met every
 * remaining target is $0 (complete). The main goal itself keeps its fixed
 * amount and shows cumulative progress.
 *
 * Progress on each sub-ring = pnl earned in the CURRENT rolling window of that
 * period ÷ the (dynamic) target for that period.
 */
export function buildDividedGoals(
  goals: Goal[],
  trades: any[],
  now: Date = new Date()
): DividedGoal[] {
  if (!goals || goals.length === 0) return [];

  const enriched: DividedGoal[] = [];

  goals.forEach((goal) => {
    const goalAmount = parseFloat(String(goal.goalAmount)) || 0;
    const createdAt = new Date(goal.createdAt ?? now);
    const totalDurationDays = getPeriodLengthDays(goal.goalType);
    const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
    const daysElapsed = elapsedMs / (24 * 60 * 60 * 1000);

    // Cumulative profit over the whole goal window so far → drives re-pacing.
    const achievedSinceStart = sumPnl(trades, createdAt, now);
    const remaining = Math.max(0, goalAmount - achievedSinceStart);

    const divided = calculateDividedGoals(goal);
    divided.forEach((dg) => {
      const periodLengthDays = getPeriodLengthDays(dg.type);
      const periodLengthMs = periodLengthDays * 24 * 60 * 60 * 1000;
      const periodIndex = Math.max(0, Math.floor(elapsedMs / periodLengthMs));
      const windowStart = new Date(createdAt.getTime() + periodIndex * periodLengthMs);
      const windowEnd = new Date(windowStart.getTime() + periodLengthMs);

      // Profit inside the current rolling window of this period type.
      const achieved = sumPnl(trades, windowStart, now);

      let amount: number;
      let progress: number;

      if (dg.isMain) {
        // The main goal keeps its real amount; progress is cumulative.
        amount = goalAmount;
        progress = goalAmount > 0 ? (achievedSinceStart / goalAmount) * 100 : 0;
      } else {
        // Dynamic per-period target = remaining ÷ periods left in the goal window.
        const totalPeriods = Math.max(1, Math.round(totalDurationDays / periodLengthDays));
        const elapsedPeriods = Math.floor(daysElapsed / periodLengthDays);
        const periodsLeft = Math.max(1, totalPeriods - elapsedPeriods);
        amount = remaining / periodsLeft;
        // Goal already met → nothing more needed → period is complete.
        progress = remaining <= 0 ? 100 : amount > 0 ? (achieved / amount) * 100 : 0;
      }

      enriched.push({
        ...dg,
        amount,
        progress: Math.max(0, Math.min(progress, 100)),
        achieved: dg.isMain ? achievedSinceStart : achieved,
        windowStart,
        windowEnd,
        timeElapsed: (now.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000),
        totalDuration: periodLengthDays,
      });
    });
  });

  return enriched;
}
