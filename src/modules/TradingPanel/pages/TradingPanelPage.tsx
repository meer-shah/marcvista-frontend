import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { toast } from "sonner";
import Chart from "@/modules/TradingPanel/components/Chart";
import PlaceOrder from "@/modules/TradingPanel/components/PlaceOrder";
import TradingOverview from "@/modules/TradingPanel/components/TradingOverview";

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

// Risk calculations consume only portfolio app-trades (source === 'app') —
// canonical single source of truth, not the trading-panel Bybit feed.
const getLastTradeInfo = (appTrades: any[]): { result: 'Win' | 'Loss' | null, tradeId: string | null } => {
  if (!appTrades || appTrades.length === 0) return { result: null, tradeId: null };
  const sorted = [...appTrades].sort((a, b) => {
    const timeA = new Date(a.closedAt ?? a.updatedAt ?? 0).getTime() || 0;
    const timeB = new Date(b.closedAt ?? b.updatedAt ?? 0).getTime() || 0;
    return timeB - timeA;
  });
  const last = sorted[0];
  const pnl = parseFloat(last.pnl ?? last.closedPnl ?? 0);
  if (isNaN(pnl)) return { result: null, tradeId: null };
  const tradeId = last._id || last.orderId || last.execId || last.closedAt || null;
  return {
    result: pnl > 0 ? 'Win' : 'Loss',
    tradeId: tradeId ? String(tradeId) : null
  };
};

const SYMBOL_STORAGE_KEY = 'markvista_last_symbol';

const translateBybitError = (err: any, action: 'order' | 'leverage'): string => {
  const raw = (err?.message || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('pm mode') || lower.includes('portfolio margin')) {
    return action === 'leverage'
      ? 'Your Bybit account is in Portfolio Margin mode — leverage is managed automatically by Bybit and cannot be set per-symbol. Switch to Cross or Isolated Margin in Bybit to control leverage manually.'
      : 'Your Bybit account is in Portfolio Margin mode. This order setup may not be supported. Switch to Cross or Isolated Margin in Bybit and try again.';
  }
  if (lower.includes('insufficient') && (lower.includes('balance') || lower.includes('margin'))) {
    return 'Insufficient balance or margin on Bybit to open this position. Reduce size, top up USDT, or lower leverage.';
  }
  if (lower.includes('leverage not modified')) return 'Leverage is already set to this value.';
  if (lower.includes('position mode') || lower.includes('position idx')) {
    return 'Position mode mismatch on Bybit (hedge vs one-way). Switch to One-Way mode in Bybit and retry.';
  }
  if (lower.includes('qty') || lower.includes('quantity') || lower.includes('lot size')) {
    return `Order quantity invalid for this symbol. ${raw}`;
  }
  if (lower.includes('price') && (lower.includes('tick') || lower.includes('deviate') || lower.includes('out of range'))) {
    return `Order price invalid. ${raw}`;
  }
  if (lower.includes('api key') || lower.includes('permission') || lower.includes('sign')) {
    return `Bybit API credentials problem: ${raw}. Re-connect your API key with Contract Trading permission enabled.`;
  }
  if (lower.includes('risk limit')) return `Bybit risk limit hit: ${raw}. Reduce size or adjust risk limit in Bybit.`;

  if (raw) return action === 'leverage' ? `Failed to set leverage: ${raw}` : `Order failed: ${raw}`;
  return action === 'leverage' ? 'Failed to set leverage' : 'Failed to place order';
};

const emitTradeUpdated = () => {
  try { window.dispatchEvent(new Event('marcvista:trade-updated')); } catch { /* ignore */ }
};

const TradingPanelPage = () => {
  const [searchParams] = useSearchParams();
  const initialSymbol = (() => {
    const qp = searchParams.get('symbol');
    if (qp) return qp;
    try {
      const stored = localStorage.getItem(SYMBOL_STORAGE_KEY);
      if (stored) return stored;
    } catch { /* ignore */ }
    return 'BTCUSDT';
  })();
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);

  useEffect(() => {
    try { localStorage.setItem(SYMBOL_STORAGE_KEY, selectedSymbol); } catch { /* ignore */ }
  }, [selectedSymbol]);

  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const [leverage, setLeverage] = useState(1);
  const [maxLeverage, setMaxLeverage] = useState(100);
  const [orderPrice, setOrderPrice] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');

  const [positions, setPositions] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  // App-trades from portfolio Trade Breakdown — canonical for risk calculations.
  const [appTrades, setAppTrades] = useState<any[]>([]);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tickerPrice, setTickerPrice] = useState<string | null>(null);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  const lastTradeIdRef = useRef<string | null>(null);

  const { result: lastTradeResult, tradeId: lastTradeId } = useMemo(
    () => getLastTradeInfo(appTrades),
    [appTrades]
  );

  const adjustedRisk = useMemo<number>(() => {
    if (!activeProfile) return 0;
    return calculateAdjustedRisk(activeProfile);
  }, [activeProfile]);

  const lossesToday = useMemo(() => {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    return appTrades.filter(trade => {
      const raw = trade.closedAt ?? trade.updatedAt;
      if (!raw) return false;
      const date = new Date(raw);
      if (isNaN(date.getTime())) return false;
      const pnl = parseFloat(trade.pnl ?? trade.closedPnl ?? 0);
      return date >= start && date <= end && pnl < 0;
    }).length;
  }, [appTrades]);

  const isTradingAllowed = useMemo(() => {
    if (!activeProfile) return false;
    if (positions.length > 0) return false;
    if (pendingOrders.length > 0) return false;
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    if (lossesToday >= dailyLimit) return false;
    return true;
  }, [activeProfile, positions, pendingOrders, lossesToday]);

  const getDisabledReason = useMemo(() => {
    if (!activeProfile) return "No active risk profile. Create and activate one to trade.";
    if (positions.length > 0) return "Active position exists. Close it before placing new orders.";
    if (pendingOrders.length > 0) return "Pending orders exist. Cancel them before placing new orders.";
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    if (lossesToday >= dailyLimit) return `Daily stop loss limit reached (${dailyLimit} losses allowed).`;
    return "";
  }, [activeProfile, positions, pendingOrders, lossesToday]);

  // Detect new closed trade in canonical app-trades → refetch profile so
  // currentrisk reflects the most recent win/loss adjustment.
  useEffect(() => {
    if (!appTrades.length) return;
    const sorted = [...appTrades].sort((a, b) => {
      const ta = new Date(a.closedAt ?? a.updatedAt ?? 0).getTime() || 0;
      const tb = new Date(b.closedAt ?? b.updatedAt ?? 0).getTime() || 0;
      return tb - ta;
    });
    const latest = sorted[0]?._id ?? sorted[0]?.orderId ?? sorted[0]?.closedAt ?? null;
    const latestStr = latest ? String(latest) : null;
    if (latestStr && latestStr !== lastTradeIdRef.current) {
      lastTradeIdRef.current = latestStr;
      riskProfileApi.getActive().then(profile => {
        if (profile) setActiveProfile(profile);
      }).catch(() => {});
    }
  }, [appTrades]);

  const fetchTradingData = useCallback(async () => {
    try {
      setLoading(true);
      const [positionsRes, ordersRes, historyRes, balanceRes, myTradesRes] = await Promise.all([
        orderApi.getPositions(),
        orderApi.getOrders(),
        orderApi.getTradeHistory(),
        orderApi.getBalance(),
        orderApi.getMyTrades(),
      ]);
      const profileRes = await riskProfileApi.getActive();

      setPositions(Array.isArray(positionsRes) ? positionsRes : []);
      setPendingOrders(Array.isArray(ordersRes) ? ordersRes : []);
      const tradesArray = historyRes?.trades || historyRes;
      setTradeHistory(Array.isArray(tradesArray) ? tradesArray : []);
      const my = Array.isArray(myTradesRes) ? myTradesRes : [];
      setAppTrades(my.filter((t: any) => (t.source || 'app') === 'app'));
      setActiveProfile(profileRes);
      setBalance(balanceRes);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch data');
      setPositions([]); setPendingOrders([]); setTradeHistory([]); setAppTrades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const pollTradingData = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [positionsRes, ordersRes, historyRes, balanceRes, myTradesRes] = await Promise.all([
        orderApi.getPositions(),
        orderApi.getOrders(),
        orderApi.getTradeHistory(),
        orderApi.getBalance(),
        orderApi.getMyTrades(),
      ]);
      const profileRes = await riskProfileApi.getActive();

      setPositions(Array.isArray(positionsRes) ? positionsRes : []);
      setPendingOrders(Array.isArray(ordersRes) ? ordersRes : []);
      const tradesArray = historyRes?.trades || historyRes;
      setTradeHistory(Array.isArray(tradesArray) ? tradesArray : []);
      const my = Array.isArray(myTradesRes) ? myTradesRes : [];
      setAppTrades(my.filter((t: any) => (t.source || 'app') === 'app'));
      setActiveProfile(profileRes);
      setBalance(balanceRes);
    } catch (err: any) {
      if (err.message?.includes('No API credentials') || err.message?.includes('credentials')) {
        setIsConnected(false);
      }
    }
  }, []);

  const pollAppTrades = useCallback(async () => {
    if (document.hidden) return;
    try {
      const myTradesRes = await orderApi.getMyTrades();
      const my = Array.isArray(myTradesRes) ? myTradesRes : [];
      setAppTrades(my.filter((t: any) => (t.source || 'app') === 'app'));
    } catch { /* silent */ }
  }, []);

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
        emitTradeUpdated();
      }
    } catch { /* silent */ }
  }, [positions, pollTradingData]);

  const handleDisconnect = async () => { setShowDisconnectDialog(true); };

  const confirmDisconnect = async () => {
    try {
      await connectionApi.disconnect();
      if (activeProfile?._id) {
        try {
          await riskProfileApi.activate(activeProfile._id, false);
          await riskProfileApi.activate(activeProfile._id, true);
        } catch { /* continue */ }
      }
      setIsConnected(false);
      setPositions([]); setPendingOrders([]); setTradeHistory([]); setAppTrades([]);
      setActiveProfile(null); setBalance(null); setTickerPrice(null);
      setShowDisconnectDialog(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
      setShowDisconnectDialog(false);
    }
  };

  const handlePlaceOrder = async (direction: 'Long' | 'Short') => {
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
      emitTradeUpdated();
    } catch (err: any) {
      toast.error(translateBybitError(err, 'order'), { duration: 8000 });
    }
  };

  const handleSetLeverage = async () => {
    try {
      await orderApi.setLeverage(selectedSymbol, leverage);
      toast.success('Leverage updated successfully');
    } catch (err: any) {
      toast.error(translateBybitError(err, 'leverage'), { duration: 8000 });
    }
  };

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      const res = await orderApi.clearTradeHistory();
      toast.success(`Cleared ${res?.deletedCount ?? 0} trades. Older Bybit history is now hidden.`);
      setTradeHistory([]);
      setAppTrades([]);
      lastTradeIdRef.current = null;
      pollTradingData();
      emitTradeUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear trade history');
    } finally {
      setClearingHistory(false);
      setShowClearHistoryDialog(false);
    }
  };

  const handleCancelOrder = async (order: any) => {
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
      emitTradeUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel order');
    }
  };

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
      } catch { /* silent */ }
    };
    syncLeverage();
  }, [selectedSymbol, isConnected]);

  useEffect(() => {
    if (isConnected) fetchTradingData();
  }, [isConnected, fetchTradingData]);

  useEffect(() => {
    if (isConnected !== true) return;

    const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
    let tickerInFlight = false;
    let fastInFlight = false;
    let appTradesInFlight = false;
    let slowInFlight = false;

    const tickerId = setInterval(async () => {
      if (isHidden() || tickerInFlight) return;
      tickerInFlight = true;
      try {
        const ticker = await symbolsApi.getTicker(selectedSymbol);
        if (ticker?.lastPrice) setTickerPrice(ticker.lastPrice);
      } catch { /* silent */ } finally { tickerInFlight = false; }
    }, 1000);

    const fastId = setInterval(async () => {
      if (isHidden() || fastInFlight) return;
      fastInFlight = true;
      try { await quickRefresh(); } finally { fastInFlight = false; }
    }, 2000);

    const appTradesId = setInterval(async () => {
      if (isHidden() || appTradesInFlight) return;
      appTradesInFlight = true;
      try { await pollAppTrades(); } finally { appTradesInFlight = false; }
    }, 5000);

    const slowId = setInterval(async () => {
      if (isHidden() || slowInFlight) return;
      slowInFlight = true;
      try { await pollTradingData(); } finally { slowInFlight = false; }
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !slowInFlight) {
        slowInFlight = true;
        Promise.resolve(pollTradingData()).finally(() => { slowInFlight = false; });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(tickerId);
      clearInterval(fastId);
      clearInterval(appTradesId);
      clearInterval(slowId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isConnected, selectedSymbol, quickRefresh, pollAppTrades, pollTradingData]);

  const accountBalance = balance?.usdtBalance || balance?.balance || balance?.availableBalance || '0.00';

  return (
    <>
      <div className="space-y-4 sm:space-y-6 w-full min-w-0">
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch w-full min-w-0">
          <div className="lg:col-span-8 min-w-0 overflow-hidden">
            <Chart selectedSymbol={selectedSymbol} onSymbolChange={setSelectedSymbol} />
          </div>

          <div className="lg:col-span-4 min-w-0 overflow-hidden">
            <PlaceOrder
              activeProfile={activeProfile}
              positions={positions}
              pendingOrders={pendingOrders}
              appTrades={appTrades}
              adjustedRisk={adjustedRisk}
              leverage={leverage}
              maxLeverage={maxLeverage}
              setLeverage={setLeverage}
              orderPrice={orderPrice}
              setOrderPrice={setOrderPrice}
              takeProfit={takeProfit}
              setTakeProfit={setTakeProfit}
              stopLoss={stopLoss}
              setStopLoss={setStopLoss}
              tickerPrice={tickerPrice}
              accountBalance={accountBalance}
              isTradingAllowed={isTradingAllowed}
              getDisabledReason={getDisabledReason}
              loading={loading}
              onApplyLeverage={handleSetLeverage}
              onPlaceOrder={handlePlaceOrder}
            />
          </div>
        </div>

        <TradingOverview
          loading={loading}
          positions={positions}
          pendingOrders={pendingOrders}
          tradeHistory={tradeHistory}
          onRefresh={fetchTradingData}
          onClearHistory={() => setShowClearHistoryDialog(true)}
          clearingHistory={clearingHistory}
          onCancelOrder={handleCancelOrder}
        />
      </div>

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
