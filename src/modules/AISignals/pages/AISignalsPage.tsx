import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, TrendingUp, TrendingDown, Clock, Target, AlertTriangle, CheckCircle } from "lucide-react";
import { StatCard } from "@/components/common";
const AISignalsPage = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [selectedAsset, setSelectedAsset] = useState('all');

  const activeSignals = [
    {
      id: 1,
      symbol: 'BTC/USDT',
      direction: 'LONG',
      confidence: 87,
      entryPrice: 50250,
      currentPrice: 50680,
      targetPrice: 52000,
      stopLoss: 48500,
      pnl: '+0.86%',
      timeframe: '4h',
      generatedAt: '2025-07-05 14:30',
      status: 'active',
      aiReason: 'Strong bullish divergence detected with RSI oversold bounce and volume confirmation'
    },
    {
      id: 2,
      symbol: 'ETH/USDT',
      direction: 'SHORT',
      confidence: 79,
      entryPrice: 1825,
      currentPrice: 1798,
      targetPrice: 1750,
      stopLoss: 1860,
      pnl: '+1.48%',
      timeframe: '1h',
      generatedAt: '2025-07-05 13:45',
      status: 'active',
      aiReason: 'Bearish engulfing pattern with high volume, resistance level rejection confirmed'
    },
    {
      id: 3,
      symbol: 'BNB/USDT',
      direction: 'LONG',
      confidence: 92,
      entryPrice: 285,
      currentPrice: 289,
      targetPrice: 300,
      stopLoss: 275,
      pnl: '+1.40%',
      timeframe: '2h',
      generatedAt: '2025-07-05 12:15',
      status: 'active',
      aiReason: 'Breakout above key resistance with strong momentum and institutional accumulation signals'
    }
  ];

  const completedSignals = [
    {
      id: 4,
      symbol: 'UADA/USDT',
      direction: 'LONG',
      confidence: 85,
      entryPrice: 0.45,
      exitPrice: 0.47,
      targetPrice: 0.47,
      stopLoss: 0.42,
      pnl: '+4.44%',
      timeframe: '4h',
      generatedAt: '2025-07-04 16:20',
      closedAt: '2025-07-05 08:30',
      status: 'completed',
      outcome: 'target_hit',
      aiReason: 'Support bounce with bullish momentum confirmation'
    },
    {
      id: 5,
      symbol: 'SOL/USDT',
      direction: 'SHORT',
      confidence: 78,
      entryPrice: 95,
      exitPrice: 92,
      targetPrice: 90,
      stopLoss: 98,
      pnl: '+3.16%',
      timeframe: '1h',
      generatedAt: '2025-07-04 14:10',
      closedAt: '2025-07-04 18:45',
      status: 'completed',
      outcome: 'partial_profit',
      aiReason: 'Overbought conditions with bearish divergence signals'
    }
  ];

  const pendingSignals = [
    {
      id: 6,
      symbol: 'DOGE/USDT',
      direction: 'LONG',
      confidence: 73,
      triggerPrice: 0.058,
      currentPrice: 0.056,
      targetPrice: 0.062,
      stopLoss: 0.054,
      timeframe: '2h',
      generatedAt: '2025-07-05 15:00',
      status: 'pending',
      aiReason: 'Potential breakout setup forming, waiting for volume confirmation'
    },
    {
      id: 7,
      symbol: 'LINK/USDT',
      direction: 'SHORT',
      confidence: 81,
      triggerPrice: 12.5,
      currentPrice: 12.8,
      targetPrice: 11.8,
      stopLoss: 13.2,
      timeframe: '4h',
      generatedAt: '2025-07-05 14:45',
      status: 'pending',
      aiReason: 'Double top pattern formation with declining volume'
    }
  ];

  const aiMetrics = {
    totalSignals: 156,
    successRate: 68.2,
    avgProfit: 2.34,
    activeSignals: activeSignals.length,
    weeklyPerformance: '+12.4%'
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'LONG' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />;
  };

  const getDirectionColor = (direction: string) => {
    return direction === 'LONG' ? 'text-green-500' : 'text-red-500';
  };

  const getStatusBadge = (status: string, outcome?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Active</Badge>;
      case 'completed':
        return outcome === 'target_hit' ? 
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Target Hit</Badge> :
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Partial Profit</Badge>;
      case 'pending':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Pending</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
      {/* Header with AI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <StatCard centered label="Total Signals" value={aiMetrics.totalSignals} />
        </Card>
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <StatCard centered label="Success Rate" value={`${aiMetrics.successRate}%`} valueColor="text-green-500" />
        </Card>
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <StatCard centered label="Avg Profit" value={`${aiMetrics.avgProfit}%`} valueColor="text-blue-500" />
        </Card>
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <StatCard centered label="Active Now" value={aiMetrics.activeSignals} />
        </Card>
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 col-span-2 sm:col-span-3 lg:col-span-1">
          <StatCard centered label="Weekly P&L" value={aiMetrics.weeklyPerformance} valueColor="text-green-500" />
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">AI Trading Signals</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timeframe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">15 Minutes</SelectItem>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="4h">4 Hours</SelectItem>
                  <SelectItem value="1d">1 Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assets</SelectItem>
                  <SelectItem value="btc">Bitcoin</SelectItem>
                  <SelectItem value="eth">Ethereum</SelectItem>
                  <SelectItem value="bnb">Binance Coin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signals Tabs */}
      <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
        <CardContent className="p-0">
          <Tabs defaultValue="active" className="w-full">
            <div className="px-6 pt-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="active">Active Signals</TabsTrigger>
                <TabsTrigger value="pending">Pending Signals</TabsTrigger>
                <TabsTrigger value="completed">Completed Signals</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="active" className="px-6 pb-6 space-y-4">
              {activeSignals.map((signal) => (
                <div key={signal.id} className="p-4 rounded-lg bg-background/20 border border-white/10">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between space-y-3 lg:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <div className={`flex items-center space-x-1 ${getDirectionColor(signal.direction)}`}>
                          {getDirectionIcon(signal.direction)}
                          <span className="font-semibold">{signal.symbol}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">{signal.direction}</Badge>
                      </div>
                      <div className="text-sm">
                        <div className="text-muted-foreground">Confidence</div>
                        <div className="font-semibold">{signal.confidence}%</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Entry Price</div>
                        <div className="font-semibold">${signal.entryPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Current Price</div>
                        <div className="font-semibold">${signal.currentPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Target</div>
                        <div className="font-semibold">${signal.targetPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">P&L</div>
                        <div className="font-semibold text-green-500">{signal.pnl}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(signal.status)}
                      <Button size="sm" variant="outline">Copy Trade</Button>
                    </div>
                  </div>
                  
                  <div className="mt-3 p-3 bg-background/10 rounded text-sm">
                    <div className="text-muted-foreground mb-1">AI Analysis:</div>
                    <div>{signal.aiReason}</div>
                  </div>
                </div>
              ))}
            </TabsContent>
            
            <TabsContent value="pending" className="px-6 pb-6 space-y-4">
              {pendingSignals.map((signal) => (
                <div key={signal.id} className="p-4 rounded-lg bg-background/20 border border-white/10">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between space-y-3 lg:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <div className={`flex items-center space-x-1 ${getDirectionColor(signal.direction)}`}>
                          {getDirectionIcon(signal.direction)}
                          <span className="font-semibold">{signal.symbol}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">{signal.direction}</Badge>
                      </div>
                      <div className="text-sm">
                        <div className="text-muted-foreground">Confidence</div>
                        <div className="font-semibold">{signal.confidence}%</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Trigger Price</div>
                        <div className="font-semibold">${signal.triggerPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Current Price</div>
                        <div className="font-semibold">${signal.currentPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Target</div>
                        <div className="font-semibold">${signal.targetPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Stop Loss</div>
                        <div className="font-semibold text-red-500">${signal.stopLoss}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(signal.status)}
                      <Button size="sm" variant="outline">Set Alert</Button>
                    </div>
                  </div>
                  
                  <div className="mt-3 p-3 bg-background/10 rounded text-sm">
                    <div className="text-muted-foreground mb-1">AI Analysis:</div>
                    <div>{signal.aiReason}</div>
                  </div>
                </div>
              ))}
            </TabsContent>
            
            <TabsContent value="completed" className="px-6 pb-6 space-y-4">
              {completedSignals.map((signal) => (
                <div key={signal.id} className="p-4 rounded-lg bg-background/20 border border-white/10">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between space-y-3 lg:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <div className={`flex items-center space-x-1 ${getDirectionColor(signal.direction)}`}>
                          {getDirectionIcon(signal.direction)}
                          <span className="font-semibold">{signal.symbol}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">{signal.direction}</Badge>
                      </div>
                      <div className="text-sm">
                        <div className="text-muted-foreground">Confidence</div>
                        <div className="font-semibold">{signal.confidence}%</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Entry Price</div>
                        <div className="font-semibold">${signal.entryPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Exit Price</div>
                        <div className="font-semibold">${signal.exitPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Target</div>
                        <div className="font-semibold">${signal.targetPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">P&L</div>
                        <div className="font-semibold text-green-500">{signal.pnl}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(signal.status, signal.outcome)}
                      <div className="text-xs text-muted-foreground">
                        Closed: {signal.closedAt}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 p-3 bg-background/10 rounded text-sm">
                    <div className="text-muted-foreground mb-1">AI Analysis:</div>
                    <div>{signal.aiReason}</div>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
        </div>
    </div>
  );
};

export default AISignalsPage; 