import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TradingViewChart from "@/modules/TradingPanel/components/TradingViewChart";
import NativeChart from "@/modules/TradingPanel/components/NativeChart";
// SymbolSelector is no longer rendered here — it was lifted to the page
// as a stand-alone search row above the chart/risk grid (new layout).

type ChartSource = 'tradingview' | 'native';

interface ChartProps {
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  /** Active-exchange TradingView prefix (e.g. 'BYBIT', 'BINANCE'). */
  tvPrefix?: string;

  // Props the native chart needs. All optional so the file stays drop-in
  // compatible if a caller still uses the old <Chart selectedSymbol ...>
  // signature; native mode is hidden when these aren't provided.
  activeExchange?: string;
  isTradingAllowed?: boolean;
  getDisabledReason?: string;
  orderPrice?: string;
  takeProfit?: string;
  stopLoss?: string;
  setOrderPrice?: (v: string) => void;
  setTakeProfit?: (v: string) => void;
  setStopLoss?: (v: string) => void;
  setTickerPrice?: (v: string) => void;
  activeProfile?: any;
  onRequestOpen?: (side: 'Long' | 'Short') => void;
  // Broker state for the active exchange — used to draw read-only entry /
  // SL / TP lines on the native chart for the symbol being viewed.
  positions?: any[];
  pendingOrders?: any[];
}

const SOURCE_STORAGE_KEY = 'mv_chart_source';

const Chart: React.FC<ChartProps> = ({
  selectedSymbol, onSymbolChange, tvPrefix = 'BYBIT',
  activeExchange = 'bybit',
  isTradingAllowed, getDisabledReason,
  orderPrice, takeProfit, stopLoss,
  setOrderPrice, setTakeProfit, setStopLoss, setTickerPrice,
  activeProfile, onRequestOpen,
  positions, pendingOrders,
}) => {
  // Native mode is only available when the parent has wired all the props
  // it needs. Otherwise we hide the toggle and stay on TradingView, so this
  // component still behaves like the old version in any unwired caller.
  const nativeAvailable = !!(
    isTradingAllowed !== undefined &&
    getDisabledReason !== undefined &&
    orderPrice !== undefined &&
    setOrderPrice && setTakeProfit && setStopLoss && onRequestOpen
  );

  const [source, setSource] = useState<ChartSource>(() => {
    try {
      const s = localStorage.getItem(SOURCE_STORAGE_KEY);
      if (s === 'native' || s === 'tradingview') return s;
    } catch { /* ignore */ }
    return 'tradingview';
  });

  useEffect(() => {
    try { localStorage.setItem(SOURCE_STORAGE_KEY, source); } catch { /* ignore */ }
  }, [source]);

  // If native mode isn't wired, force TV so we never render an unsatisfied
  // NativeChart.
  const effective: ChartSource = nativeAvailable ? source : 'tradingview';

  return (
    <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 flex flex-col h-full overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between gap-2 flex-wrap">
          <span>
            {selectedSymbol} Trading Chart
            <span className="text-[10px] text-muted-foreground ml-2 font-normal">
              via {effective === 'native' ? activeExchange.toUpperCase() : tvPrefix}
            </span>
          </span>
          {nativeAvailable && (
            <div className="flex gap-1 p-1 rounded-full border border-white/10 bg-black/40 text-xs">
              <button
                type="button"
                onClick={() => setSource('tradingview')}
                className={`px-3 py-1 rounded-full transition-colors ${
                  effective === 'tradingview' ? 'bg-green-500 text-black font-semibold' : 'text-muted-foreground hover:text-white'
                }`}
              >TradingView</button>
              <button
                type="button"
                onClick={() => setSource('native')}
                className={`px-3 py-1 rounded-full transition-colors ${
                  effective === 'native' ? 'bg-green-500 text-black font-semibold' : 'text-muted-foreground hover:text-white'
                }`}
              >Marcvista</button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-4 flex flex-col">
        <div className="flex flex-col gap-4 h-full">
          <div className="flex-1 min-h-[520px] sm:min-h-[640px] lg:min-h-0">
            {effective === 'native' ? (
              <NativeChart
                exchange={activeExchange}
                symbol={selectedSymbol}
                isTradingAllowed={isTradingAllowed!}
                getDisabledReason={getDisabledReason!}
                orderPrice={orderPrice!}
                takeProfit={takeProfit!}
                stopLoss={stopLoss!}
                setOrderPrice={setOrderPrice!}
                setTakeProfit={setTakeProfit!}
                setStopLoss={setStopLoss!}
                onLivePrice={setTickerPrice}
                onRequestOpen={onRequestOpen!}
                activeProfile={activeProfile}
                positions={positions}
                pendingOrders={pendingOrders}
              />
            ) : (
              <TradingViewChart symbol={selectedSymbol} tvPrefix={tvPrefix} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Chart;
