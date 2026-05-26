import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Check, Plug, BookOpen } from 'lucide-react';
import { connectionApi } from '@/lib/api';
import { toast } from 'sonner';

interface ExchangeMeta { id: string; label: string; tvPrefix: string; feeRates: { maker: number; taker: number } }
interface ConnRow { exchange: string; mode: string }

interface Props {
  /** Called after the user successfully switches active exchange so the
   *  parent can refetch positions/orders/balance from the new venue. */
  onSwitch?: (exchange: string) => void;
  /** Called when the user clicks "Connect" — parent should open a credentials
   *  modal for the chosen exchange. Receives the exchange id. */
  onConnect?: (exchange: string) => void;
  /** Called when the user clicks "View Guide" on an exchange. */
  onViewGuide?: (exchange: string) => void;
}

const COLOR_BY_ID: Record<string, string> = {
  bybit:   'bg-orange-500',
  binance: 'bg-yellow-500',
  okx:     'bg-sky-500',
  bitget:  'bg-cyan-500',
  mexc:    'bg-emerald-500',
};

const ExchangeSelector: React.FC<Props> = ({ onSwitch, onConnect, onViewGuide }) => {
  const [meta, setMeta] = useState<ExchangeMeta[]>([]);
  const [connections, setConnections] = useState<ConnRow[]>([]);
  const [active, setActive] = useState<string>('bybit');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [m, c] = await Promise.all([connectionApi.listExchanges(), connectionApi.getConnections()]);
      setMeta(m.exchanges || []);
      setConnections(c.connections || []);
      setActive(c.activeExchange || 'bybit');
    } catch (err: any) { /* tolerate first-load errors */ }
  };

  useEffect(() => { refresh(); }, []);

  const switchTo = async (exchange: string) => {
    if (exchange === active) return;
    setBusy(true);
    try {
      await connectionApi.setActiveExchange(exchange);
      setActive(exchange);
      toast.success(`Switched to ${exchange}`);
      onSwitch?.(exchange);
    } catch (err: any) {
      toast.error(err?.message || `Failed to switch to ${exchange}`);
    } finally { setBusy(false); }
  };

  const activeMeta = meta.find(m => m.id === active);
  const connectedSet = new Set(connections.map(c => c.exchange));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy} className="gap-1.5 h-8 text-xs">
          <span className={`w-2 h-2 rounded-full ${COLOR_BY_ID[active] || 'bg-white/40'}`} />
          <span className="capitalize">{activeMeta?.label || active}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Active Exchange</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {meta.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">Loading…</div>
        )}
        {meta.map(m => {
          const isConnected = connectedSet.has(m.id);
          const isActive = m.id === active;
          const conn = connections.find(c => c.exchange === m.id);
          return (
            <div key={m.id} className="px-2 py-1.5 flex items-center justify-between gap-2 hover:bg-white/[0.03] rounded">
              <button
                onClick={() => isConnected && switchTo(m.id)}
                disabled={!isConnected || isActive}
                className="flex items-center gap-2 text-left flex-1 min-w-0 disabled:opacity-50 disabled:cursor-default"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${COLOR_BY_ID[m.id] || 'bg-white/40'}`} />
                <span className="text-xs capitalize truncate">{m.label}</span>
                {isActive && <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                {conn && (
                  <Badge variant="outline" className="text-[9px] px-1 ml-1 uppercase">{conn.mode}</Badge>
                )}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {onViewGuide && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    title={`${m.label} guide`}
                    onClick={(e) => { e.stopPropagation(); onViewGuide(m.id); }}
                  >
                    <BookOpen className="w-3 h-3" />
                  </Button>
                )}
                {!isConnected && onConnect && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 gap-1 text-blue-400"
                    onClick={(e) => { e.stopPropagation(); onConnect(m.id); }}
                  >
                    <Plug className="w-3 h-3" /> Connect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExchangeSelector;
