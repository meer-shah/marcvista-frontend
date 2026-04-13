import React, { useEffect, useRef, useState } from 'react';

const TradingViewChart = ({ symbol = "BTCUSDT" }: { symbol?: string }) => {
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
    if (!isLoading && window.TradingView && containerRef.current) {
      // Clear previous widget
      containerRef.current.innerHTML = '';

      new window.TradingView.widget({
        autosize: true,
        symbol: `BYBIT:${symbol}.P`,
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
        container_id: containerRef.current.id,
        support_host: 'https://www.tradingview.com',
      });
    }
  }, [symbol, isLoading]);

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
