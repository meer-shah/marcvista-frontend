const generateUniqueDates = (count, SLallowedperday , startDate = new Date()) => {
  const dates = [];
  const dateCounter = {}; // To track occurrences of each date

  for (let i = 0; i < count; i++) {
    let date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    // Ensure no more than trades have the same date
    while (dateCounter[date.toDateString()] >= SLallowedperday) {
      date = new Date(date);
      date.setDate(date.getDate() + 1); // Move to the next day
    }

    dateCounter[date.toDateString()] = (dateCounter[date.toDateString()] || 0) + 1;
    dates.push(date.toISOString().split('T')[0]); // Format date as YYYY-MM-DD
  }

  return dates;
};

function generateData(
  count,
  winRate,
  riskRewardRatio,
  accountSize,
  initialRiskPerTrade,
  increaseOnWin,
  decreaseOnLoss,
  maxRisk,
  minRisk,
  reset,
  growthThreshold,
  payoutPercentage,
  SLallowedperday

) {
  const Data = [];
  let currentBalance = accountSize;
  let riskPerTrade = initialRiskPerTrade;
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let initialBalance = accountSize; // Track initial account balance

  let totalWinDollars = 0;
  let totalLossDollars = 0;
  let totalPayoutDollars = 0;


 console.log( count,
  winRate,
  riskRewardRatio,
  accountSize,
  initialRiskPerTrade,
  increaseOnWin,
  decreaseOnLoss,
  maxRisk,
  minRisk,
  reset,
  growthThreshold,
  payoutPercentage,
  SLallowedperday)
  // Convert winRate from decimal to percentage
  const winRateDecimal = winRate;

  // Calculate the number of wins and losses
  const numWins = Math.round(count * winRateDecimal);
  const numLosses = count - numWins;

  // Create an array of outcomes
  let outcomes = Array(numWins).fill('Win').concat(Array(numLosses).fill('Loss'));

  // Shuffle outcomes
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }

  for (let i = 0; i < count; i++) {
    let tradeDirection = Math.random() > 0.5 ? 'Buy' : 'Sell';
    let outcome = outcomes[i];
    const riskAmount = currentBalance * (riskPerTrade / 100);
    let pnl;

    if (outcome === 'Win') {
      pnl = riskAmount * riskRewardRatio;
      totalWinDollars += pnl;
    } else {
      pnl = -riskAmount;
      totalLossDollars += -pnl;
    }

    currentBalance += pnl;
    let payout = 0;

    // Check for payout based on growth threshold
    if (currentBalance >= initialBalance * (1 + growthThreshold / 100)) {
      const profit = currentBalance - initialBalance;
      payout = profit * (payoutPercentage / 100);
      currentBalance -= payout;
      initialBalance = currentBalance; // Update initial balance to current balance after payout
      totalPayoutDollars += payout;
    }

    Data.push({
      No: i + 1,
      TradeDirection: tradeDirection,
      Outcome: outcome,
      RiskPercentage: riskPerTrade.toFixed(2),
      PNL: pnl.toFixed(2),
      NewBalance: currentBalance.toFixed(2),
      Payout: payout.toFixed(2),
      Date: generateUniqueDates(count , SLallowedperday)[i]
    });

    // Update risk percentage after calculating pnl
    if (outcome === 'Win') {
      consecutiveWins++;
      consecutiveLosses = 0;

      if (reset > 0 && consecutiveWins >= reset) {
        riskPerTrade = initialRiskPerTrade;
        consecutiveWins = 0;
      } else {
        riskPerTrade *= 1 + increaseOnWin / 100;
      }
    } else {
      consecutiveLosses++;
      consecutiveWins = 0;

      if (reset > 0 && consecutiveLosses >= reset) {
        riskPerTrade = initialRiskPerTrade;
        consecutiveLosses = 0;
      } else {
        riskPerTrade *= 1 - decreaseOnLoss / 100;
      }
    }

    // Ensure risk does not drop below minRisk
    if (riskPerTrade < minRisk) {
      riskPerTrade = minRisk;
    }

    // Ensure risk does not exceed maxRisk
    if (riskPerTrade > maxRisk) {
      riskPerTrade = maxRisk;
    }
  }

  console.log("Total Winning Dollars: $", totalWinDollars.toFixed(2));
  console.log("Total Loss Dollars: $", totalLossDollars.toFixed(2));
  console.log("Total Payout Dollars: $", totalPayoutDollars.toFixed(2));

  return Data;
}

export default generateData;
