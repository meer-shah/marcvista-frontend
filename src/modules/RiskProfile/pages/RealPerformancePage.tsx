import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { orderApi } from '@/lib/api';
import { toast } from 'sonner';

type SourceFilter = 'all' | 'app' | 'external';

interface Summary {
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  wins: number;
  losses: number;
  finalBalance: number;
  maxBalance: number;
  minBalance: number;
  maxDrawdown: number;
}

interface TradeDetail {
  tradeNumber: number;
  symbol: string;
  side: string;
  source: 'app' | 'external';
  entryPrice: number;
  exitPrice: number | null;
  qty: number;
  pnl: number;
  outcome: string;
  placedAt: string;
  closedAt: string | null;
  balanceAfter: number | null;
}

interface BalancePoint {
  trade: number;
  balance: number;
}

const SourceBadge = ({ source }: { source: 'app' | 'external' }) => {
  if (source === 'external') {
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5">
        Exchange
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 opacity-60">
      App
    </Badge>
  );
};

const RealPerformancePage = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [balanceOverTrades, setBalanceOverTrades] = useState<BalancePoint[]>([]);
  const [tradeDetails, setTradeDetails] = useState<TradeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await orderApi.getRealPerformance();
        if (res.message) setMessage(res.message);
        setSummary(res.summary);
        setBalanceOverTrades(res.balanceOverTrades || []);
        setTradeDetails(res.tradeDetails || []);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load real performance');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="p-6">Loading real performance…</div>;
  }

  if (message || !summary) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle>Real Performance</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {message || 'No performance data available yet. Place trades in an active risk profile to populate this view.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fmt = (n: number) => (n ?? 0).toFixed(2);

  const filteredTrades = tradeDetails.filter(t => {
    if (sourceFilter === 'app') return (t.source || 'app') === 'app';
    if (sourceFilter === 'external') return t.source === 'external';
    return true;
  });

  const hasExternalTrades = tradeDetails.some(t => t.source === 'external');
  const externalCount = tradeDetails.filter(t => t.source === 'external').length;
  const appCount = tradeDetails.length - externalCount;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Real Performance</h1>
        <Badge variant="outline">Active Risk Profile</Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Win Rate</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{fmt(summary.winRate)}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Net Profit</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold ${summary.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {fmt(summary.netProfit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Wins / Losses</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{summary.wins} / {summary.losses}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Max Drawdown</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{fmt(summary.maxDrawdown)}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total Profit</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold text-green-500">{fmt(summary.totalProfit)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total Loss</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold text-red-500">{fmt(summary.totalLoss)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Final Balance</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{fmt(summary.finalBalance)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Max / Min Balance</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{fmt(summary.maxBalance)} / {fmt(summary.minBalance)}</p></CardContent>
        </Card>
      </div>

      {/* Balance Curve */}
      <Card>
        <CardHeader><CardTitle>Balance Over Trades</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={{ balance: { label: 'Balance', color: 'hsl(var(--primary))' } }} className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceOverTrades}>
                <XAxis dataKey="trade" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Trade Breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Trade Breakdown</CardTitle>
            <div className="flex gap-1">
              {(['all', 'app', 'external'] as SourceFilter[]).map(f => {
                const count = f === 'all' ? tradeDetails.length : f === 'app' ? appCount : externalCount;
                return (
                  <Button
                    key={f}
                    size="sm"
                    variant={sourceFilter === f ? 'default' : 'outline'}
                    className="h-7 text-xs px-3"
                    onClick={() => setSourceFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'app' ? 'App' : 'Exchange'} ({count})
                  </Button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Symbol</th>
                  <th className="text-left p-2">Side</th>
                  <th className="text-right p-2">Entry</th>
                  <th className="text-right p-2">Exit</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-right p-2">PnL</th>
                  <th className="text-left p-2">Outcome</th>
                  <th className="text-left p-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-6 text-muted-foreground">
                      No trades match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredTrades.map((t) => (
                    <tr key={t.tradeNumber} className="border-b">
                      <td className="p-2">{t.tradeNumber}</td>
                      <td className="p-2">{t.symbol}</td>
                      <td className="p-2">{t.side}</td>
                      <td className="text-right p-2">{fmt(t.entryPrice)}</td>
                      <td className="text-right p-2">{t.exitPrice != null ? fmt(t.exitPrice) : '—'}</td>
                      <td className="text-right p-2">{t.qty}</td>
                      <td className={`text-right p-2 ${t.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{fmt(t.pnl)}</td>
                      <td className="p-2">
                        <Badge variant={t.outcome === 'Win' ? 'default' : 'destructive'}>{t.outcome}</Badge>
                      </td>
                      <td className="p-2">
                        <SourceBadge source={t.source || 'app'} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealPerformancePage;
