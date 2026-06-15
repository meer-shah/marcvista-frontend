import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RotateCcw, Trash2 } from "lucide-react";

interface TradingOverviewProps {
  loading: boolean;
  positions: any[];
  pendingOrders: any[];
  tradeHistory: any[];
  onRefresh: () => void;
  onClearHistory: () => void;
  clearingHistory: boolean;
  onCancelOrder: (order: any) => void;
}

const TradingOverview: React.FC<TradingOverviewProps> = ({
  loading, positions, pendingOrders, tradeHistory,
  onRefresh, onClearHistory, clearingHistory, onCancelOrder,
}) => {
  return (
    <Card className="bg-[#0a0a0a] border-white/10 w-full min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-center flex-wrap gap-2">
          <CardTitle className="text-lg">Trading Overview</CardTitle>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClearHistory}
              disabled={clearingHistory}
              title="Erase trade history — hide all trades closed up to this moment (including Bybit-synced ones)."
              aria-label="Erase trade history"
              className="w-8 h-8 rounded-full bg-[#dc2626] hover:bg-[#c11f1f] flex items-center justify-center transition-colors border border-transparent shrink-0 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4 text-white" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title={loading ? 'Refreshing…' : 'Refresh'}
              aria-label="Refresh"
              className="w-8 h-8 rounded-full bg-white hover:bg-white/90 flex items-center justify-center transition-colors border border-transparent shrink-0 disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 text-[#0a0a0a] ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="positions" className="w-full">
          <TabsList className="grid w-full grid-cols-3 [&>button]:text-[11px] [&>button]:px-1 sm:[&>button]:text-sm sm:[&>button]:px-3 [&>button]:whitespace-nowrap">
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="orders">Pending Orders</TabsTrigger>
            <TabsTrigger value="history">Trade History</TabsTrigger>
          </TabsList>

          <TabsContent value="positions" className="space-y-4">
            {loading ? (
              <p className="text-center py-8">Loading positions...</p>
            ) : positions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No active positions</p>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[min(100%,520px)] sm:min-w-[min(100%,560px)] [&_th]:text-[10px] [&_td]:text-[10px] sm:[&_th]:text-xs sm:[&_td]:text-xs">
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

          <TabsContent value="orders" className="space-y-4">
            {loading ? (
              <p className="text-center py-8">Loading orders...</p>
            ) : pendingOrders.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No pending orders</p>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[min(100%,620px)] sm:min-w-[min(100%,680px)] [&_th]:text-[10px] [&_td]:text-[10px] sm:[&_th]:text-xs sm:[&_td]:text-xs">
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
                      <th className="text-left py-2 px-1 text-xs sticky right-0 bg-[#0a0a0a] z-10 border-l border-white/10">Action</th>
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
                        <td className="py-2 px-1 text-xs sticky right-0 bg-[#0a0a0a]/95 backdrop-blur-sm z-10 border-l border-white/10">
                          <Button size="sm" variant="destructive" className="h-6 text-xs px-2"
                            onClick={() => onCancelOrder(order)}>
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

          <TabsContent value="history" className="space-y-4">
            {loading ? (
              <p className="text-center py-8">Loading history...</p>
            ) : tradeHistory.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No trade history</p>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[min(100%,500px)] sm:min-w-[min(100%,540px)] [&_th]:text-[10px] [&_td]:text-[10px] sm:[&_th]:text-xs sm:[&_td]:text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 px-1 text-xs">Symbol</th>
                      <th className="text-left py-2 px-1 text-xs">Size</th>
                      <th className="text-left py-2 px-1 text-xs">Entry</th>
                      <th className="text-left py-2 px-1 text-xs">Exit</th>
                      <th className="text-left py-2 px-1 text-xs">PnL</th>
                      <th className="text-left py-2 px-1 text-xs">Fees</th>
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
                        <td className="py-2 px-1 text-xs text-muted-foreground">
                          {(() => {
                            const fee = trade.fees ?? trade.cumExecFee;
                            const n = fee != null ? parseFloat(fee) : NaN;
                            return Number.isFinite(n) ? `$${n.toFixed(4)}` : '—';
                          })()}
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
  );
};

export default TradingOverview;
