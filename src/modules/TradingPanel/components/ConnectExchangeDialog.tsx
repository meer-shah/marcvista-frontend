import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { connectionApi } from '@/lib/api';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  exchange: string | null;
  onOpenChange: (open: boolean) => void;
  onConnected?: (exchange: string) => void;
}

const EXCHANGES_WITH_PASSPHRASE = new Set(['okx', 'bitget']);

const ConnectExchangeDialog: React.FC<Props> = ({ open, exchange, onOpenChange, onConnected }) => {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [mode, setMode] = useState<'demo' | 'real'>('demo');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setApiKey(''); setSecretKey(''); setPassphrase(''); setMode('demo');
    }
  }, [open, exchange]);

  if (!exchange) return null;
  const needsPassphrase = EXCHANGES_WITH_PASSPHRASE.has(exchange);
  const labelMap: Record<string, string> = {
    bybit: 'Bybit', binance: 'Binance USDT-M Futures', okx: 'OKX Perpetual Swap',
    bitget: 'Bitget USDT-M Futures', mexc: 'MEXC Contract',
  };

  const submit = async () => {
    if (!apiKey.trim() || !secretKey.trim()) {
      toast.error('API Key and Secret are required.'); return;
    }
    if (needsPassphrase && !passphrase.trim()) {
      toast.error(`${labelMap[exchange]} requires a passphrase.`); return;
    }
    setBusy(true);
    try {
      const r = await connectionApi.connectExchange(exchange, {
        apiKey: apiKey.trim(),
        secretKey: secretKey.trim(),
        passphrase: needsPassphrase ? passphrase.trim() : undefined,
        mode,
      });
      toast.success(`${labelMap[exchange]} connected. Balance: $${(r?.balance ?? 0).toFixed(2)}`);
      onConnected?.(exchange);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Connection failed', { duration: 8000 });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {labelMap[exchange] || exchange}</DialogTitle>
          <DialogDescription>
            Paste API credentials generated on {labelMap[exchange] || exchange}.{' '}
            <strong>Never enable Withdraw permission</strong> on a key you give Marcvista.
            Pick Demo for testnet/paper, Real for live trading.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Mode</Label>
            <div className="flex gap-2">
              <Button size="sm" variant={mode === 'demo' ? 'default' : 'outline'} onClick={() => setMode('demo')} className="flex-1 h-8 text-xs">Demo</Button>
              <Button size="sm" variant={mode === 'real' ? 'default' : 'outline'} onClick={() => setMode('real')} className="flex-1 h-8 text-xs">Real</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">API Key</Label>
            <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="paste your API key" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Secret Key</Label>
            <Input type="password" value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder="paste your secret" autoComplete="off" />
          </div>
          {needsPassphrase && (
            <div className="space-y-1.5">
              <Label className="text-xs">Passphrase</Label>
              <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="the passphrase you set on the exchange" autoComplete="off" />
              <p className="text-[10px] text-muted-foreground">
                {labelMap[exchange]} requires the same passphrase you set when generating the key.
              </p>
            </div>
          )}
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? 'Verifying…' : 'Connect & Verify'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectExchangeDialog;
