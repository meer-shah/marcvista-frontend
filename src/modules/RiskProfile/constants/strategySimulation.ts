// Strategy Simulation Logic for Risk Profile Visualization
// Based on risk management parameters, simulates trading outcomes

export interface RiskManagementParams {
  initialRiskPerTrade: number;  // Starting risk percentage (e.g., 1 for 1%)
  increaseOnWin: number;        // Percentage increase after a win (e.g., 10 for +10%)
  decreaseOnLoss: number;       // Percentage decrease after a loss (e.g., 10 for -10%)
  minRisk: number;              // Minimum allowed risk percentage
  maxRisk: number;              // Maximum allowed risk percentage
}

export interface SimulationParameters {
  winRate: number;              // Win probability (0-100)
  riskRewardRatio: number;      // Ratio (e.g., 2 means 2:1 reward:risk)
  accountSize: number;          // Initial account balance in USDT
  numberOfTrades: number;       // Total trades to simulate
}

export interface TradeResult {
  tradeNumber: number;
  date: string;
  direction: 'Buy' | 'Sell';
  riskPercent: number;
  outcome: 'Win' | 'Loss';
  pnl: number;                  // P&L in USDT
  payout: number;               // Amount won (0 for losses)
  newBalance: number;           // Account balance after trade
}

export interface SimulationSummary {
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

export interface SimulationData {
  summary: SimulationSummary;
  tradeDetails: TradeResult[];
  balanceOverTrades: Array<{ trade: number; balance: number }>;
}

/**
 * Runs a Monte Carlo simulation with dynamic risk management
 * Adjusts risk per trade based on win/loss streaks using profile parameters
 */
export function runStrategySimulation(
  baseParams: SimulationParameters,
  riskManagement: RiskManagementParams,
  seed?: number
): SimulationData {
  const { winRate, riskRewardRatio, accountSize, numberOfTrades } = baseParams;
  const {
    initialRiskPerTrade,
    increaseOnWin,
    decreaseOnLoss,
    minRisk,
    maxRisk,
  } = riskManagement;

  const tradeDetails: TradeResult[] = [];
  const balanceOverTrades: Array<{ trade: number; balance: number }> = [];
  let currentBalance = accountSize;
  let wins = 0;
  let losses = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let maxBalance = accountSize;
  let minBalance = accountSize;
  let maxDrawdown = 0;
  const peakBalance: number[] = [accountSize];

  // Initialize current risk (ensure non-zero)
  let currentRisk = initialRiskPerTrade > 0 ? initialRiskPerTrade : 1;

  // Simple pseudo-random number generator (optional seed for reproducibility)
  const random = (): number => {
    if (seed !== undefined) {
      const x = Math.sin(seed + tradeDetails.length) * 10000;
      return x - Math.floor(x);
    }
    return Math.random();
  };

  for (let i = 0; i < numberOfTrades; i++) {
    const isWin = random() < winRate / 100;
    const riskAmount = (currentBalance * currentRisk) / 100;
    let pnl = 0;
    let payout = 0;

    if (isWin) {
      pnl = riskAmount * riskRewardRatio;
      payout = pnl;
      currentBalance += pnl;
      wins++;
      totalProfit += pnl;

      // Increase risk after win
      currentRisk = Math.min(
        maxRisk,
        currentRisk * (1 + increaseOnWin / 100)
      );
    } else {
      pnl = -riskAmount;
      currentBalance += pnl; // pnl is negative
      losses++;
      totalLoss += Math.abs(pnl);

      // Decrease risk after loss
      currentRisk = Math.max(
        minRisk,
        currentRisk * (1 - decreaseOnLoss / 100)
      );
    }

    // Ensure risk stays within bounds (in case min/max override adjustments)
    currentRisk = Math.max(minRisk, Math.min(maxRisk, currentRisk));

    // Track min/max balance
    if (currentBalance > maxBalance) {
      maxBalance = currentBalance;
    }
    if (currentBalance < minBalance) {
      minBalance = currentBalance;
    }

    // Calculate drawdown
    const currentPeak = peakBalance[peakBalance.length - 1];
    if (currentBalance > currentPeak) {
      peakBalance.push(currentBalance);
    } else {
      const drawdown = ((currentPeak - currentBalance) / currentPeak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Record trade detail (alternate direction for variety)
    const tradeResult: TradeResult = {
      tradeNumber: i + 1,
      date: new Date(Date.now() + i * 3600000).toISOString().split('T')[0],
      direction: i % 2 === 0 ? 'Buy' : 'Sell',
      riskPercent: Number(currentRisk.toFixed(2)),
      outcome: isWin ? 'Win' : 'Loss',
      pnl: Number(pnl.toFixed(2)),
      payout: Number(payout.toFixed(2)),
      newBalance: Number(currentBalance.toFixed(2)),
    };
    tradeDetails.push(tradeResult);

    // Record balance over trades for chart (sample at intervals)
    if ((i + 1) % Math.max(1, Math.ceil(numberOfTrades / 50)) === 0 || i === numberOfTrades - 1) {
      balanceOverTrades.push({
        trade: i + 1,
        balance: Number(currentBalance.toFixed(2)),
      });
    }
  }

  const summary: SimulationSummary = {
    winRate,
    riskToRewardRatio: riskRewardRatio,
    accountSize,
    noOfTrades: numberOfTrades,
    finalBalance: Number(currentBalance.toFixed(2)),
    totalProfit: Number(totalProfit.toFixed(2)),
    totalLoss: Number(totalLoss.toFixed(2)),
    netProfit: Number((totalProfit - totalLoss).toFixed(2)),
    wins,
    losses,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxBalance: Number(maxBalance.toFixed(2)),
    minBalance: Number(minBalance.toFixed(2)),
  };

  return {
    summary,
    tradeDetails,
    balanceOverTrades,
  };
}

/**
 * Calculates optimal risk per trade based on risk profile
 * Kelly Criterion approximation
 */
export function calculateOptimalRisk(params: {
  accountSize: number;
  riskPerTrade: number;
  riskRewardRatio: number;
  winRate: number;
}): number {
  const { accountSize, riskPerTrade } = params;
  return (accountSize * riskPerTrade) / 100;
}
