import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

  if (isFirstTrade || (currentrisk === 0 && previousrisk === 0)) {
    return Math.max(minRisk, Math.min(initialRiskPerTrade, maxRisk));
  }

  return Math.max(minRisk, Math.min(currentrisk, maxRisk));
};

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
    return { totalTrades: 0, avgTradeOutput: 0, avgWinningTrade: 0, avgLosingTrade: 0, winRate: 0 };
  }
  let totalPnL = 0, totalWinningPnL = 0, totalLosingPnL = 0, winCount = 0, lossCount = 0;
  trades.forEach((trade) => {
    const pnl = getTradePnl(trade);
    totalPnL += pnl;
    if (pnl > 0) { totalWinningPnL += pnl; winCount++; }
    else if (pnl < 0) { totalLosingPnL += pnl; lossCount++; }
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
  if (!Array.isArray(trades) || trades.length === 0) return { bestTrade: null, worstTrade: null };
  let bestTrade = trades[0], worstTrade = trades[0];
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
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const defaultTradeMetrics = { totalTrades: 0, avgTradeOutput: 0, avgWinningTrade: 0, avgLosingTrade: 0, winRate: 0 };

  // Form states
  const [leverage, setLeverage] = useState(1);
  const [maxLeverage, setMaxLeverage] = useState(100);
  const [orderPrice, setOrderPrice] = useState('');
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
  const [tickerPrice, setTickerPrice] = useState<string | null>(null);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  // Track latest seen trade ID to trigger risk recalc only on genuinely new trades
  const lastTradeIdRef = useRef<string | null>(null);

  const { result: lastTradeResult, tradeId: lastTradeId } = useMemo(() => getLastTradeInfo(tradeHistory), [tradeHistory]);

  const adjustedRisk = useMemo<number>(() => {
    if (!activeProfile) return 0;
    return calculateAdjustedRisk(activeProfile);
  }, [activeProfile]);

  const calculatedTradeMetrics = useMemo(() => calculateTradeMetricsFromHistory(tradeHistory), [tradeHistory]);
  const calculatedBestWorstTrades = useMemo(() => findBestAndWorstTradesFromHistory(tradeHistory), [tradeHistory]);

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

  const isTradingAllowed = useMemo(() => {
    if (!activeProfile) return false;
    if (positions.length > 0) return false;
    if (pendingOrders.length > 0) return false;
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

  // Detect new closed trade → re-fetch profile to get updated currentrisk
  useEffect(() => {
    if (!tradeHistory.length) return;
    const latest = tradeHistory[0]?.orderId ?? tradeHistory[0]?.updatedAt ?? null;
    const latestStr = latest ? String(latest) : null;
    if (latestStr && latestStr !== lastTradeIdRef.current) {
      lastTradeIdRef.current = latestStr;
      riskProfileApi.getActive().then(profile => {
        if (profile) setActiveProfile(profile);
      }).catch(() => {});
    }
  }, [tradeHistory]);

  // Initial full fetch (with loading state)
  const fetchTradingData = useCallback(async () => {
    try {
      setLoading(true);
      const [positionsRes, ordersRes, historyRes, balanceRes] = await Promise.all([
        orderApi.getPositions(),
        orderApi.getOrders(),
        orderApi.getTradeHistory(),
        orderApi.getBalance(),
      ]);
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
      toast.error(err.message || 'Failed to fetch data');
      setPositions([]); setPendingOrders([]); setTradeHistory([]);
      setTradeMetrics(defaultTradeMetrics); setBestTrade(null); setWorstTrade(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent full refresh (balance + profile + history) — runs every 30s
  const pollTradingData = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [positionsRes, ordersRes, historyRes, balanceRes] = await Promise.all([
        orderApi.getPositions(),
        orderApi.getOrders(),
        orderApi.getTradeHistory(),
        orderApi.getBalance(),
      ]);
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
      if (err.message?.includes('No API credentials') || err.message?.includes('credentials')) {
        setIsConnected(false);
      }
    }
  }, []);

  // History-only poll — runs every 5s to catch new closed trades quickly
  const pollHistory = useCallback(async () => {
    if (document.hidden) return;
    try {
      const historyRes = await orderApi.getTradeHistory();
      const tradesArray = historyRes?.trades || historyRes;
      setTradeHistory(Array.isArray(tradesArray) ? tradesArray : []);
      setTradeMetrics(historyRes?.metrics || defaultTradeMetrics);
      setBestTrade(historyRes?.bestTrade || null);
      setWorstTrade(historyRes?.worstTrade || null);
    } catch {
      // silent
    }
  }, []);

  // Fast targeted refresh — positions + orders only (~400ms)
  const quickRefresh = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [positionsRes, ordersRes] = await Promise.all([
        orderApi.getPositions(),
        orderApi.getOrders(),
      ]);
      const newPositions = Array.isArray(positionsRes) ? positionsRes : [];
      const newOrders = Array.isArray(ordersRes) ? ordersRes : [];
      const tradeClosed = positions.length > 0 && newPositions.length === 0;
      setPositions(newPositions);
      setPendingOrders(newOrders);
      if (tradeClosed) {
        pollTradingData();
      }
    } catch {
      // silent
    }
  }, [positions, pollTradingData]);

  const handleConnect = async (e) => {
    e.preventDefault();
    try {
      await connectionApi.connect(apiKey, secretKey);
      setIsConnected(true);
      setApiKey(''); setSecretKey('');
      fetchTradingData();
      toast.success('Bybit account connected successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect API');
    }
  };

  const handleDisconnect = async () => { setShowDisconnectDialog(true); };

  const confirmDisconnect = async () => {
    try {
      await connectionApi.disconnect();
      if (activeProfile?._id) {
        try {
          await riskProfileApi.activate(activeProfile._id, false);
          await riskProfileApi.activate(activeProfile._id, true);
        } catch {
          // continue with disconnect
        }
      }
      setIsConnected(false);
      setPositions([]); setPendingOrders([]); setTradeHistory([]);
      setTradeMetrics(defaultTradeMetrics); setBestTrade(null); setWorstTrade(null);
      setActiveProfile(null); setBalance(null); setTickerPrice(null);
      setShowDisconnectDialog(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
      setShowDisconnectDialog(false);
    }
  };

  const handlePlaceOrder = async (direction) => {
    if (!activeProfile) {
      toast.error('No active risk profile. Please create and activate a risk profile to place orders.');
      return;
    }
    if (positions.length > 0) {
      toast.error('Cannot place order: An active position already exists. Please close it first.');
      return;
    }
    if (pendingOrders.length > 0) {
      toast.error('Cannot place order: You have pending orders. Cancel them first.');
      return;
    }
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
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
    if (!stopLoss) { toast.error('Stop Loss is required'); return; }
    if (!takeProfit) { toast.error('Take Profit is required'); return; }
    const fallbackPrice = tickerPrice ? parseFloat(tickerPrice) : NaN;
    const finalPrice = orderPrice ? parseFloat(orderPrice) : fallbackPrice;
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      toast.error('Order price unavailable — enter an entry price or wait for live price to load.');
      return;
    }

    const orderPayload = {
      symbol: selectedSymbol,
      side: direction === 'Long' ? 'Buy' : 'Sell',
      category: 'linear',
      qty: 1,
      orderType: 'LIMIT',
      price: finalPrice,
      stopLoss: parseFloat(stopLoss),
      takeProfit: parseFloat(takeProfit),
      adjustedRisk,
      lastTradeResult,
      lastTradeId,
    };

    try {
      await orderApi.placeOrder(orderPayload);
      toast.success('Order placed successfully!');
      setOrderPrice(''); setTakeProfit(''); setStopLoss('');
      quickRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to place order');
    }
  };

  const handleSetLeverage = async () => {
    try {
      await orderApi.setLeverage(selectedSymbol, leverage);
      toast.success('Leverage updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to set leverage');
    }
  };

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      const res = await orderApi.clearTradeHistory();
      toast.success(`Cleared ${res?.deletedCount ?? 0} trades. Older Bybit history is now hidden.`);
      setTradeHistory([]);
      setTradeMetrics(defaultTradeMetrics);
      setBestTrade(null);
      setWorstTrade(null);
      lastTradeIdRef.current = null;
      pollHistory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear trade history');
    } finally {
      setClearingHistory(false);
      setShowClearHistoryDialog(false);
    }
  };

  const handleCancelOrder = async (order) => {
    try {
      const orderLinkId = order.orderLinkId;
      const orderId = order._id || order.orderId;
      const symbol = order.symbol;
      if (!symbol) throw new Error('Symbol missing from order');
      if (!orderLinkId && !orderId) throw new Error('Order identifier missing');

      await orderApi.cancelOrder({ orderLinkId: orderLinkId || undefined, orderId: orderId || undefined, symbol });

      setPendingOrders(prev => prev.filter(o => {
        if (orderLinkId && o.orderLinkId) return o.orderLinkId !== orderLinkId;
        if (orderId) { const oId = o._id || o.orderId; return oId !== orderId; }
        return true;
      }));

      toast.success('Order cancelled successfully');
      quickRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel order');
    }
  };

  // Check connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await orderApi.getBalance();
        setIsConnected(true);
      } catch {
        setIsConnected(false);
      }
    };
    checkConnection();
  }, []);

  // Sync leverage when symbol changes
  useEffect(() => {
    const syncLeverage = async () => {
      try {
        const info = await symbolsApi.getInstrumentInfo(selectedSymbol);
        if (info?.leverageFilter?.maxLeverage) {
          const max = parseFloat(info.leverageFilter.maxLeverage);
          setMaxLeverage(max);
          setLeverage(prev => Math.min(prev, max));
        }
        if (isConnected) {
          const positionsRes = await orderApi.getPositions(selectedSymbol);
          const posList = Array.isArray(positionsRes) ? positionsRes : (positionsRes?.result?.list || []);
          const currentPos = posList.find((p: any) => p.symbol === selectedSymbol);
          if (currentPos?.leverage) setLeverage(parseFloat(currentPos.leverage));
        }
      } catch {
        // silent
      }
    };
    syncLeverage();
  }, [selectedSymbol, isConnected]);

  // Initial data fetch when connected
  useEffect(() => {
    if (isConnected) fetchTradingData();
  }, [isConnected, fetchTradingData]);

  // Polling setup when connected.
  // All intervals gate on document.visibilityState so iOS Safari (which
  // already throttles backgrounded timers) doesn't dispatch a burst of
  // queued fetches — and a single in-flight guard per stream prevents
  // overlapping requests when the network is slow.
  useEffect(() => {
    if (isConnected !== true) return;

    const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
    let tickerInFlight = false;
    let fastInFlight = false;
    let historyInFlight = false;
    let slowInFlight = false;

    const tickerId = setInterval(async () => {
      if (isHidden() || tickerInFlight) return;
      tickerInFlight = true;
      try {
        const ticker = await symbolsApi.getTicker(selectedSymbol);
        if (ticker?.lastPrice) setTickerPrice(ticker.lastPrice);
      } catch {
        // silent
      } finally {
        tickerInFlight = false;
      }
    }, 1000);

    const fastId = setInterval(async () => {
      if (isHidden() || fastInFlight) return;
      fastInFlight = true;
      try { await quickRefresh(); } finally { fastInFlight = false; }
    }, 2000);

    const historyId = setInterval(async () => {
      if (isHidden() || historyInFlight) return;
      historyInFlight = true;
      try { await pollHistory(); } finally { historyInFlight = false; }
    }, 5000);

    const slowId = setInterval(async () => {
      if (isHidden() || slowInFlight) return;
      slowInFlight = true;
      try { await pollTradingData(); } finally { slowInFlight = false; }
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // Catch up with one fresh full refresh on re-foreground.
        if (!slowInFlight) {
          slowInFlight = true;
          Promise.resolve(pollTradingData()).finally(() => { slowInFlight = false; });
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(tickerId);
      clearInterval(fastId);
      clearInterval(historyId);
      clearInterval(slowId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isConnected, selectedSymbol, quickRefresh, pollHistory, pollTradingData]);

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
          {/* Chart */}
          <div className="lg:col-span-8 min-w-0 overflow-hidden">
            <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 flex flex-col h-full overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">{selectedSymbol} Trading Chart</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-4 flex flex-col">
                <div className="flex flex-col gap-4 h-full">
                  <SymbolSelector selectedSymbol={selectedSymbol} onSymbolChange={setSelectedSymbol} />
                  <div className="flex-1 min-h-[520px] sm:min-h-[640px] lg:min-h-0">
                    <TradingViewChart symbol={selectedSymbol} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Place Order */}
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
                            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                              Recalculates automatically whenever a new closed trade appears in your history (history polled every 5s).
                            </div>
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
                      min={1} max={maxLeverage} step={1}
                      value={[leverage]} onValueChange={([val]) => setLeverage(val)}
                      disabled={!isTradingAllowed} className="mb-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>1x</span>
                      <span>{Math.floor(maxLeverage * 0.25)}x</span>
                      <span>{Math.floor(maxLeverage * 0.5)}x</span>
                      <span>{Math.floor(maxLeverage * 0.75)}x</span>
                      <span>{maxLeverage}x</span>
                    </div>
                    <Button size="sm" onClick={handleSetLeverage} className="w-full"
                      disabled={!isTradingAllowed || loading} title={!isTradingAllowed ? getDisabledReason : ""}>
                      Apply Leverage
                    </Button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-x-3 gap-y-1">
                      <Label className="text-sm">Order Price</Label>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground/70">
                          Bal: <span className="text-muted-foreground/80 font-normal">${parseFloat(accountBalance).toFixed(2)}</span>
                        </span>
                        {tickerPrice && (
                          <span className="text-muted-foreground">
                            Live: <span className="font-bold text-green-400">${parseFloat(tickerPrice).toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <Input
                      type="number" value={orderPrice}
                      onChange={(e) => setOrderPrice(e.target.value)}
                      placeholder={!isTradingAllowed ? getDisabledReason : tickerPrice ? `${parseFloat(tickerPrice).toFixed(2)} (live — leave blank to use)` : "0.00"}
                      className="mt-1" disabled={!isTradingAllowed}
                      title={!isTradingAllowed ? getDisabledReason : "Leave blank to submit at the current live price"}
                    />
                  </div>

                  <div>
                    <Label className="text-sm">Take Profit</Label>
                    <Input type="number" value={takeProfit}
                      onChange={(e) => setTakeProfit(e.target.value)}
                      placeholder={!isTradingAllowed ? getDisabledReason : "0.00"}
                      className="mt-1" disabled={!isTradingAllowed}
                      title={!isTradingAllowed ? getDisabledReason : ""} />
                  </div>

                  <div>
                    <Label className="text-sm">Stop Loss</Label>
                    <Input type="number" value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      placeholder={!isTradingAllowed ? getDisabledReason : "0.00"}
                      className="mt-1" disabled={!isTradingAllowed}
                      title={!isTradingAllowed ? getDisabledReason : ""} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs"
                      onClick={() => handlePlaceOrder('Long')}
                      disabled={!isTradingAllowed || loading}
                      title={!isTradingAllowed ? getDisabledReason : ""}>
                      Open Long
                    </Button>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-xs"
                      onClick={() => handlePlaceOrder('Short')}
                      disabled={!isTradingAllowed || loading}
                      title={!isTradingAllowed ? getDisabledReason : ""}>
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
            <div className="flex justify-between items-center flex-wrap gap-2">
              <CardTitle className="text-lg">Trading Overview</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs"
                  onClick={() => setShowClearHistoryDialog(true)}
                  disabled={clearingHistory}
                  title="Hide all trades closed up to this moment (including Bybit-synced ones)."
                >
                  Erase Trade History
                </Button>
                <Button size="sm" onClick={fetchTradingData} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
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
                              <Button size="sm" variant="destructive" className="h-6 text-xs px-2"
                                onClick={() => handleCancelOrder(order)}>
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

      {/* Clear Trade History Confirmation Dialog */}
      <AlertDialog open={showClearHistoryDialog} onOpenChange={setShowClearHistoryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase Trade History?</AlertDialogTitle>
            <AlertDialogDescription>
              Bybit trades can't be deleted at the exchange, but this will stamp the current time as
              your cutoff and hide every trade closed up to now from the trading panel and portfolio.
              Your saved trades in our database are also deleted. New trades placed after this moment
              will still appear normally. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingHistory}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearHistory}
              disabled={clearingHistory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearingHistory ? 'Erasing…' : 'Erase History'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
