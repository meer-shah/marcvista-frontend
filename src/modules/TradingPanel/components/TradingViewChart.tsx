import React, { useEffect, useRef, useState } from 'react';

interface Props {
  symbol?: string;
  /** TradingView exchange prefix — `BYBIT`, `BINANCE`, `OKX`, `BITGET`, `MEXC`.
   *  The chart symbol becomes `${tvPrefix}:${symbol}.P` so the price feed
   *  matches the active exchange's marks. */
  tvPrefix?: string;
}

const TradingViewChart = ({ symbol = "BTCUSDT", tvPrefix = "BYBIT" }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load TradingView script only once
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      setIsLoading(false);
    };
    script.onerror = () => {
      console.error('Failed to load TradingView library');
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (isLoading || !window.TradingView || !containerRef.current) return;

    // Clear the previous widget IMMEDIATELY so the old symbol's candles
    // don't sit on screen while we wait for the debounced re-init —
    // otherwise the header reads the new symbol while the chart still
    // shows the old one.
    const node = containerRef.current;
    if (node) while (node.firstChild) node.removeChild(node.firstChild);

    // Debounce rapid symbol changes — widget init is expensive (~500ms).
    const handle = window.setTimeout(() => {
      const node = containerRef.current;
      if (!node) return;
      new window.TradingView.widget({
        autosize: true,
        symbol: `${tvPrefix}:${symbol}.P`,
        interval: '5',
        timezone: 'Asia/Karachi',
        style: '1',
        theme: 'dark',
        locale: 'en',
        withdateranges: true,
        hide_side_toolbar: false,
        allow_symbol_change: false,
        details: true,
        calendar: false,
        height: '100%',
        width: '100%',
        container_id: node.id,
        support_host: 'https://www.tradingview.com',
      });
    }, 300);

    return () => window.clearTimeout(handle);
  }, [symbol, tvPrefix, isLoading]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-black/20 rounded-lg border border-white/10">
        <p className="text-muted-foreground">Loading TradingView chart...</p>
      </div>
    );
  }

  return (
    <div
      id="tradingview_widget"
      ref={containerRef}
      className="h-full w-full"
    />
  );
};

export default TradingViewChart;
