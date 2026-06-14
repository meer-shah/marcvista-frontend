import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { orderApi } from '@/lib/api';
import { toast } from 'sonner';
import BalanceCurveChart from '@/modules/UserPortfolio/components/BalanceCurveChart';
import CubeBar from '@/modules/UserPortfolio/components/CubeBar';

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
  stopLoss: number | null;
  takeProfit: number | null;
  qty: number;
  pnl: number;
  payout: number;
  riskPercent: number | null;
  outcome: string;
  placedAt: string;
  closedAt: string | null;
  balanceAfter: number | null;
}

interface BalancePoint {
  trade: number;
  balance: number;
}

const BADGE = 'text-[10px] px-2 rounded-full justify-center min-w-[66px] border-transparent';

const SourceBadge = ({ source }: { source: 'app' | 'external' }) => {
  if (source === 'external') {
    return <Badge className={`bg-[#facc15] text-black ${BADGE}`}>Exchange</Badge>;
  }
  return <Badge className={`bg-[#e8590c] text-white ${BADGE}`}>App</Badge>;
};

const RealPerformancePage = () => {
  const navigate = useNavigate();
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
    return <div className="text-sm text-muted-foreground">Loading real performance…</div>;
  }

  if (message || !summary) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate('/risk-profile')}
          title="Back to Risk Profiles"
          aria-label="Back to Risk Profiles"
          className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10"
        >
          <ArrowLeft className="w-4 h-4 text-gray-300" />
        </button>
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

  const computeRR = (t: TradeDetail): string => {
    if (t.stopLoss == null || t.takeProfit == null || t.entryPrice == null) return '—';
    const risk = Math.abs(t.entryPrice - t.stopLoss);
    const reward = Math.abs(t.takeProfit - t.entryPrice);
    if (risk <= 0) return '—';
    return `1:${(reward / risk).toFixed(2)}`;
  };

  const filteredTrades = tradeDetails.filter(t => {
    if (sourceFilter === 'app') return (t.source || 'app') === 'app';
    if (sourceFilter === 'external') return t.source === 'external';
    return true;
  });

  const hasExternalTrades = tradeDetails.some(t => t.source === 'external');
  const externalCount = tradeDetails.filter(t => t.source === 'external').length;
  const appCount = tradeDetails.length - externalCount;

  const s = summary;
  const money = [s.netProfit, s.totalProfit, s.totalLoss, s.finalBalance, s.maxBalance, s.minBalance].map(Number);
  const maxMoney = Math.max(1, ...money.map((v) => Math.abs(v || 0)));
  const noBar = [
    { label: 'Wins / Losses', value: `${s.wins} / ${s.losses}` },
    { label: 'Max / Min Balance', value: `${fmt(s.maxBalance)} / ${fmt(s.minBalance)}` },
  ];
  const bars = [
    { label: 'Win Rate', value: `${fmt(s.winRate)}%`, frac: (Number(s.winRate) || 0) / 100 },
    { label: 'Net Profit', value: fmt(s.netProfit), frac: Math.abs(Number(s.netProfit) || 0) / maxMoney },
    { label: 'Max Drawdown', value: `${fmt(s.maxDrawdown)}%`, frac: (Number(s.maxDrawdown) || 0) / 100 },
    { label: 'Total Profit', value: fmt(s.totalProfit), frac: Math.abs(Number(s.totalProfit) || 0) / maxMoney },
    { label: 'Total Loss', value: fmt(s.totalLoss), frac: Math.abs(Number(s.totalLoss) || 0) / maxMoney },
    { label: 'Final Balance', value: fmt(s.finalBalance), frac: Math.abs(Number(s.finalBalance) || 0) / maxMoney },
  ];
  // Chronological: oldest first → newest at the bottom. The table auto-scrolls
  // to the bottom so the most recent trades are what you see by default.
  const rows = filteredTrades;
  const tradeTableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tradeTableRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/risk-profile')}
            title="Back"
            aria-label="Back"
            className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10"
          >
            <ArrowLeft className="w-4 h-4 text-gray-300" />
          </button>
          <h1 className="text-xl font-semibold">Real Performance</h1>
        </div>
        <Badge variant="outline">Active Risk Profile</Badge>
      </div>

      {/* Balance curve (left) + stats card (right) */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0 h-[260px]">
          <BalanceCurveChart data={balanceOverTrades.map((p) => ({ name: String(p.trade), balance: p.balance }))} />
        </div>
        <div className="lg:w-64 lg:h-[260px] shrink-0 rounded-2xl bg-white border border-black/5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] p-3 flex flex-col overflow-hidden">
          <div className="text-xs font-medium text-gray-900 mb-1">Performance</div>
          <div className="flex flex-col gap-2 w-full flex-1 justify-center">
            <div className="space-y-1.5">
              {noBar.map((st) => (
                <div key={st.label} className="flex items-baseline justify-between gap-2 leading-none">
                  <span className="text-[10px] text-gray-900">{st.label}</span>
                  <span className="text-[9px] font-medium tracking-tight text-gray-500">{st.value}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {bars.map((st) => (
                <div key={st.label} className="leading-none">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] text-gray-900">{st.label}</span>
                    <span className="text-[9px] font-medium tracking-tight text-gray-500">{st.value}</span>
                  </div>
                  <div className="mt-0.5">
                    <CubeBar frac={st.frac} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Trade Breakdown */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-sm font-medium text-gray-200">Trade Breakdown</div>
          <div className="flex gap-1">
            {(['all', 'app', 'external'] as SourceFilter[]).map((f) => {
              const count = f === 'all' ? tradeDetails.length : f === 'app' ? appCount : externalCount;
              const active = sourceFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setSourceFilter(f)}
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                    active
                      ? 'bg-[#e8590c] border-[#e8590c] text-white font-medium'
                      : 'bg-white/[0.05] border-white/10 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'app' ? 'App' : 'Exchange'} ({count})
                </button>
              );
            })}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trades match this filter.</p>
        ) : (
          <div ref={tradeTableRef} className="overflow-auto h-[155px] rounded-2xl border border-white/10 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-black [&::-webkit-scrollbar-corner]:bg-black [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full">
            <table className="w-full min-w-[760px] text-[9px] sm:text-[11px] [&_th]:!py-2 [&_td]:!py-1 [&_th]:!px-1.5 sm:[&_th]:!px-2 [&_td]:!px-1.5 sm:[&_td]:!px-2">
              <thead className="sticky top-0 z-10 bg-[#0a0a0a]">
                <tr className="border-b">
                  <th className="text-left">#</th>
                  <th className="text-left">Date</th>
                  <th className="text-left">Symbol</th>
                  <th className="text-left">Dir</th>
                  <th className="text-right">Risk%</th>
                  <th className="text-right" title="Reward:Risk from TP and SL">RR</th>
                  <th className="text-left">Result</th>
                  <th className="text-right">PNL</th>
                  <th className="text-right">Payout</th>
                  <th className="text-right">Balance</th>
                  <th className="text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.tradeNumber} className="border-b hover:bg-white/[0.02]">
                    <td className="text-muted-foreground">{t.tradeNumber}</td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {t.closedAt ? new Date(t.closedAt).toLocaleDateString() : t.placedAt ? new Date(t.placedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="font-medium">{t.symbol}</td>
                    <td>
                      <span className={t.side?.toLowerCase() === 'buy' ? 'text-green-500' : 'text-red-500'}>{t.side}</span>
                    </td>
                    <td className="text-right">{t.riskPercent != null ? `${fmt(t.riskPercent)}%` : '—'}</td>
                    <td className="text-right text-muted-foreground" title={t.stopLoss != null && t.takeProfit != null ? `SL ${fmt(t.stopLoss)} / TP ${fmt(t.takeProfit)}` : 'No SL/TP set'}>
                      {computeRR(t)}
                    </td>
                    <td>
                      <Badge className={`${t.outcome === 'Win' ? 'bg-[#16a34a]' : 'bg-[#dc2626]'} text-white ${BADGE}`}>{t.outcome}</Badge>
                    </td>
                    <td className={`text-right font-medium ${t.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{fmt(t.pnl)}</td>
                    <td className="text-right">{fmt(t.payout)}</td>
                    <td className="text-right font-medium">{t.balanceAfter != null ? fmt(t.balanceAfter) : '—'}</td>
                    <td>
                      <SourceBadge source={t.source || 'app'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RealPerformancePage;
