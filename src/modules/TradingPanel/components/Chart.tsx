import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RotateCcw } from "lucide-react";
import NativeChart, { TIMEFRAMES } from "@/modules/TradingPanel/components/NativeChart";
import SymbolSelector from "@/modules/TradingPanel/components/SymbolSelector";
// SymbolSelector is no longer rendered here — it was lifted to the page
// as a stand-alone search row above the chart/risk grid (new layout).

interface ChartProps {
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  /** Kept for backwards-compatible call signature (TradingView removed). */
  tvPrefix?: string;

  // Props the native chart needs.
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

const Chart: React.FC<ChartProps> = ({
  selectedSymbol, onSymbolChange,
  activeExchange = 'bybit',
  isTradingAllowed, getDisabledReason,
  orderPrice, takeProfit, stopLoss,
  setOrderPrice, setTakeProfit, setStopLoss, setTickerPrice,
  activeProfile, onRequestOpen,
  positions, pendingOrders,
}) => {
  // The native (Marcvista) chart needs all of these wired to render.
  const nativeAvailable = !!(
    isTradingAllowed !== undefined &&
    getDisabledReason !== undefined &&
    orderPrice !== undefined &&
    setOrderPrice && setTakeProfit && setStopLoss && onRequestOpen
  );

  // Timeframe lifted here so the selector can live in the chart header
  // (persisted per exchange+symbol, same key the chart used internally).
  const tfKey = `mv_tf_${activeExchange}_${selectedSymbol}`;
  const [tf, setTf] = React.useState<string>(() => {
    try { return localStorage.getItem(tfKey) || '5'; } catch { return '5'; }
  });
  React.useEffect(() => {
    try { setTf(localStorage.getItem(tfKey) || '5'); } catch { setTf('5'); }
  }, [tfKey]);
  const onPickTf = (id: string) => {
    setTf(id);
    try { localStorage.setItem(tfKey, id); } catch { /* ignore */ }
  };
  const [resetSignal, setResetSignal] = React.useState(0);

  return (
    <Card className="bg-[#0a0a0a] border-white/[0.07] rounded-2xl shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)] flex flex-col h-full overflow-hidden">
      <CardHeader className="pt-3 pb-1.5 space-y-2">
        <CardTitle className="text-sm font-medium text-gray-200">Trading Panel</CardTitle>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="w-full sm:flex-1 min-w-0">
            <SymbolSelector selectedSymbol={selectedSymbol} onSymbolChange={onSymbolChange} />
          </div>
          {nativeAvailable && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-0.5 p-0.5 rounded-full border border-white/10 bg-black/40">
                {TIMEFRAMES.map((ti) => (
                  <button
                    key={ti.id}
                    type="button"
                    onClick={() => onPickTf(ti.id)}
                    className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                      tf === ti.id ? 'bg-[#e8590c] text-white font-medium' : 'text-muted-foreground hover:text-white'
                    }`}
                  >
                    {ti.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setResetSignal((n) => n + 1)}
                title="Reset zoom / pan to auto-fit"
                aria-label="Reset chart view"
                className="w-7 h-7 rounded-full bg-white hover:bg-white/90 flex items-center justify-center transition-colors border border-transparent shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#0a0a0a]" />
              </button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-4 pt-1.5 flex flex-col">
        <div className="flex flex-col gap-2 h-full">
          <div className="flex-1 min-h-[520px] sm:min-h-[640px] lg:min-h-0">
            {nativeAvailable ? (
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
                tf={tf}
                onTfChange={onPickTf}
                resetSignal={resetSignal}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Chart unavailable
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Chart;
