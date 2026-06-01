import { ArrowUpRight } from "lucide-react";

export interface GoalRing {
  label: string;   // Yearly / Quarterly / Monthly / Weekly / Daily
  current: number;
  target: number;
  pct: number;     // 0..1
  color: string;
}

interface MainGoal {
  label: string;   // the goal the user actually set (largest period)
  target: number;
  current: number;
  pct: number;     // 0..1 (from backend)
}

interface Props {
  rings: GoalRing[];
  mainGoal?: MainGoal | null;
}

const fmtMoney = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(v)}`;
};

const GoalsRingCard = ({ rings, mainGoal }: Props) => {
  const hasAny = rings.some((r) => r.target > 0);
  const activeRings = hasAny ? rings.filter((r) => r.target > 0) : rings;
  const N = Math.max(1, activeRings.length);

  // viewBox + gauge geometry
  const VBW = 320;
  const VBH = 280;
  const cx = 206;
  const cy = 130;
  const R_max = 92;
  const R_step = 14;
  const SW = 10;
  // Speedometer sweep. ROT rotates the whole gauge clockwise (degrees).
  const ROT = 40;
  const startAngle = 140 + ROT;
  const endAngle = 400 + ROT; // 260° sweep
  const sweep = endAngle - startAngle;

  const pointAt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const arcPath = (r: number, a0: number, a1: number) => {
    const p0 = pointAt(r, a0);
    const p1 = pointAt(r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
  };

  const geo = activeRings.map((r, i) => {
    const rad = R_max - i * R_step;
    const pct = Math.max(0, Math.min(1, r.pct));
    return {
      r,
      rad,
      pct,
      tip: pointAt(rad, endAngle), // other end — where the label connects
      isInner: i === N - 1,
      trackPath: arcPath(rad, startAngle, endAngle),
      progressPath: arcPath(rad, startAngle, startAngle + pct * sweep),
      hasProgress: pct > 0,
    };
  });

  const num = mainGoal ? Math.round(mainGoal.pct * 100) : 0;

  return (
    <div className="relative w-full aspect-[8/7] rounded-[28px] bg-[#0d0d0d] border border-white/[0.07] overflow-hidden shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)]">
      {/* Top-right action */}
      <button className="absolute top-5 right-5 z-10 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10">
        <ArrowUpRight className="w-4 h-4 text-gray-300" />
      </button>

      <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height="100%" className="block select-none">
        <defs>
          <pattern id="goal-stripes" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="3" />
          </pattern>
        </defs>

        {/* Title + big number (top-left) */}
        <text x={24} y={40} fontSize={14} fontWeight={600} fill="#e5e7eb">
          {mainGoal ? `${mainGoal.label} Goal` : "Goals"}
        </text>
        <text x={22} y={96} fontSize={50} fontWeight={700} fill="#ffffff" letterSpacing="-0.03em">
          {num}
        </text>
        <text x={24} y={120} fontSize={11} fontWeight={500} fill="#9ca3af">
          {mainGoal ? `${fmtMoney(mainGoal.current)} of ${fmtMoney(mainGoal.target)}` : "no active goals"}
        </text>

        {/* Gauge arcs */}
        {geo.map((g, i) => (
          <g key={`ring-${i}`}>
            <path d={g.trackPath} fill="none" stroke="#262626" strokeWidth={SW} strokeLinecap="round" />
            {g.hasProgress && (
              <path
                d={g.progressPath}
                fill="none"
                stroke={g.isInner ? "url(#goal-stripes)" : g.r.color}
                strokeWidth={SW}
                strokeLinecap="round"
              />
            )}
          </g>
        ))}

        {/* Labels on the left, each aligned to its ring end (smaller text) */}
        {geo.map((g, idx) => {
          const r = g.r;
          const y = g.tip.y;
          const labelEndX = 110;
          return (
            <g key={`legend-${idx}`}>
              <text x={20} y={y + 2.5} fontSize={8} fontWeight={500} fill="#d1d5db">
                {r.label}
              </text>
              <text x={labelEndX - 6} y={y + 2.5} textAnchor="end" fontSize={7.5} fontWeight={600} fill={r.color}>
                {r.target > 0 ? fmtMoney(r.target) : "—"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default GoalsRingCard;
