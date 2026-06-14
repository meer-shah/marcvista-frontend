import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { connectionApi } from "@/lib/api";

type ExchangeBalance = {
  exchange: string;
  mode: string;
  balance: number;
  ok: boolean;
  error?: string;
};

// Per-exchange display metadata. Bybit/MEXC map to the reference orange+purple;
// unknown exchanges fall back to a rotating palette so every block stays distinct.
const EXCHANGE_META: Record<string, { label: string; color: string }> = {
  bybit: { label: "Bybit", color: "#F4671F" },
  mexc: { label: "MEXC", color: "#8B5CF6" },
  binance: { label: "Binance", color: "#F0B90B" },
  okx: { label: "OKX", color: "#3B82F6" },
  bitget: { label: "Bitget", color: "#00C2C7" },
  bingx: { label: "BingX", color: "#2DD4BF" },
};
const FALLBACK_COLORS = ["#FB923C", "#A78BFA", "#34D399", "#60A5FA", "#F472B6", "#FACC15"];

const metaFor = (exchange: string, idx: number) =>
  EXCHANGE_META[exchange] ?? {
    label: exchange.charAt(0).toUpperCase() + exchange.slice(1),
    color: FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
  };

const fmtMoney = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${v.toFixed(a >= 100 || a === 0 ? 0 : 2)}`;
};

// ── Hex shade helpers (lighten/darken for gradients + 3D faces) ──
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const shade = (hex: string, amt: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (c: number) => clamp(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

// Cube geometry (viewBox 92 x 96). Bottom of every cube sits on the same
// baseline so heights are visually comparable; `frac` (0..1) sets how tall.
const VB_W = 92;
const VB_H = 96;
const BASE_Y = 88; // front-face bottom
const H_MIN = 26;
const H_MAX = 70;
const FX = 10; // front left
const FW = 52; // front width
const DX = 16; // iso depth x
const DY = 12; // iso depth y

/** A hatched isometric cube whose height encodes the exchange balance. */
const CubeBlock = ({
  color,
  id,
  frac,
  overlap,
  size,
}: {
  color: string;
  id: string;
  frac: number;
  overlap: boolean;
  size: number;
}) => {
  const h = H_MIN + Math.max(0, Math.min(1, frac)) * (H_MAX - H_MIN);
  const topY = BASE_Y - h; // front-face top
  const bTopY = topY - DY; // back-face top
  const bBotY = BASE_Y - DY; // back-face bottom

  const top = shade(color, 0.32);
  const side = shade(color, -0.16);
  const front = shade(color, 0.06);
  const fid = `bd-cf-${id}`;
  const hid = `bd-ch-${id}`;
  const sid = `bd-cs-${id}`;
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={size}
      height={Math.round((size * VB_H) / VB_W)}
      className="block shrink-0"
      style={{ marginLeft: overlap ? `${-Math.round(size * 0.19)}px` : 0 }}
    >
      <defs>
        <linearGradient id={fid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(front, 0.1)} />
          <stop offset="1" stopColor={shade(front, -0.08)} />
        </linearGradient>
        <pattern id={hid} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="3" />
        </pattern>
        <filter id={sid} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#1f1147" floodOpacity="0.16" />
        </filter>
      </defs>
      {/* right (side) face */}
      <path
        d={`M${FX + FW} ${topY} L${FX + FW + DX} ${bTopY} L${FX + FW + DX} ${bBotY} L${FX + FW} ${BASE_Y} Z`}
        fill={side}
        filter={`url(#${sid})`}
      />
      {/* top face */}
      <path
        d={`M${FX} ${topY} L${FX + DX} ${bTopY} L${FX + FW + DX} ${bTopY} L${FX + FW} ${topY} Z`}
        fill={top}
      />
      {/* front face + hatch (less-rounded corners) */}
      <rect x={FX} y={topY} width={FW} height={h} rx={6} fill={`url(#${fid})`} />
      <rect x={FX} y={topY} width={FW} height={h} rx={6} fill={`url(#${hid})`} />
    </svg>
  );
};

const BalanceDistributionCard = () => {
  const navigate = useNavigate();
  const [total, setTotal] = useState<number | null>(null);
  const [balances, setBalances] = useState<ExchangeBalance[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await connectionApi.getAllBalances();
        if (!alive) return;
        setTotal(res?.total ?? 0);
        setBalances(Array.isArray(res?.balances) ? res.balances : []);
      } catch {
        if (alive) {
          setTotal(0);
          setBalances([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // One entry per exchange (sum demo + real if the same exchange appears twice).
  const exchanges = useMemo(() => {
    const order: string[] = [];
    const agg: Record<string, { balance: number; ok: boolean }> = {};
    balances.forEach((b) => {
      if (!agg[b.exchange]) {
        agg[b.exchange] = { balance: 0, ok: false };
        order.push(b.exchange);
      }
      if (b.ok) {
        agg[b.exchange].balance += b.balance;
        agg[b.exchange].ok = true;
      }
    });
    return order.map((ex, i) => {
      const meta = metaFor(ex, i);
      return { id: ex, exchange: ex, label: meta.label, color: meta.color, ...agg[ex] };
    });
  }, [balances]);

  // Tallest cube = exchange with the most money; others scale proportionally.
  const maxBal = useMemo(
    () => Math.max(0, ...exchanges.map((e) => (e.ok ? e.balance : 0))),
    [exchanges]
  );

  // Shrink cubes as more exchanges are added so they always fit beside the
  // total in this narrow column without overlapping the number.
  const cubeSize = exchanges.length <= 2 ? 44 : exchanges.length === 3 ? 38 : exchanges.length === 4 ? 32 : 28;

  return (
    <div className="relative w-full lg:h-[150px] flex flex-col rounded-2xl bg-white border border-black/5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-medium text-gray-900">Balance Distribution</h3>
        <button onClick={() => navigate("/exchange")} aria-label="Manage exchanges">
          <MoreHorizontal className="w-5 h-5 text-gray-400 hover:text-gray-600 transition-colors" />
        </button>
      </div>

      {/* Legend — connected exchange names */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1.5 min-h-[16px]">
        {exchanges.length === 0 ? (
          <span className="text-[12px] text-gray-400">No exchanges connected</span>
        ) : (
          exchanges.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
              <span className="text-[12px] text-gray-500">{e.label}</span>
            </span>
          ))
        )}
      </div>

      {/* Total + per-exchange cubes beside it (height ∝ that exchange's balance) */}
      <div className="flex items-end justify-between mt-3 lg:mt-auto gap-1">
        <div className="shrink-0">
          <p className="text-lg sm:text-[22px] leading-none font-medium text-gray-900 tracking-tight">
            {total === null ? "—" : fmtMoney(total)}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Total wallet balance</p>
        </div>
        <div className="flex items-end justify-end min-w-0">
          {exchanges.length === 0 ? (
            <button
              onClick={() => navigate("/exchange")}
              className="text-[12px] font-medium text-primary hover:underline"
            >
              Connect →
            </button>
          ) : (
            exchanges.map((e, i) => (
              <CubeBlock
                key={e.id}
                id={e.id}
                color={e.color}
                frac={maxBal > 0 ? (e.ok ? e.balance / maxBal : 0) : 0.6}
                overlap={i > 0}
                size={cubeSize}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default BalanceDistributionCard;
