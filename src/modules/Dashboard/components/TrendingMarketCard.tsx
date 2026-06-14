import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Star, TrendingUp, Search, X } from "lucide-react";

/**
 * Trending market card — live crypto market browser with tabs, horizontally
 * scrollable token tiles (logo, price, 24h change, 7d sparkline), a personal
 * wishlist (localStorage), and click-to-trade that opens the symbol's chart on
 * the Trading page (same behaviour as the dashboard's Live Market table).
 *
 * Data source: CoinGecko public API (logos / names / prices / 7d sparklines).
 * Trade symbol is mapped to the exchange's <SYMBOL>USDT perpetual.
 */

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  sparkline: number[];
  total_volume?: number;
  market_cap?: number;
  market_cap_rank?: number;
}

const TABS = ["Watchlist", "Trending", "Top Gainers", "Top Losers", "New Tokens", "Stablecoins"] as const;
type Tab = (typeof TABS)[number];

const WISHLIST_KEY = "marcvista:wishlist";

const STABLE = new Set([
  "usdt", "usdc", "dai", "fdusd", "tusd", "usdd", "usde", "pyusd", "usdp",
  "gusd", "eurc", "usds", "susd", "frax", "lusd", "crvusd", "usd1", "usdx",
]);

const MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=24h";
const TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending";

const toCoin = (c: any): Coin => ({
  id: c.id,
  symbol: String(c.symbol || "").toLowerCase(),
  name: c.name,
  image: c.image,
  current_price: c.current_price ?? 0,
  price_change_percentage_24h:
    c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
  sparkline: Array.isArray(c.sparkline_in_7d?.price) ? c.sparkline_in_7d.price : [],
  total_volume: c.total_volume ?? 0,
  market_cap: c.market_cap ?? 0,
  market_cap_rank: c.market_cap_rank ?? 9999,
});

const fmtPrice = (v: number) => {
  if (!isFinite(v)) return "—";
  if (v >= 1000) return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(4);
  if (v > 0) return "$" + v.toPrecision(2);
  return "$0";
};

const Sparkline = ({ data, up }: { data: number[]; up: boolean }) => {
  if (!data || data.length < 2) return <div className="w-full h-full" />;
  const w = 120;
  const h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data
    .map((p, i) => `${(i / (data.length - 1)) * w},${h - ((p - min) / rng) * h}`)
    .join(" ");
  const color = up ? "#22c55e" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
};

const TrendingMarketCard = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Trending");
  const [query, setQuery] = useState("");
  const [markets, setMarkets] = useState<Coin[]>([]);
  const [trending, setTrending] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishlist, setWishlist] = useState<Coin[]>(() => {
    try {
      const raw = localStorage.getItem(WISHLIST_KEY);
      return raw ? (JSON.parse(raw) as Coin[]) : [];
    } catch {
      return [];
    }
  });
  const scrollerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [mRes, tRes] = await Promise.allSettled([fetch(MARKETS_URL), fetch(TRENDING_URL)]);

      let base: Coin[] = [];
      if (mRes.status === "fulfilled" && mRes.value.ok) {
        const arr = await mRes.value.json();
        if (Array.isArray(arr)) base = arr.map(toCoin);
        setMarkets(base);
      }

      if (tRes.status === "fulfilled" && tRes.value.ok) {
        const tj = await tRes.value.json();
        const map = new Map(base.map((c) => [c.id, c]));
        const trend: Coin[] = (tj.coins || []).map((w: any) => {
          const it = w.item || {};
          const b = map.get(it.id);
          return {
            id: it.id,
            symbol: String(it.symbol || "").toLowerCase(),
            name: it.name,
            image: it.small || it.thumb || b?.image || "",
            current_price: b?.current_price ?? it.data?.price ?? 0,
            price_change_percentage_24h:
              b?.price_change_percentage_24h ?? it.data?.price_change_percentage_24h?.usd ?? 0,
            sparkline: b?.sparkline ?? [],
          };
        });
        setTrending(trend);
      }
    } catch (err) {
      console.error("Trending market fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchData();
    }, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Persist wishlist
  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    } catch {
      /* ignore */
    }
  }, [wishlist]);

  const isWished = useCallback((id: string) => wishlist.some((w) => w.id === id), [wishlist]);

  const toggleWishlist = useCallback((coin: Coin) => {
    setWishlist((prev) =>
      prev.some((w) => w.id === coin.id)
        ? prev.filter((w) => w.id !== coin.id)
        : [...prev, { id: coin.id, symbol: coin.symbol, name: coin.name, image: coin.image, current_price: coin.current_price, price_change_percentage_24h: coin.price_change_percentage_24h, sparkline: coin.sparkline }]
    );
  }, []);

  const goTrade = useCallback(
    (coin: Coin) => navigate(`/trading?symbol=${coin.symbol.toUpperCase()}USDT`),
    [navigate]
  );

  const list = useMemo<Coin[]>(() => {
    const byId = new Map(markets.map((c) => [c.id, c]));
    switch (tab) {
      case "Watchlist": {
        const q = query.trim().toLowerCase();
        // Searching → show matching coins (from the live market list) so the
        // user can star any symbol to add it to their watchlist.
        if (q) {
          return markets
            .filter((c) => c.symbol.includes(q) || c.name.toLowerCase().includes(q))
            .slice(0, 30);
        }
        // Otherwise → the saved watchlist, refreshed with live data.
        return wishlist.map((w) => byId.get(w.id) ?? w);
      }
      case "Trending":
        return trending;
      case "Top Gainers":
        return [...markets]
          .filter((c) => c.current_price > 0)
          .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
          .slice(0, 20);
      case "Top Losers":
        return [...markets]
          .filter((c) => c.current_price > 0)
          .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
          .slice(0, 20);
      case "New Tokens":
        // Free CoinGecko has no "newly listed" feed — proxy with the highest
        // 24h turnover (volume ÷ market cap) among non-mega-caps (emerging).
        return [...markets]
          .filter((c) => (c.market_cap_rank ?? 9999) > 15 && (c.market_cap ?? 0) > 0)
          .sort(
            (a, b) =>
              (b.total_volume ?? 0) / (b.market_cap || 1) - (a.total_volume ?? 0) / (a.market_cap || 1)
          )
          .slice(0, 20);
      case "Stablecoins":
        return markets.filter((c) => STABLE.has(c.symbol)).slice(0, 20);
      default:
        return [];
    }
  }, [tab, markets, trending, wishlist, query]);

  return (
    <div className="flex flex-col h-[240px] lg:h-[190px] rounded-2xl bg-[#0a0a0a] border border-white/10 p-4">
      {/* Tabs (underlined, like the reference) */}
      <div className="flex items-center gap-4 overflow-x-auto overflow-y-hidden scrollbar-thin border-b border-white/10 shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t !== "Watchlist") setQuery("");
            }}
            className={`shrink-0 -mb-px pb-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1 ${
              tab === t
                ? "border-[#e8590c] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "Watchlist" && <Star className="w-3.5 h-3.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* Search (Watchlist tab) — find any symbol and star it to add */}
      {tab === "Watchlist" && (
        <div className="relative mt-2 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a symbol to add (e.g. SOL, Solana)…"
            className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-[#e8590c]/50"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Tiles — flex-1 fills the constant-height card; sparkline stretches. */}
      {loading && markets.length === 0 ? (
        <div className="flex gap-3 overflow-hidden flex-1 min-h-0 mt-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 w-44 h-full rounded-xl bg-white/[0.03] border border-white/10 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
          {tab === "Watchlist" ? (
            query.trim() ? (
              <>
                <Search className="w-6 h-6 opacity-40" />
                <p className="text-sm">No symbols match “{query}”.</p>
              </>
            ) : (
              <>
                <Star className="w-6 h-6 opacity-40" />
                <p className="text-sm">Your watchlist is empty.</p>
                <p className="text-xs">Search above and tap the ☆ to add a symbol.</p>
              </>
            )
          ) : (
            <>
              <TrendingUp className="w-6 h-6 opacity-40" />
              <p className="text-sm">No data available.</p>
            </>
          )}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="flex gap-3 overflow-x-auto overflow-y-hidden scrollbar-thin flex-1 min-h-0 mt-2 pb-1 snap-x"
        >
          {list.map((coin) => {
            const up = (coin.price_change_percentage_24h ?? 0) >= 0;
            const wished = isWished(coin.id);
            return (
              <div
                key={coin.id}
                onClick={() => goTrade(coin)}
                className="group shrink-0 w-44 h-full snap-start cursor-pointer rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-[#e8590c]/40 p-3 flex flex-col transition-colors"
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {coin.image ? (
                      <img src={coin.image} alt="" className="w-7 h-7 rounded-full shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-medium shrink-0">
                        {coin.symbol.toUpperCase().slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase truncate">{coin.symbol}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{coin.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWishlist(coin);
                    }}
                    title={wished ? "Remove from watchlist" : "Add to watchlist"}
                    className="shrink-0 p-1 -mr-1 -mt-1 rounded hover:bg-white/10 transition-colors"
                  >
                    <Star
                      className={`w-4 h-4 transition-colors ${
                        wished ? "fill-[#facc15] text-[#facc15]" : "text-gray-500 group-hover:text-gray-300"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-medium tracking-tight">{fmtPrice(coin.current_price)}</span>
                  <span className={`text-xs font-medium ${up ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                    {up ? "▲" : "▼"} {Math.abs(coin.price_change_percentage_24h ?? 0).toFixed(2)}%
                  </span>
                </div>

                <div className="flex-1 min-h-0 mt-1.5">
                  <Sparkline data={coin.sparkline} up={up} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrendingMarketCard;
