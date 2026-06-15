import { useCallback, useEffect, useState } from "react";
import { Link2, CheckCircle, XCircle, Loader2, AlertTriangle, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { connectionApi } from "@/lib/api";
import { toast } from "sonner";
import ConnectExchangeDialog from "@/modules/TradingPanel/components/ConnectExchangeDialog";

type ExchangeMeta = { id: string; label: string; tvPrefix?: string };
type Connection = { exchange: string; mode: 'demo' | 'real'; updatedAt?: string };

const ExchangePage = () => {
  const [loading, setLoading] = useState(true);
  const [exchanges, setExchanges] = useState<ExchangeMeta[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeExchange, setActiveExchange] = useState<string>('bybit');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [connectDialog, setConnectDialog] = useState<{ open: boolean; exchange: string | null }>({ open: false, exchange: null });

  const refresh = useCallback(async () => {
    try {
      const [listRes, connRes] = await Promise.all([
        connectionApi.listExchanges(),
        connectionApi.getConnections(),
      ]);
      const list: ExchangeMeta[] = listRes?.exchanges || [];
      setExchanges(list);
      setConnections(Array.isArray(connRes?.connections) ? connRes.connections : []);
      setActiveExchange(connRes?.activeExchange || 'bybit');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load exchanges');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connByEx = (id: string) => connections.find(c => c.exchange === id) || null;

  const handleDisconnect = async (exchange: string) => {
    setBusyId(exchange);
    try {
      await connectionApi.disconnectExchange(exchange);
      toast.success(`${exchange.toUpperCase()} disconnected.`);
      setConfirmDisconnect(null);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Disconnect failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetActive = async (exchange: string) => {
    setBusyId(exchange);
    try {
      await connectionApi.setActiveExchange(exchange);
      toast.success(`Active exchange set to ${exchange.toUpperCase()}.`);
      setActiveExchange(exchange);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to set active exchange');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Safety note */}
      <Card className="card-shell">
        <CardContent className="py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Generate API keys on each exchange with <strong>read</strong> + <strong>futures/contract trade</strong> permission only.
            Never enable <strong>withdraw</strong>. Use <strong>Demo</strong> mode for testnet keys.
          </p>
        </CardContent>
      </Card>

      {/* Exchanges */}
      <Card className="card-shell">
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-gray-200">Exchanges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading exchanges…
            </div>
          ) : exchanges.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No exchanges available.</p>
          ) : (
            exchanges.map((ex) => {
              const conn = connByEx(ex.id);
              const isConnected = !!conn;
              const real = isConnected && conn?.mode === 'real';
              const onDark = !isConnected || real; // light text: black (disconnected) or orange (real)
              const active = activeExchange === ex.id;
              const isBusy = busyId === ex.id;
              const isConfirming = confirmDisconnect === ex.id;
              const rowBg = real
                ? 'bg-[#e8590c] border-[#e8590c]'
                : isConnected
                  ? 'bg-white border-black/5 hover:bg-gray-50'
                  : 'bg-black border-white/10 hover:bg-white/[0.04]';

              return (
                <div
                  key={ex.id}
                  className={`rounded-xl border shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] transition-colors ${rowBg}`}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4">
                    {/* Left: status + name + meta */}
                    <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                      {isConnected
                        ? <CheckCircle className={`w-4 h-4 shrink-0 ${onDark ? 'text-white' : 'text-gray-600'}`} />
                        : <XCircle className={`w-4 h-4 shrink-0 ${onDark ? 'text-white/70' : 'text-gray-400'}`} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium truncate ${onDark ? 'text-white' : 'text-gray-900'}`}>{ex.label}</span>
                          {isConnected && (
                            <Badge className={`badge-pill ${
                              real ? 'bg-white/20 text-white' : 'bg-[#facc15] text-black'
                            }`}>
                              {real ? 'Live' : 'Demo'}
                            </Badge>
                          )}
                        </div>
                        <p className={`text-[11px] mt-0.5 truncate ${onDark ? 'text-white/70' : 'text-gray-400'}`}>
                          {isConnected
                            ? (active ? 'Active — trades & risk use this venue' : 'Connected. Set active to trade here.')
                            : 'Not connected. Click connect to add API keys.'}
                        </p>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:justify-end shrink-0">
                      {isConfirming ? (
                        <>
                          <Button size="sm" disabled={isBusy} onClick={() => handleDisconnect(ex.id)} className="h-8 px-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white border-transparent">
                            {isBusy ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Disconnecting…</> : 'Yes, disconnect'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmDisconnect(null)} className={`h-8 bg-transparent ${onDark ? 'border-white/50 text-white hover:bg-white/15 hover:text-white' : 'border-black/10 text-gray-700 hover:bg-black/5'}`}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          {!isConnected && (
                            <Button size="sm" onClick={() => setConnectDialog({ open: true, exchange: ex.id })} className="h-8 px-3 bg-[#e8590c] hover:bg-[#c54a08] text-white border-transparent">
                              <Link2 className="w-3.5 h-3.5 mr-1.5" /> Connect
                            </Button>
                          )}
                          {isConnected && !active && (
                            <Button size="sm" variant="outline" disabled={isBusy} onClick={() => handleSetActive(ex.id)} className={`h-8 bg-transparent ${onDark ? 'border-white/50 text-white hover:bg-white/15 hover:text-white' : 'border-green-600/50 text-green-700 hover:bg-green-50 hover:text-green-800'}`}>
                              <Star className="w-3.5 h-3.5 mr-1.5" /> Set Active
                            </Button>
                          )}
                          {isConnected && (
                            <Button size="sm" variant="outline" onClick={() => setConnectDialog({ open: true, exchange: ex.id })} className={`h-8 bg-transparent ${onDark ? 'border-white/50 text-white hover:bg-white/15 hover:text-white' : 'border-black/10 text-gray-700 hover:bg-black/5'}`}>
                              Re-enter Keys
                            </Button>
                          )}
                          {isConnected && (
                            <button
                              type="button"
                              onClick={() => setConfirmDisconnect(ex.id)}
                              title="Disconnect"
                              aria-label="Disconnect"
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors border ${onDark ? 'bg-white/10 hover:bg-white/20 border-white/20' : 'bg-black/[0.04] hover:bg-black/10 border-black/10'}`}
                            >
                              <Trash2 className={`w-3.5 h-3.5 ${onDark ? 'text-white' : 'text-gray-700'}`} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <ConnectExchangeDialog
        open={connectDialog.open}
        exchange={connectDialog.exchange}
        onOpenChange={(open) => setConnectDialog(s => ({ ...s, open }))}
        onConnected={async (ex) => {
          await refresh();
          // First connection becomes active automatically; for additional ones,
          // leave the current active alone so the user can opt-in via Set Active.
          if (!connections.length) {
            try { await connectionApi.setActiveExchange(ex); setActiveExchange(ex); } catch { /* ignore */ }
          }
        }}
      />
    </div>
  );
};

export default ExchangePage;
