import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link2, CheckCircle, XCircle, Loader2, AlertTriangle, Star, StarOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    <div className="max-w-3xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-2xl font-bold">Exchanges</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect one or more exchanges. Each keeps its own credentials, balance, and adjusted risk.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Card className="bg-[#1B1B1B]/40 border-white/5">
          <CardContent className="pt-5 pb-5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Generate API keys on each exchange with <strong>read</strong> + <strong>futures/contract trade</strong> permission only.
              Never enable <strong>withdraw</strong>. Use <strong>Demo</strong> mode for testnet keys.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading exchanges…
        </div>
      ) : (
        <div className="space-y-3">
          {exchanges.map((ex) => {
            const conn = connByEx(ex.id);
            const isConnected = !!conn;
            const isActive = activeExchange === ex.id;
            const isBusy = busyId === ex.id;
            const isConfirming = confirmDisconnect === ex.id;

            return (
              <motion.div key={ex.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isConnected ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400/70" />}
                        <CardTitle className="text-base">{ex.label}</CardTitle>
                        {isConnected && (
                          <Badge className={`${conn?.mode === 'real' ? 'bg-blue-500/15 text-blue-400 border-blue-500/20' : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'} border text-[10px]`}>
                            {conn?.mode === 'real' ? 'Live' : 'Demo'}
                          </Badge>
                        )}
                        {isActive && (
                          <Badge className="bg-primary/15 text-primary border-primary/30 border text-[10px] flex items-center gap-1">
                            <Star className="w-3 h-3" /> Active
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription className="text-xs">
                      {isConnected
                        ? `Credentials stored. ${isActive ? 'Trades and risk profile use this venue.' : 'Set as active to trade from this exchange.'}`
                        : 'Not connected. Click Connect to paste API keys.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {isConfirming ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Disconnect {ex.label}? Stored credentials will be removed. Trade history stays.
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={isBusy} onClick={() => handleDisconnect(ex.id)}>
                            {isBusy ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Disconnecting…</> : 'Yes, disconnect'}
                          </Button>
                          <Button size="sm" variant="outline" className="border-white/10" onClick={() => setConfirmDisconnect(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {!isConnected && (
                          <Button size="sm" className="button-gradient text-black font-semibold" onClick={() => setConnectDialog({ open: true, exchange: ex.id })}>
                            <Link2 className="w-3.5 h-3.5 mr-1.5" /> Connect
                          </Button>
                        )}
                        {isConnected && !isActive && (
                          <Button size="sm" variant="outline" className="border-white/10" disabled={isBusy} onClick={() => handleSetActive(ex.id)}>
                            <Star className="w-3.5 h-3.5 mr-1.5" /> Set Active
                          </Button>
                        )}
                        {isConnected && (
                          <Button size="sm" variant="outline" className="border-white/10" onClick={() => setConnectDialog({ open: true, exchange: ex.id })}>
                            Re-enter Keys
                          </Button>
                        )}
                        {isConnected && (
                          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/5" onClick={() => setConfirmDisconnect(ex.id)}>
                            <StarOff className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

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
