import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { symbolsApi } from "@/lib/api";
import { toast } from "sonner";

interface SymbolSelectorProps {
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

const SymbolSelector = ({ selectedSymbol, onSymbolChange }: SymbolSelectorProps) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [filteredSymbols, setFilteredSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef<number>(0);

  // Fetch symbols from backend.
  // `silent` skips the loading spinner for background refreshes (e.g. re-fetch
  // on dropdown open) so the UI doesn't flicker.
  const fetchSymbols = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true);
      const symbols = await symbolsApi.getAll();
      setAllSymbols(symbols);
      setFilteredSymbols(prev =>
        prev.length === 0
          ? symbols
          : symbols.filter(s => s.toLowerCase().includes(search.toLowerCase()))
      );
      lastFetchRef.current = Date.now();
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Failed to load symbols');
      console.error('Error fetching symbols:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchSymbols();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic background refresh (every 5 min) so newly listed symbols
  // appear without requiring a page reload.
  useEffect(() => {
    const id = window.setInterval(() => {
      fetchSymbols({ silent: true });
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exchange switch → symbol list belongs to the active exchange. Re-fetch
  // so the dropdown reflects what's actually tradable on the new venue.
  useEffect(() => {
    const onTradeUpdated = () => { fetchSymbols({ silent: true }); };
    window.addEventListener('marcvista:trade-updated', onTradeUpdated);
    return () => window.removeEventListener('marcvista:trade-updated', onTradeUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch on dropdown open if last fetch was > 30 s ago — gives the user
  // a fresh list when they're actively looking for a symbol.
  useEffect(() => {
    if (!isOpen) return;
    const ageMs = Date.now() - lastFetchRef.current;
    if (ageMs > 30 * 1000) fetchSymbols({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Filter symbols based on search
  useEffect(() => {
    if (allSymbols.length === 0) return;
    const filtered = allSymbols.filter((symbol) =>
      symbol.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredSymbols(filtered);
  }, [search, allSymbols]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (symbol: string) => {
    onSymbolChange(symbol);
    setSearch(symbol);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center gap-2">
        <Input
          ref={inputRef}
          type="text"
          placeholder={loading ? "Loading symbols..." : selectedSymbol}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="bg-background/50 pr-9"
          disabled={loading}
        />
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>

      {isOpen && !loading && (
        <div className="absolute z-50 w-full mt-2 bg-[#1c1c1c] border border-white/10 rounded-lg shadow-lg max-h-[50vh] overflow-y-auto">
          {filteredSymbols.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No symbols found matching &quot;{search}&quot;
            </div>
          ) : (
            <div className="p-2">
              {filteredSymbols.slice(0, 50).map((symbol) => (
                <div
                  key={symbol}
                  className={`px-3 py-2 rounded-md cursor-pointer hover:bg-white/10 transition-colors ${
                    selectedSymbol === symbol ? 'bg-[#e8590c]/20 text-[#e8590c]' : ''
                  }`}
                  onClick={() => handleSelect(symbol)}
                >
                  <div className="flex items-center justify-between">
                    <span className="tabular-nums text-sm">{symbol}</span>
                    {selectedSymbol === symbol && (
                      <Badge variant="secondary" className="text-xs">Selected</Badge>
                    )}
                  </div>
                </div>
              ))}
              {filteredSymbols.length > 50 && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t border-white/10 mt-2">
                  Showing first 50 of {filteredSymbols.length} results
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SymbolSelector;
