import { AppCard } from "@/components/common";

interface Props {
  winPct: number; // 0..100
  wins: number;
  losses: number;
  total: number;
}

// Upper-half "dome" gauge, intentionally oversized so its sides/ends run off
// the card edges and get clipped by the rounded border (that's the design).
const cx = 140;
const cy = 262;
const R = 160;
const SW = 32;
// Full track arc — oversized so its ends run off the card and are cut by the border.
const START = 158;
const END = 382;
// Visible span (the dome cap inside the card). The win-rate fill + knob map onto
// this range so the knob is always on-screen, even at 0%.
const VSTART = 225;
const VEND = 315;
const SWEEP = VEND - VSTART;

const pointAt = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
};
const arcPath = (a0: number, a1: number) => {
  const p0 = pointAt(a0);
  const p1 = pointAt(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${R} ${R} 0 ${large} 1 ${p1.x} ${p1.y}`;
};

const WinRateGaugeCard = ({ winPct, wins, losses, total }: Props) => {
  const pct = Math.max(0, Math.min(1, (winPct || 0) / 100));
  const progEnd = VSTART + pct * SWEEP;
  const num = Math.round(winPct || 0);
  const slashX = num >= 100 ? 78 : num >= 10 ? 62 : 42;

  const subtitle = total > 0 ? `${wins}W / ${losses}L · ${total} trades` : "No closed trades yet";

  return (
    <AppCard variant="orange" className="relative w-full aspect-[14/11] sm:aspect-auto sm:h-[clamp(160px,26vh,230px)] lg:h-[clamp(150px,23vh,195px)] overflow-hidden">
      {/* Heading (HTML overlay so it matches the other cards' size) */}
      <div className="absolute top-4 left-2.5 z-10 text-sm font-medium text-white/90">Win Rate</div>

      {/* W/L subtitle (HTML overlay) — small caption, not a heading */}
      <div className="absolute bottom-3 left-0 right-0 z-10 text-center text-[8.5px] font-normal text-white/70 px-2 truncate">
        {subtitle}
      </div>

      <svg viewBox="0 0 280 220" width="100%" height="100%" className="block select-none">
        <defs>
          <linearGradient id="wr-green" x1="0" y1="0" x2="1" y2="0.5">
            <stop offset="0" stopColor="#15a349" />
            <stop offset="1" stopColor="#56e88a" />
          </linearGradient>
          <pattern id="wr-hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#000000" strokeOpacity="0.55" strokeWidth="3.5" />
          </pattern>
        </defs>

        {/* Number — heading is an HTML overlay above */}
        <text x={19} y={74} fontSize={38} fontWeight={400} fill="#ffffff" letterSpacing="-0.03em">
          {num}
        </text>
        <text x={slashX} y={74} fontSize={17} fontWeight={500} fill="#ffffff" fillOpacity={0.55}>
          /100
        </text>

        {/* Track (darkened orange) + hatch overlay */}
        <path d={arcPath(START, END)} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth={SW} strokeLinecap="round" />
        <path d={arcPath(START, END)} fill="none" stroke="url(#wr-hatch)" strokeWidth={SW} strokeLinecap="round" />

        {/* Green progress — fills the dome as the win rate rises (no knob) */}
        {pct > 0.004 && (
          <path d={arcPath(VSTART, progEnd)} fill="none" stroke="url(#wr-green)" strokeWidth={SW} strokeLinecap="round" />
        )}

      </svg>
    </AppCard>
  );
};

export default WinRateGaugeCard;
