import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
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
import { orderApi, connectionApi, riskProfileApi, symbolsApi } from "@/lib/api";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import TradingViewChart from "@/modules/TradingPanel/components/TradingViewChart";
import SymbolSelector from "@/modules/TradingPanel/components/SymbolSelector";

// Helper function to calculate adjusted risk based on risk profile.
// The backend (getClosedPnlf) is the single source of truth for currentrisk.
// The frontend just reads it — no re-calculation to avoid double-counting.
const calculateAdjustedRisk = (riskProfile: any): number => {
  const {
    currentrisk = 0,
    previousrisk = 0,
    initialRiskPerTrade,
    minRisk = 0,
    maxRisk = 100,
    isFirstTrade = true,
  } = riskProfile;

  if (initialRiskPerTrade == null) return 0;

  // First trade after activation (or no history yet) → show initial risk
  if (isFirstTrade || (currentrisk === 0 && previousrisk === 0)) {
    return Math.max(minRisk, Math.min(initialRiskPerTrade, maxRisk));
  }

  // Backend has already applied all win/loss compounding to currentrisk — trust it
  return Math.max(minRisk, Math.min(currentrisk, maxRisk));
};


// Helper to derive last trade result from trade history
const getLastTradeInfo = (trades: any[]): { result: 'Win' | 'Loss' | null, tradeId: string | null } => {
  if (!trades || trades.length === 0) return { result: null, tradeId: null };
  const sorted = [...trades].sort((a, b) => {
    const timeA = Number(a.updatedAt || a.closedAt || 0);
    const timeB = Number(b.updatedAt || b.closedAt || 0);
    return timeB - timeA;
  });
  const last = sorted[0];
  const pnl = parseFloat(last.closedPnl ?? last.pnl ?? 0);
  if (isNaN(pnl)) return { result: null, tradeId: null };
  
  // Use orderId or closedPnlId or similar unique identifier
  const tradeId = last.orderId || last.execId || last.closedAt || null;
  
  return { 
    result: pnl > 0 ? 'Win' : 'Loss',
    tradeId: tradeId ? String(tradeId) : null
  };
};

const getTradePnl = (trade: any): number => {
  const pnl = parseFloat(trade?.closedPnl ?? trade?.pnl ?? trade?.profit ?? 0);
  return Number.isFinite(pnl) ? pnl : 0;
};

const calculateTradeMetricsFromHistory = (trades: any[]) => {
  if (!Array.isArray(trades) || trades.length === 0) {
    return {
      totalTrades: 0,
      avgTradeOutput: 0,
      avgWinningTrade: 0,
      avgLosingTrade: 0,
      winRate: 0,
    };
  }

  let totalPnL = 0;
  let totalWinningPnL = 0;
  let totalLosingPnL = 0;
  let winCount = 0;
  let lossCount = 0;

  trades.forEach((trade) => {
    const pnl = getTradePnl(trade);
    totalPnL += pnl;

    if (pnl > 0) {
      totalWinningPnL += pnl;
      winCount++;
    } else if (pnl < 0) {
      totalLosingPnL += pnl;
      lossCount++;
    }
  });

  const totalTrades = trades.length;

  return {
    totalTrades,
    avgTradeOutput: totalTrades > 0 ? totalPnL / totalTrades : 0,
    avgWinningTrade: winCount > 0 ? totalWinningPnL / winCount : 0,
    avgLosingTrade: lossCount > 0 ? totalLosingPnL / lossCount : 0,
    winRate: totalTrades > 0 ? (winCount / totalTrades) * 100 : 0,
  };
};

const findBestAndWorstTradesFromHistory = (trades: any[]) => {
  if (!Array.isArray(trades) || trades.length === 0) {
    return {
      bestTrade: null,
      worstTrade: null,
    };
  }

  let bestTrade = trades[0];
  let worstTrade = trades[0];

  trades.forEach((trade) => {
    const pnl = getTradePnl(trade);
    if (pnl > getTradePnl(bestTrade)) bestTrade = trade;
    if (pnl < getTradePnl(worstTrade)) worstTrade = trade;
  });

  return { bestTrade, worstTrade };
};

const TradingPanelPage = () => {
  const [searchParams] = useSearchParams();
  const initialSymbol = searchParams.get('symbol') || 'BTCUSDT';
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
  const [isConnected, setIsConnected] = useState<boolean | null>(null); // null = checking
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const defaultTradeMetrics = {
    totalTrades: 0,
    avgTradeOutput: 0,
    avgWinningTrade: 0,
    avgLosingTrade: 0,
    winRate: 0,
  };

  // Form states
  const [leverage, setLeverage] = useState(1);
  const [maxLeverage, setMaxLeverage] = useState(100);
  const [orderPrice, setOrderPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');

  // Data states
  const [positions, setPositions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [tradeMetrics, setTradeMetrics] = useState(defaultTradeMetrics);
  const [bestTrade, setBestTrade] = useState<any>(null);
  const [worstTrade, setWorstTrade] = useState<any>(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  // Derived state for risk calculation
  const { result: lastTradeResult, tradeId: lastTradeId } = useMemo(() => getLastTradeInfo(tradeHistory), [tradeHistory]);

  const adjustedRisk = useMemo<number>(() => {
    if (!activeProfile) return 0;
    // No longer passing lastTradeResult — backend owns the calculation
    return calculateAdjustedRisk(activeProfile);
  }, [activeProfile]);

  const calculatedTradeMetrics = useMemo(
    () => calculateTradeMetricsFromHistory(tradeHistory),
    [tradeHistory]
  );

  const calculatedBestWorstTrades = useMemo(
    () => findBestAndWorstTradesFromHistory(tradeHistory),
    [tradeHistory]
  );

  const displayedTradeMetrics = useMemo(() => {
    if (tradeHistory.length === 0) return defaultTradeMetrics;

    const apiMetricsEmpty = !tradeMetrics || Number(tradeMetrics.totalTrades || 0) === 0;
    return apiMetricsEmpty ? calculatedTradeMetrics : tradeMetrics;
  }, [tradeHistory, tradeMetrics, calculatedTradeMetrics]);

  const displayedBestTrade = useMemo(() => {
    if (tradeHistory.length === 0) return null;
    return bestTrade?.symbol ? bestTrade : calculatedBestWorstTrades.bestTrade;
  }, [tradeHistory, bestTrade, calculatedBestWorstTrades.bestTrade]);

  const displayedWorstTrade = useMemo(() => {
    if (tradeHistory.length === 0) return null;
    return worstTrade?.symbol ? worstTrade : calculatedBestWorstTrades.worstTrade;
  }, [tradeHistory, worstTrade, calculatedBestWorstTrades.worstTrade]);

  // Calculate if trading is allowed (form should be enabled)
  const isTradingAllowed = useMemo(() => {
    if (!activeProfile) return false;
    if (positions.length > 0) return false;
    if (pendingOrders.length > 0) return false;

    // Check daily SL limit
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    const lossesToday = tradeHistory.filter(trade => {
      const time = Number(trade.updatedAt || trade.closedAt);
      if (!time) return false;
      const date = new Date(time);
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(); end.setHours(23,59,59,999);
      return date >= start && date <= end && parseFloat(trade.closedPnl) < 0;
    }).length;
    if (lossesToday >= dailyLimit) return false;

    return true;
  }, [activeProfile, positions, pendingOrders, tradeHistory]);

  // Get reason why trading is disabled
  const getDisabledReason = useMemo(() => {
    if (!activeProfile) return "No active risk profile. Create and activate one to trade.";
    if (positions.length > 0) return "Active position exists. Close it before placing new orders.";
    if (pendingOrders.length > 0) return "Pending orders exist. Cancel them before placing new orders.";

    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    const lossesToday = tradeHistory.filter(trade => {
      const time = Number(trade.updatedAt || trade.closedAt);
      if (!time) return false;
      const date = new Date(time);
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(); end.setHours(23,59,59,999);
      return date >= start && date <= end && parseFloat(trade.closedPnl) < 0;
    }).length;
    if (lossesToday >= dailyLimit) return `Daily stop loss limit reached (${dailyLimit} losses allowed).`;

    return "";
  }, [activeProfile, positions, pendingOrders, tradeHistory]);


  // Memoized fetch for full data with loading state
  // IMPORTANT: history is fetched FIRST (it triggers backend currentrisk update
  // via processNewTradeResult). Profile is then fetched AFTER so it reflects
  // the updated currentrisk — avoids race condition from parallel Promise.all.
  const fetchTradingData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Fetching trading data...');

      // Step 1: Fetch everything except profile in parallel
      const [positionsRes, ordersRes, historyRes, balanceRes] = await Promise.all([
        orderApi.getPositions(),
        orderApi.getOrders(),
        orderApi.getTradeHistory(), // this triggers backend currentrisk update
        orderApi.getBalance(),
      ]);

      // Step 2: Fetch active profile AFTER history so currentrisk is fresh
      const profileRes = await riskProfileApi.getActive();

      console.log('Fetched data:', { positions: positionsRes, orders: ordersRes, history: historyRes, profile: profileRes, balance: balanceRes });
      setPositions(Array.isArray(positionsRes) ? positionsRes : []);
      setPendingOrders(Array.isArray(ordersRes) ? ordersRes : []);

      // Trade history API returns { trades: [...], metrics: {...}, ... }
      // Extract the trades array
      const tradesArray = historyRes?.trades || historyRes;
      setTradeHistory(Array.isArray(tradesArray) ? tradesArray : []);
      setTradeMetrics(historyRes?.metrics || defaultTradeMetrics);
      setBestTrade(historyRes?.bestTrade || null);
      setWorstTrade(historyRes?.worstTrade || null);

      setActiveProfile(profileRes);
      setBalance(balanceRes);
    } catch (err: any) {
      console.error('Fetch trading data error:', err);
      toast.error(err.message || 'Failed to fetch data');
      setPositions([]);
      setPendingOrders([]);
      setTradeHistory([]);
      setTradeMetrics(defaultTradeMetrics);
      setBestTrade(null);
      setWorstTrade(null);
    } finally {
      setLoading(false);
    }
  }, [setPositions, setPendingOrders, setTradeHistory, setActiveProfile, setBalance]);


  // Silent poll fetch without loading indicator
  // Same sequential pattern: history first (triggers currentrisk update), then profile
  const pollTradingData = useCallback(async () => {
    try {
      const [positionsRes, ordersRes, historyRes, balanceRes] = await Promise.all([
        orderApi.getPositions(),
        orderApi.getOrders(),
        orderApi.getTradeHistory(), // triggers backend currentrisk update
        orderApi.getBalance(),
      ]);
      // Fetch profile after history so currentrisk is always fresh
      const profileRes = await riskProfileApi.getActive();

      setPositions(Array.isArray(positionsRes) ? positionsRes : []);
      setPendingOrders(Array.isArray(ordersRes) ? ordersRes : []);
      const tradesArray = historyRes?.trades || historyRes;
      setTradeHistory(Array.isArray(tradesArray) ? tradesArray : []);
      setTradeMetrics(historyRes?.metrics || defaultTradeMetrics);
      setBestTrade(historyRes?.bestTrade || null);
      setWorstTrade(historyRes?.worstTrade || null);
      setActiveProfile(profileRes);
      setBalance(balanceRes);
    } catch (err: any) {
      console.error('Polling error:', err);
      // If error indicates missing/invalid credentials, disconnect
      if (err.message && (err.message.includes('No API credentials') || err.message.includes('credentials'))) {
        setIsConnected(false);
      }
    }
  }, [setPositions, setPendingOrders, setTradeHistory, setActiveProfile, setBalance, setIsConnected]);

  // Handle API connection
  const handleConnect = async (e) => {
    e.preventDefault();
    try {
      await connectionApi.connect(apiKey, secretKey);
      setIsConnected(true);
      setApiKey('');
      setSecretKey('');
      // Refresh data after connection
      fetchTradingData();
      toast.success('Bybit account connected successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect API');
    }
  };

  // Handle API disconnect
  const handleDisconnect = async () => {
    setShowDisconnectDialog(true);
  };

  const confirmDisconnect = async () => {
    try {
      // Step 1: Delete API credentials
      await connectionApi.disconnect();

      // Step 2: Toggle active risk profile (deactivate then reactivate)
      if (activeProfile?._id) {
        try {
          // Deactivate
          await riskProfileApi.activate(activeProfile._id, false);
          // Reactivate
          await riskProfileApi.activate(activeProfile._id, true);
        } catch (profileErr) {
          console.error('Failed to toggle risk profile:', profileErr);
          // Continue with disconnect even if toggle fails
        }
      }

      // Step 3: Update state
      setIsConnected(false);
      setPositions([]);
      setPendingOrders([]);
      setTradeHistory([]);
      setTradeMetrics(defaultTradeMetrics);
      setBestTrade(null);
      setWorstTrade(null);
      setActiveProfile(null);
      setBalance(null);

      // Stop polling will happen automatically when isConnected becomes false
      setShowDisconnectDialog(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
      setShowDisconnectDialog(false);
    }
  };

  // Place order (always limit order)
  const handlePlaceOrder = async (direction) => {
    console.log('Place order clicked', { direction, activeProfile, positions: positions.length, pendingOrders: pendingOrders.length, tradeHistory: tradeHistory.length, adjustedRisk });
    // 1. No active risk profile
    if (!activeProfile) {
      toast.error('No active risk profile. Please create and activate a risk profile to place orders.');
      return;
    }

    // 2. Active position exists
    if (positions.length > 0) {
      toast.error('Cannot place order: An active position already exists. Please close it first.');
      return;
    }

    // 3. Pending orders exist
    if (pendingOrders.length > 0) {
      toast.error('Cannot place order: You have pending orders. Cancel them first.');
      return;
    }

    // 4. Daily SL limit check
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const todayEnd = new Date();
    todayEnd.setHours(23,59,59,999);
    const lossesToday = tradeHistory.filter(trade => {
      const time = Number(trade.updatedAt || trade.closedAt);
      if (!time) return false;
      const date = new Date(time);
      return date >= todayStart && date <= todayEnd && parseFloat(trade.closedPnl) < 0;
    }).length;
    if (lossesToday >= dailyLimit) {
      toast.error(`Daily stop loss limit reached (${dailyLimit} losses allowed).`);
      return;
    }

    // 5. Validate required fields
    if (!stopLoss) {
      toast.error('Stop Loss is required for order placement');
      return;
    }
    if (!takeProfit) {
      toast.error('Take Profit is required for order placement');
      return;
    }
    const finalPrice = orderPrice ? parseFloat(orderPrice) : null;
    if (!finalPrice) {
      toast.error('Order price is required for limit orders');
      return;
    }

    // Build payload with adjustedRisk and lastTradeResult
    const orderPayload = {
      symbol: selectedSymbol,
      side: direction === 'Long' ? 'Buy' : 'Sell',
      category: 'linear',
      qty: parseFloat(quantity) || 1,
      orderType: 'LIMIT',
      price: finalPrice,
      stopLoss: parseFloat(stopLoss),
      takeProfit: parseFloat(takeProfit),
      adjustedRisk,      // calculated from activeProfile and lastTradeResult
      lastTradeResult,   // 'Win', 'Loss', or null
      lastTradeId        // unique ID to prevent double counting
    };

    try {
      console.log('Placing order with payload:', orderPayload);
      const response = await orderApi.placeOrder(orderPayload);
      console.log('Order response:', response);
      // Refresh data after order placement
      await fetchTradingData();
      // Reset form
      setOrderPrice('');
      setQuantity('');
      setTakeProfit('');
      setStopLoss('');
      toast.success('Order placed successfully!');
    } catch (err: any) {
      console.error('Order error:', err);
      toast.error(err.message || 'Failed to place order');
    }
  };

  // Set leverage
  const handleSetLeverage = async () => {
    try {
      await orderApi.setLeverage(selectedSymbol, leverage);
      toast.success('Leverage updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to set leverage');
    }
  };

  // Cancel order
  const handleCancelOrder = async (order) => {
    console.log('Canceling order:', order);
    try {
      // Use either orderLinkId or _id (orderId) for cancellation
      const orderLinkId = order.orderLinkId;
      const orderId = order._id || order.orderId;
      const symbol = order.symbol;
      if (!symbol) throw new Error('Symbol missing from order');
      if (!orderLinkId && !orderId) throw new Error('Order identifier missing');

      const result = await orderApi.cancelOrder({
        orderLinkId: orderLinkId || undefined,
        orderId: orderId || undefined,
        symbol: symbol
      });
      console.log('Cancel result:', result);

      // Remove from pending orders by matching the exact order reference
      // Use the order's index-based identity if available, otherwise filter by matching both id fields
      setPendingOrders(prev => {
        return prev.filter(o => {
          // Match by orderLinkId if both exist
          if (orderLinkId && o.orderLinkId) {
            return o.orderLinkId !== orderLinkId;
          }
          // Match by _id (or orderId) if both exist
          if (orderId) {
            const oId = o._id || o.orderId;
            return oId !== orderId;
          }
          // Fallback: keep all (shouldn't happen)
          return true;
        });
      });

      await fetchTradingData();
      toast.success('Order cancelled successfully');
    } catch (err: any) {
      console.error('Cancel error:', err);
      toast.error(err.message || 'Failed to cancel order');
    }
  };

  // Check connection by testing balance API on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await orderApi.getBalance();
        setIsConnected(true);
      } catch (err) {
        // If no credentials configured or invalid, treat as disconnected
        setIsConnected(false);
      }
    };
    checkConnection();
  }, []);

  // Sync leverage settings when symbol changes
  useEffect(() => {
    const syncLeverage = async () => {
      try {
        // 1. Fetch instrument limits (max leverage)
        const info = await symbolsApi.getInstrumentInfo(selectedSymbol);
        if (info?.leverageFilter?.maxLeverage) {
          const max = parseFloat(info.leverageFilter.maxLeverage);
          setMaxLeverage(max);
          // Clamp current leverage to new max if needed
          setLeverage(prev => Math.min(prev, max));
        }

        // 2. Fetch current leverage setting from positions (requires connection)
        if (isConnected) {
          const positionsRes = await orderApi.getPositions(selectedSymbol);
          const posList = Array.isArray(positionsRes) ? positionsRes : (positionsRes?.result?.list || []);
          const currentPos = posList.find((p: any) => p.symbol === selectedSymbol);
          if (currentPos && currentPos.leverage) {
            setLeverage(parseFloat(currentPos.leverage));
          }
        }
      } catch (err) {
        console.error("Leverage sync error:", err);
      }
    };
    syncLeverage();
  }, [selectedSymbol, isConnected]);

  // Initial data fetch when connected
  useEffect(() => {
    if (isConnected) {
      fetchTradingData();
    }
  }, [isConnected, fetchTradingData]);

  // Set up polling for real-time updates when connected
  useEffect(() => {
    if (isConnected !== true) return;
    const intervalId = setInterval(() => {
      pollTradingData();
    }, 5000); // Poll every 5 seconds
    return () => clearInterval(intervalId);
  }, [isConnected, pollTradingData]);

  // Calculate account balance from API response
  const accountBalance = balance?.usdtBalance || balance?.balance || balance?.availableBalance || '0.00';

  const formatMetricValue = (value: any) => {
    const numericValue = parseFloat(value ?? 0);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : '0.00';
  };

  return (
    <>
      <div className="space-y-4 sm:space-y-6 w-full min-w-0">
          {/* Connection status banner */}
          <div className={`flex items-center justify-between gap-2 flex-wrap px-3 sm:px-4 py-3 rounded-lg border text-xs sm:text-sm ${
            isConnected === null
              ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
              : isConnected
              ? "bg-green-500/10 border-green-500/20 text-green-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                isConnected === null ? "bg-yellow-400 animate-pulse" :
                isConnected ? "bg-green-400" : "bg-red-400"
              }`} />
              <span>
                {isConnected === null ? "Checking Bybit connection..." :
                 isConnected ? "Bybit account connected" :
                 "Bybit account not connected"}
              </span>
            </div>
            {!isConnected && isConnected !== null && (
              <a href="/exchange" className="text-xs underline opacity-80 hover:opacity-100">
                Connect in Exchange →
              </a>
            )}
          </div>

          {/* Symbol Selection & Chart + Place Order Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch w-full min-w-0">
            {/* Symbol Selection & Chart */}
            <div className="lg:col-span-8 min-w-0 overflow-hidden">
              <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 flex flex-col h-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-lg">{selectedSymbol} Trading Chart</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-4 flex flex-col">
                  <div className="flex flex-col gap-4 h-full">
                    <SymbolSelector selectedSymbol={selectedSymbol} onSymbolChange={setSelectedSymbol} />

                    {/* TradingView Chart - fills remaining space, min height for mobile */}
                    <div className="flex-1 min-h-[520px] sm:min-h-[640px] lg:min-h-0">
                      <TradingViewChart symbol={selectedSymbol} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Place Order Section */}
            <div className="lg:col-span-4 min-w-0 overflow-hidden">
              <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 flex flex-col h-full">
                <CardHeader>
                  <CardTitle className="text-lg">Place Order</CardTitle>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Active Risk Profile:</span>
                      <Badge variant="secondary">{activeProfile?.title || 'Not set'}</Badge>
                    </div>
                    {activeProfile && (
                      <div className="text-xs mt-2 p-2 bg-white/5 rounded">
                        {/* Show warning if there are active positions or pending orders */}
                        {(positions.length > 0 || pendingOrders.length > 0) ? (
                          <div className="text-center">
                            <p className="text-muted-foreground">
                              {positions.length > 0 && pendingOrders.length > 0
                                ? "Cannot trade: You have active positions and pending orders. Complete them first."
                                : positions.length > 0
                                ? "Cannot trade: You have an active position. Close it before placing new orders."
                                : "Cannot trade: You have pending orders. Cancel them before placing new orders."
                              }
                            </p>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-muted-foreground">Adjusted Risk: </span>
                              <span className="font-semibold text-sm">{adjustedRisk.toFixed(2)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Daily SL Remaining: </span>
                              <span className="font-semibold text-sm">
                                {(() => {
                                  const dailyLimit = activeProfile.SLallowedperday ?? 1000;
                                  const lossesToday = tradeHistory.filter(trade => {
                                    const time = Number(trade.updatedAt || trade.closedAt);
                                    if (!time) return false;
                                    const date = new Date(time);
                                    const start = new Date(); start.setHours(0,0,0,0);
                                    const end = new Date(); end.setHours(23,59,59,999);
                                    return date >= start && date <= end && parseFloat(trade.closedPnl) < 0;
                                  }).length;
                                  return dailyLimit - lossesToday;
                                })()}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto space-y-3">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm">Leverage</Label>
                        <span className="text-sm font-bold text-primary">{leverage}x</span>
                      </div>
                      <Slider
                        min={1}
                        max={maxLeverage}
                        step={1}
                        value={[leverage]}
                        onValueChange={([val]) => setLeverage(val)}
                        disabled={!isTradingAllowed}
                        className="mb-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mb-2">
                        <span>1x</span>
                        <span>{Math.floor(maxLeverage * 0.25)}x</span>
                        <span>{Math.floor(maxLeverage * 0.5)}x</span>
                        <span>{Math.floor(maxLeverage * 0.75)}x</span>
                        <span>{maxLeverage}x</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSetLeverage}
                        className="w-full"
                        disabled={!isTradingAllowed || loading}
                        title={!isTradingAllowed ? getDisabledReason : ""}
                      >
                        Apply Leverage
                      </Button>
                    </div>

                    <div>
                      <Label className="text-sm text-muted-foreground">Account Balance (USDT)</Label>
                      <div className="text-2xl font-bold bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        ${parseFloat(accountBalance).toFixed(2)}
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm">Order Price</Label>
                      <Input
                        type="number"
                        value={orderPrice}
                        onChange={(e) => setOrderPrice(e.target.value)}
                        placeholder={!isTradingAllowed ? getDisabledReason : "0.00"}
                        className="mt-1"
                        disabled={!isTradingAllowed}
                        title={!isTradingAllowed ? getDisabledReason : ""}
                      />
                    </div>

                    <div>
                      <Label className="text-sm">Order Quantity</Label>
                      <Input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="Auto-calculated from risk profile (editable disabled)"
                        className="mt-1"
                        readOnly={!!activeProfile}
                      />
                    </div>

                    <div>
                      <Label className="text-sm">Take Profit</Label>
                      <Input
                        type="number"
                        value={takeProfit}
                        onChange={(e) => setTakeProfit(e.target.value)}
                        placeholder={!isTradingAllowed ? getDisabledReason : "0.00"}
                        className="mt-1"
                        disabled={!isTradingAllowed}
                        title={!isTradingAllowed ? getDisabledReason : ""}
                      />
                    </div>

                    <div>
                      <Label className="text-sm">Stop Loss</Label>
                      <Input
                        type="number"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        placeholder={!isTradingAllowed ? getDisabledReason : "0.00"}
                        className="mt-1"
                        disabled={!isTradingAllowed}
                        title={!isTradingAllowed ? getDisabledReason : ""}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-xs"
                        onClick={() => handlePlaceOrder('Long')}
                        disabled={!isTradingAllowed || loading}
                        title={!isTradingAllowed ? getDisabledReason : ""}
                      >
                        Open Long
                      </Button>
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-xs"
                        onClick={() => handlePlaceOrder('Short')}
                        disabled={!isTradingAllowed || loading}
                        title={!isTradingAllowed ? getDisabledReason : ""}
                      >
                        Open Short
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Trading Overview */}
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 w-full min-w-0 overflow-hidden">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Trading Overview</CardTitle>
                <Button size="sm" onClick={fetchTradingData} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="positions" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="positions">Positions</TabsTrigger>
                  <TabsTrigger value="orders">Pending Orders</TabsTrigger>
                  <TabsTrigger value="history">Trade History</TabsTrigger>
                </TabsList>

                {/* Positions Tab */}
                <TabsContent value="positions" className="space-y-4">
                  {loading ? (
                    <p className="text-center py-8">Loading positions...</p>
                  ) : positions.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No active positions</p>
                  ) : (
                    <div className="overflow-x-auto w-full">
                      <table className="w-full min-w-[560px]">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-1 text-xs">Symbol</th>
                            <th className="text-left py-2 px-1 text-xs">Size</th>
                            <th className="text-left py-2 px-1 text-xs">Value</th>
                            <th className="text-left py-2 px-1 text-xs">Entry</th>
                            <th className="text-left py-2 px-1 text-xs">Mkt Price</th>
                            <th className="text-left py-2 px-1 text-xs">PnL</th>
                            <th className="text-left py-2 px-1 text-xs">TP/SL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map((position, index) => (
                            <tr key={index} className="border-b border-white/5">
                              <td className="py-2 px-1 text-xs">{position.symbol}</td>
                              <td className="py-2 px-1 text-xs">{position.size}</td>
                              <td className="py-2 px-1 text-xs">${position.positionValue || '0'}</td>
                              <td className="py-2 px-1 text-xs">${position.avgEntryPrice || '0'}</td>
                              <td className="py-2 px-1 text-xs">${position.marketPrice || '0'}</td>
                              <td className={`py-2 px-1 text-xs ${parseFloat(position.unrealisedPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {position.unrealisedPnL || '0'}
                              </td>
                              <td className="py-2 px-1 text-xs whitespace-nowrap">
                                TP: {position.takeProfit || '—'} / SL: {position.stopLoss || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* Pending Orders Tab */}
                <TabsContent value="orders" className="space-y-4">
                  {loading ? (
                    <p className="text-center py-8">Loading orders...</p>
                  ) : pendingOrders.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No pending orders</p>
                  ) : (
                    <div className="overflow-x-auto w-full">
                      <table className="w-full min-w-[680px]">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-1 text-xs">Symbol</th>
                            <th className="text-left py-2 px-1 text-xs">Qty</th>
                            <th className="text-left py-2 px-1 text-xs">Price</th>
                            <th className="text-left py-2 px-1 text-xs">SL</th>
                            <th className="text-left py-2 px-1 text-xs">TP</th>
                            <th className="text-left py-2 px-1 text-xs">Side</th>
                            <th className="text-left py-2 px-1 text-xs">Type</th>
                            <th className="text-left py-2 px-1 text-xs">Status</th>
                            <th className="text-left py-2 px-1 text-xs">Created</th>
                            <th className="text-left py-2 px-1 text-xs sticky right-0 bg-[#1B1B1B] z-10 border-l border-white/10">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingOrders.map((order, index) => (
                            <tr key={index} className="border-b border-white/5">
                              <td className="py-2 px-1 text-xs">{order.symbol}</td>
                              <td className="py-2 px-1 text-xs">{order.qty || order.quantity}</td>
                              <td className="py-2 px-1 text-xs">${order.price || '0'}</td>
                              <td className="py-2 px-1 text-xs">{order.stopLoss || '—'}</td>
                              <td className="py-2 px-1 text-xs">{order.takeProfit || '—'}</td>
                              <td className="py-2 px-1 text-xs">{order.side}</td>
                              <td className="py-2 px-1 text-xs">{order.type}</td>
                              <td className="py-2 px-1 text-xs">
                                <Badge variant="secondary" className="text-[10px] px-1">{order.status}</Badge>
                              </td>
                              <td className="py-2 px-1 text-xs whitespace-nowrap">
                                {new Date(order.createdAt || order.createdTime).toLocaleString()}
                              </td>
                              <td className="py-2 px-1 text-xs sticky right-0 bg-[#1B1B1B]/95 backdrop-blur-sm z-10 border-l border-white/10">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 text-xs px-2"
                                  onClick={() => handleCancelOrder(order)}
                                >
                                  Cancel
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* Trade History Tab */}
                <TabsContent value="history" className="space-y-4">
                  {loading ? (
                    <p className="text-center py-8">Loading history...</p>
                  ) : tradeHistory.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No trade history</p>
                  ) : (
                    <div className="overflow-x-auto w-full">
                      <table className="w-full min-w-[540px]">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-1 text-xs">Symbol</th>
                            <th className="text-left py-2 px-1 text-xs">Size</th>
                            <th className="text-left py-2 px-1 text-xs">Entry</th>
                            <th className="text-left py-2 px-1 text-xs">Exit</th>
                            <th className="text-left py-2 px-1 text-xs">PnL</th>
                            <th className="text-left py-2 px-1 text-xs">Side</th>
                            <th className="text-left py-2 px-1 text-xs">Closed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tradeHistory.map((trade, index) => (
                            <tr key={index} className="border-b border-white/5">
                              <td className="py-2 px-1 text-xs">{trade.symbol}</td>
                              <td className="py-2 px-1 text-xs">{trade.size || trade.qty}</td>
                              <td className="py-2 px-1 text-xs">${trade.entryPrice || '0'}</td>
                              <td className="py-2 px-1 text-xs">${trade.exitPrice || '0'}</td>
                              <td className={`py-2 px-1 text-xs font-medium ${parseFloat(trade.pnl || trade.profit || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {trade.pnl || trade.profit || '0'}
                              </td>
                              <td className="py-2 px-1 text-xs">{trade.side}</td>
                              <td className="py-2 px-1 text-xs whitespace-nowrap">
                                {(() => {
                                  const ts = Number(trade.updatedAt || trade.closedAt);
                                  return ts ? new Date(ts).toLocaleString() : '—';
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
      </div>

    {/* Disconnect Confirmation Dialog */}
    <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Bybit Account?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to disconnect your Bybit account? You will need to reconnect to place orders or view positions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default TradingPanelPage;
