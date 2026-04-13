import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link2, CheckCircle, XCircle, Loader2, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { connectionApi } from "@/lib/api";
import { toast } from "sonner";

type AccountType = "demo" | "live";

const ExchangePage = () => {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connectedAccountType, setConnectedAccountType] = useState<AccountType | null>(null);
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>("demo");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const status = await connectionApi.getStatus();
        setIsConnected(status?.connected === true);
        if (status?.data?.accountType) {
          setConnectedAccountType(status.data.accountType as AccountType);
        }
      } catch {
        setIsConnected(false);
      }
    };
    checkConnection();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    try {
      await connectionApi.connect(apiKey, secretKey, selectedAccountType);
      setIsConnected(true);
      setConnectedAccountType(selectedAccountType);
      setApiKey("");
      setSecretKey("");
      toast.success(`Bybit ${selectedAccountType === "demo" ? "Demo" : "Live"} account connected successfully`);
    } catch (err: any) {
      toast.error(err.message || "Failed to connect API");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await connectionApi.disconnect();
      setIsConnected(false);
      setConnectedAccountType(null);
      setConfirmDisconnect(false);
      toast.success("Bybit account disconnected");
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-bold">Exchange</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your Bybit account to enable live trading
        </p>
      </motion.div>

      {/* Status card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              {isConnected === null ? (
                <>
                  <Loader2 className="w-5 h-5 text-yellow-400 animate-spin shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Checking connection...</p>
                    <p className="text-xs text-muted-foreground">Verifying Bybit API credentials</p>
                  </div>
                </>
              ) : isConnected ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-400">Bybit Account Connected</p>
                    <p className="text-xs text-muted-foreground">
                      Your API credentials are active. You can now trade from the Trade page.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${connectedAccountType === "live" ? "bg-blue-500/15 text-blue-400 border-blue-500/20" : "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"} border text-xs`}>
                      {connectedAccountType === "live" ? "Live" : "Demo"}
                    </Badge>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Not Connected</p>
                    <p className="text-xs text-muted-foreground">
                      Enter your Bybit API credentials below to connect
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Connect form */}
      {isConnected === false && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                Connect Bybit Account
              </CardTitle>
              <CardDescription>
                Generate API keys from your Bybit account under API Management. Use read + trade permissions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConnect} className="space-y-4">
                {/* Account Type Selection */}
                <div className="space-y-2">
                  <Label className="text-sm">Account Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAccountType("demo")}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-all ${
                        selectedAccountType === "demo"
                          ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                          : "border-white/10 bg-background/10 text-muted-foreground hover:border-white/20"
                      }`}
                    >
                      <span className="font-semibold">Demo Account</span>
                      <span className="text-xs opacity-70">Paper trading, no real funds</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAccountType("live")}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-all ${
                        selectedAccountType === "live"
                          ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                          : "border-white/10 bg-background/10 text-muted-foreground hover:border-white/20"
                      }`}
                    >
                      <span className="font-semibold">Live Account</span>
                      <span className="text-xs opacity-70">Real trading with real funds</span>
                    </button>
                  </div>
                  {selectedAccountType === "live" && (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/15">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">Live trading uses real funds. Proceed with caution.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="apiKey" className="text-sm">API Key</Label>
                  <Input
                    id="apiKey"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your Bybit API key"
                    className="bg-background/20 border-white/10 font-mono text-sm"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secretKey" className="text-sm">Secret Key</Label>
                  <div className="relative">
                    <Input
                      id="secretKey"
                      type={showSecret ? "text" : "password"}
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder="Paste your Bybit secret key"
                      className="bg-background/20 border-white/10 font-mono text-sm pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/15">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Never share your API credentials. Marcvista stores them securely on the server and uses them only for your trades.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={connecting}
                  className="w-full button-gradient text-black font-semibold h-10"
                >
                  {connecting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
                  ) : (
                    <><Link2 className="w-4 h-4 mr-2" /> Connect {selectedAccountType === "demo" ? "Demo" : "Live"} Account</>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Disconnect section */}
      {isConnected === true && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
            <CardHeader>
              <CardTitle className="text-base">Manage Connection</CardTitle>
              <CardDescription>
                Disconnecting will remove your stored API credentials from the server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!confirmDisconnect ? (
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDisconnect(true)}
                  className="w-full sm:w-auto"
                >
                  Disconnect Bybit Account
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Are you sure? You will need to re-enter your API credentials to trade.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="flex-1 sm:flex-none"
                    >
                      {disconnecting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Disconnecting...</>
                      ) : "Yes, Disconnect"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDisconnect(false)}
                      className="flex-1 sm:flex-none border-white/10"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Instructions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <Card className="bg-[#1B1B1B]/40 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              How to get your Bybit API keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
              <li>Log in to your Bybit account at bybit.com</li>
              <li>Go to <strong className="text-foreground">Account &amp; Security → API Management</strong></li>
              <li>Click <strong className="text-foreground">Create New Key</strong> → System Generated</li>
              <li>Enable <strong className="text-foreground">Read</strong> and <strong className="text-foreground">Contract Trade</strong> permissions</li>
              <li>Copy the API Key and Secret Key and paste them above</li>
            </ol>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ExchangePage;
