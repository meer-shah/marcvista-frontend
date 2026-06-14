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
import PlaceOrderBar from "@/modules/TradingPanel/components/PlaceOrderBar";
import TradingOverview from "@/modules/TradingPanel/components/TradingOverview";
import ConnectExchangeDialog from "@/modules/TradingPanel/components/ConnectExchangeDialog";
import GuideModal from "@/modules/TradingPanel/components/GuideModal";
import RiskFeeCardModal from "@/modules/TradingPanel/components/RiskFeeCardModal";

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
  // All risk profiles for the dropdown in the page-level RiskProfileStrip.
  // Loaded alongside the rest of the trading data; kept in sync after
  // a profile-switch by refetching the active profile from the backend.
  const [profiles, setProfiles] = useState<any[]>([]);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tickerPrice, setTickerPrice] = useState<string | null>(null);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  // Chart Buy/Sell button opens the same Risk & Fee card as a modal so the
  // user doesn't have to scroll to the side panel on small screens.
  // The modal calls the SAME handlePlaceOrder — all gates apply identically.
  const [chartModal, setChartModal] = useState<{ open: boolean; side: 'Long' | 'Short' | null }>({
    open: false, side: null,
  });
  // Multi-exchange UI state
  const [connectDialog, setConnectDialog] = useState<{ open: boolean; exchange: string | null }>({ open: false, exchange: null });
  const [guideDialog, setGuideDialog] = useState<{ open: boolean; exchange: string | null }>({ open: false, exchange: null });
  // TradingView prefix per active exchange — drives the chart symbol so the
  // candles match the venue we're placing orders against.
  const TV_PREFIX_BY_ID: Record<string, string> = {
    bybit: 'BYBIT', binance: 'BINANCE', okx: 'OKX', bitget: 'BITGET', mexc: 'MEXC',
  };
  const [activeExchange, setActiveExchange] = useState<string>('bybit');
  const tvPrefix = TV_PREFIX_BY_ID[activeExchange] || 'BYBIT';
  useEffect(() => {
    connectionApi.getActiveExchange()
      .then(r => setActiveExchange(r?.activeExchange || 'bybit'))
      .catch(() => {/* tolerate */});
  }, []);

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

  // Daily SL budget remaining — lifted out of PlaceOrder so both the
  // top-of-page RiskProfileStrip and the existing PlaceOrder render the
  // same number from the same source. Math is unchanged from the prior
  // PlaceOrder-internal version.
  const dailySLRemaining = useMemo(() => {
    if (!activeProfile) return 0;
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    return Math.max(0, dailyLimit - lossesToday);
  }, [activeProfile, lossesToday]);

  const handleResetStreak = useCallback(async () => {
    if (!confirm('Reset risk-profile streak on the active exchange? currentrisk will go back to initial and wins/losses will be zeroed. Other exchanges keep their state.')) return;
    try {
      const r = await riskProfileApi.resetState();
      toast.success(`Streak reset on ${r?.exchange || 'active exchange'} — currentrisk back to ${r?.state?.currentrisk}%`);
      try { window.dispatchEvent(new Event('marcvista:trade-updated')); } catch { /* ignore */ }
    } catch (err: any) {
      toast.error(err?.message || 'Reset failed');
    }
  }, []);

  // Switch the active risk profile from the trading-panel strip. Routes
  // through the SAME endpoint as the toggle on the Risk Profile page
  // (`riskProfileApi.activate(id, true)`) — backend handles deactivating
  // any other active profile per the per-exchange activation pointer, so
  // the active-profile state mirrors what a user would have set on the
  // dedicated page. After success we refetch the active-profile + list so
  // RiskProfileStrip, PlaceOrder, and the gates all see the new pick.
  const handleSwitchProfile = useCallback(async (newId: string) => {
    if (!newId || newId === activeProfile?._id) return;
    // Can't change the active profile while a trade is live on this exchange —
    // the streak/risk math is mid-trade. Mirrors the Risk Profile page guard.
    if (positions.length > 0 || pendingOrders.length > 0) {
      toast.error('You have an open trade on this exchange. Close it before changing the active risk profile.');
      return;
    }
    const target = profiles.find((p) => p._id === newId);
    if (!target) return;
    setSwitchingProfile(true);
    try {
      await riskProfileApi.activate(newId, true);
      toast.success(`Switched to "${target.title}"`);
      const [profileRes, profilesRes] = await Promise.all([
        riskProfileApi.getActiveState(),
        riskProfileApi.getAll().catch(() => []),
      ]);
      setActiveProfile(profileRes);
      setProfiles(Array.isArray(profilesRes) ? profilesRes : []);
      try { window.dispatchEvent(new Event('marcvista:trade-updated')); } catch { /* ignore */ }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to switch profile');
    } finally {
      setSwitchingProfile(false);
    }
  }, [activeProfile, profiles, positions, pendingOrders]);

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
      riskProfileApi.getActiveState().then(profile => {
        if (profile) setActiveProfile(profile);
      }).catch(() => {});
    }
  }, [appTrades]);

  const fetchTradingData = useCallback(async () => {
    try {
      setLoading(true);
      // Single batch — the profile + profiles reads are independent of the
      // first five, so there's no reason to await them in a second stage
      // (that added a full round-trip to initial load). Fire all seven at once.
      const [positionsRes, ordersRes, historyRes, balanceRes, myTradesRes, profileRes, profilesRes] = await Promise.all([
        orderApi.getPositions(),
        orderApi.getOrders(),
        orderApi.getTradeHistory(),
        orderApi.getBalance(),
        orderApi.getMyTrades(),
        riskProfileApi.getActiveState(),
        riskProfileApi.getAll().catch(() => []),
      ]);

      setPositions(Array.isArray(positionsRes) ? positionsRes : []);
      setPendingOrders(Array.isArray(ordersRes) ? ordersRes : []);
      const tradesArray = historyRes?.trades || historyRes;
      setTradeHistory(Array.isArray(tradesArray) ? tradesArray : []);
      const my = Array.isArray(myTradesRes) ? myTradesRes : [];
      setAppTrades(my.filter((t: any) => (t.source || 'app') === 'app'));
      setActiveProfile(profileRes);
      setProfiles(Array.isArray(profilesRes) ? profilesRes : []);
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
      const profileRes = await riskProfileApi.getActiveState();

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

  // Active-exchange switch — extracted so both the header ExchangeSelector
  // and the one in the Risk & Fee idle panel call the exact same flow.
  // Verbatim move of the previous inline header handler.
  const handleExchangeSwitch = useCallback((ex: string) => {
    // Refetch panel data + swap chart price feed to the new venue.
    // Drop symbol/instrument/ticker caches — they're per-exchange
    // and would otherwise serve stale precision for sizing.
    symbolsApi.invalidateCaches();
    setActiveExchange(ex);
    fetchTradingData();
    emitTradeUpdated();
    // Hint to fall back to BTCUSDT if the currently-selected symbol
    // isn't on the new exchange. SymbolSelector itself surfaces
    // a "not available" state by refetching the symbol list.
    symbolsApi.getAll().then((symbols: string[]) => {
      if (Array.isArray(symbols) && symbols.length && !symbols.includes(selectedSymbol)) {
        const fallback = symbols.includes('BTCUSDT') ? 'BTCUSDT' : symbols[0];
        toast.warning(`${selectedSymbol} not listed on ${ex} — switched to ${fallback}.`, { duration: 6000 });
        setSelectedSymbol(fallback);
      }
    }).catch(() => { /* ignore */ });
  }, [selectedSymbol, fetchTradingData]);

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

  // Single source of truth for order submission. Called from:
  //   (a) PlaceOrder side panel's Open Long / Open Short buttons.
  //   (b) RiskFeeCardModal triggered by the chart's Buy / Sell buttons.
  // The modal awaits the returned promise so it can close on success and
  // stay open on error. Every gate below applies to BOTH routes.
  const handlePlaceOrder = async (direction: 'Long' | 'Short') => {
    if (!activeProfile) {
      toast.error('No active risk profile. Please create and activate a risk profile to place orders.');
      throw new Error('no-active-profile');
    }
    if (positions.length > 0) {
      toast.error('Cannot place order: An active position already exists. Please close it first.');
      throw new Error('active-position');
    }
    if (pendingOrders.length > 0) {
      toast.error('Cannot place order: You have pending orders. Cancel them first.');
      throw new Error('pending-orders');
    }
    const dailyLimit = activeProfile.SLallowedperday ?? 1000;
    if (lossesToday >= dailyLimit) {
      toast.error(`Daily stop loss limit reached (${dailyLimit} losses allowed).`);
      throw new Error('daily-sl-limit');
    }
    if (!stopLoss) { toast.error('Stop Loss is required'); throw new Error('sl-required'); }
    if (!takeProfit) { toast.error('Take Profit is required'); throw new Error('tp-required'); }
    const fallbackPrice = tickerPrice ? parseFloat(tickerPrice) : NaN;
    const finalPrice = orderPrice ? parseFloat(orderPrice) : fallbackPrice;
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      toast.error('Order price unavailable — enter an entry price or wait for live price to load.');
      throw new Error('invalid-price');
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
      const res = await orderApi.placeOrder(orderPayload);
      // If broker attached SL/TP and a trigger failed (e.g. Binance TradFi
      // agreement not signed), surface the actionable warning to the user.
      if (res?.warning) {
        toast.warning(`Order placed, but: ${res.warning}`, { duration: 10000 });
      } else {
        toast.success('Order placed successfully!');
      }
      setOrderPrice(''); setTakeProfit(''); setStopLoss('');
      quickRefresh();
      emitTradeUpdated();
      // Fast post-placement sync — catches near-instant SL hits (price gap,
      // crossed spread) without waiting for the 5s slow poll. Two staggered
      // refreshes cover Bybit propagation delay (typically 1–3 s).
      window.setTimeout(() => pollTradingData().catch(() => {}), 1500);
      window.setTimeout(() => pollTradingData().catch(() => {}), 3500);
    } catch (err: any) {
      toast.error(translateBybitError(err, 'order'), { duration: 8000 });
      throw err;
    }
  };

  const handleSetLeverage = async () => {
    try {
      await orderApi.setLeverage(selectedSymbol, leverage);
      toast.success('Leverage updated successfully');
      // Persist locally so a reload restores the same leverage even on
      // venues (MEXC) whose public API has no "read current leverage"
      // endpoint when there's no open position.
      try {
        localStorage.setItem(`mv_lev_${activeExchange}_${selectedSymbol}`, String(leverage));
      } catch { /* ignore */ }
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
        // 1) Pull instrument max — clamps the slider's upper bound.
        //    Guard against zero / NaN responses which used to silently
        //    drag the slider value to 0.
        const info = await symbolsApi.getInstrumentInfo(selectedSymbol);
        const rawMax = parseFloat(info?.leverageFilter?.maxLeverage);
        const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 100;
        setMaxLeverage(max);

        // 2) Restore previously-set leverage from localStorage if any.
        //    Needed for exchanges (MEXC) whose public API doesn't return
        //    current leverage when no position is open.
        let restored: number | null = null;
        try {
          const cached = localStorage.getItem(`mv_lev_${activeExchange}_${selectedSymbol}`);
          const n = cached ? parseFloat(cached) : NaN;
          if (Number.isFinite(n) && n >= 1) restored = Math.min(n, max);
        } catch { /* ignore */ }
        if (restored != null) {
          setLeverage(restored);
        } else {
          setLeverage(prev => Math.max(1, Math.min(prev || 1, max)));
        }

        // 3) Live position trumps the cache — it's the real broker state.
        if (isConnected) {
          const positionsRes = await orderApi.getPositions(selectedSymbol);
          const posList = Array.isArray(positionsRes) ? positionsRes : (positionsRes?.result?.list || []);
          const currentPos = posList.find((p: any) => p.symbol === selectedSymbol);
          const posLev = currentPos ? parseFloat(currentPos.leverage) : NaN;
          if (Number.isFinite(posLev) && posLev > 0) {
            setLeverage(Math.min(posLev, max));
            try { localStorage.setItem(`mv_lev_${activeExchange}_${selectedSymbol}`, String(posLev)); } catch { /* ignore */ }
          }
        }
      } catch { /* silent */ }
    };
    syncLeverage();
  }, [selectedSymbol, isConnected, activeExchange]);

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
      <div className="space-y-3 sm:space-y-4 w-full min-w-0">
        {/* Heading now lives inside the chart card header. Connection status,
            balance, exchange switcher and the active risk-profile controls
            live inside the Risk & Fee idle panel (right column), so the old
            top status bar + RiskProfileStrip were removed to avoid dupes. */}

        {/* Single-screen workspace.
            Place Order takes its natural height; the chart+risk row fills
            whatever vertical space is left up to the viewport cap. If the
            viewport is genuinely too short to fit both (small laptops),
            we let the page scroll instead of overlap. No `min-h` is
            enforced on the workspace itself — that was forcing it taller
            than short viewports and overlapping the lower bar. */}
        {/* Trade workspace — sizes naturally to children. The upper row
            gets its 520px floor; PlaceOrderBar takes its natural height
            below. TradingOverview always starts where the workspace
            actually ends, never on top of it. If the viewport can't fit
            everything, the page scrolls (no overlap). */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 w-full min-w-0">

          {/* Left column — chart on top, Place Order bar beneath. The column's
              own height (chart + gap + bar) drives the row, so the right-hand
              Risk & Fee card stretches to equal BOTH of these stacked cards. */}
          <div className="lg:col-span-9 min-w-0 flex flex-col gap-4 lg:gap-3">
            <div className="min-w-0 overflow-hidden lg:h-[420px]">
              <Chart
                selectedSymbol={selectedSymbol}
                onSymbolChange={setSelectedSymbol}
                tvPrefix={tvPrefix}
                activeExchange={activeExchange}
                isTradingAllowed={isTradingAllowed}
                getDisabledReason={getDisabledReason}
                orderPrice={orderPrice}
                takeProfit={takeProfit}
                stopLoss={stopLoss}
                setOrderPrice={setOrderPrice}
                setTakeProfit={setTakeProfit}
                setStopLoss={setStopLoss}
                setTickerPrice={setTickerPrice}
                activeProfile={activeProfile}
                onRequestOpen={(side) => setChartModal({ open: true, side })}
                positions={positions}
                pendingOrders={pendingOrders}
              />
            </div>

            <PlaceOrderBar
              leverage={leverage}
              setLeverage={setLeverage}
              maxLeverage={maxLeverage}
              onApplyLeverage={handleSetLeverage}
              orderPrice={orderPrice}
              setOrderPrice={setOrderPrice}
              takeProfit={takeProfit}
              setTakeProfit={setTakeProfit}
              stopLoss={stopLoss}
              setStopLoss={setStopLoss}
              tickerPrice={tickerPrice}
              accountBalance={accountBalance}
              adjustedRisk={adjustedRisk}
              activeProfile={activeProfile}
              isTradingAllowed={isTradingAllowed}
              getDisabledReason={getDisabledReason}
              loading={loading}
              // Same handler as the side panel + the modal — single source of
              // truth for every gate (active profile, daily-SL, R:R block, etc.)
              onPlaceOrder={(d) => { handlePlaceOrder(d).catch(() => {}); }}
            />
          </div>

          {/* Right column — single Risk & Fee card spanning the full height of
              the left column (chart + Place Order bar). On lg the card is
              absolutely filled so its own (possibly long) content never grows
              the row — it scrolls internally instead. */}
          <div className="lg:col-span-3 min-w-0 lg:relative">
            <div className="lg:absolute lg:inset-0">
            <PlaceOrder
              variant="card-only"
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
              isConnected={isConnected}
              profiles={profiles}
              onSwitchProfile={handleSwitchProfile}
              switchingProfile={switchingProfile}
              onSwitchExchange={handleExchangeSwitch}
              onConnectExchange={(ex) => setConnectDialog({ open: true, exchange: ex })}
              onViewGuideExchange={(ex) => setGuideDialog({ open: true, exchange: ex })}
              isTradingAllowed={isTradingAllowed}
              getDisabledReason={getDisabledReason}
              loading={loading}
              onApplyLeverage={handleSetLeverage}
              // Variant='card-only' hides the Open buttons inside PlaceOrder
              // — placement happens via PlaceOrderBar in the left column — but
              // the prop is still required and harmless.
              onPlaceOrder={(d) => { handlePlaceOrder(d).catch(() => {}); }}
            />
            </div>
          </div>

        </div>{/* /workspace */}

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

      <RiskFeeCardModal
        open={chartModal.open}
        side={chartModal.side}
        onClose={() => setChartModal({ open: false, side: null })}
        orderPrice={orderPrice}
        takeProfit={takeProfit}
        stopLoss={stopLoss}
        tickerPrice={tickerPrice}
        accountBalance={accountBalance}
        adjustedRisk={adjustedRisk}
        activeProfile={activeProfile}
        isTradingAllowed={isTradingAllowed}
        getDisabledReason={getDisabledReason}
        loading={loading}
        onPlaceOrder={handlePlaceOrder}
      />

      {/* Multi-exchange connect + guide dialogs */}
      <ConnectExchangeDialog
        open={connectDialog.open}
        exchange={connectDialog.exchange}
        onOpenChange={(open) => setConnectDialog(s => ({ ...s, open }))}
        onConnected={(ex) => {
          // After successful connect, immediately switch to it and refetch.
          connectionApi.setActiveExchange(ex)
            .then(() => { setActiveExchange(ex); fetchTradingData(); })
            .catch(() => { /* ignore */ });
        }}
      />
      <GuideModal
        open={guideDialog.open}
        exchange={guideDialog.exchange}
        onOpenChange={(open) => setGuideDialog(s => ({ ...s, open }))}
      />
    </>
  );
};

export default TradingPanelPage;
