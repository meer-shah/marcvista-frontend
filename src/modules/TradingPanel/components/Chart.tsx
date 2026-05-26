import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TradingViewChart from "@/modules/TradingPanel/components/TradingViewChart";
import SymbolSelector from "@/modules/TradingPanel/components/SymbolSelector";

interface ChartProps {
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

const Chart: React.FC<ChartProps> = ({ selectedSymbol, onSymbolChange }) => {
  return (
    <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 flex flex-col h-full overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg">{selectedSymbol} Trading Chart</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-4 flex flex-col">
        <div className="flex flex-col gap-4 h-full">
          <SymbolSelector selectedSymbol={selectedSymbol} onSymbolChange={onSymbolChange} />
          <div className="flex-1 min-h-[520px] sm:min-h-[640px] lg:min-h-0">
            <TradingViewChart symbol={selectedSymbol} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Chart;
