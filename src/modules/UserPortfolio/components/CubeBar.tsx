import { useRef, useState, useEffect, useId } from "react";

// ── Hex shade helpers (lighten/darken for the 3D faces) ──
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const shade = (hex: string, amt: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (c: number) => clamp(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

/**
 * A horizontal isometric "cube" bar whose LENGTH encodes `frac` (0..1) — the
 * sideways counterpart of the Dashboard Balance card's vertical CubeBlock:
 * orange front face with a white diagonal hatch, plus lit top + shaded end
 * faces for depth. Measures its own width so the iso depth stays constant.
 */
const CubeBar = ({
  frac,
  color = "#e8590c",
  height = 6,
}: {
  frac: number;
  color?: string;
  height?: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(200);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(1, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const DX = 7; // iso depth (x)
  const DY = 5; // iso depth (y)
  const H = height;
  const svgH = H + DY;
  const y0 = DY; // front-face top (DY of headroom above for the top face)
  const innerW = Math.max(1, w - DX); // reserve room for the end face
  const fillW = Math.max(6, Math.min(innerW, (frac || 0) * innerW));

  const top = shade(color, 0.34);
  const side = shade(color, -0.2);
  const fid = `cb-f-${uid}`;
  const hid = `cb-h-${uid}`;

  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={svgH} className="block">
        <defs>
          <linearGradient id={fid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shade(color, 0.12)} />
            <stop offset="1" stopColor={shade(color, -0.1)} />
          </linearGradient>
          <pattern id={hid} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="9" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="3" />
          </pattern>
        </defs>

        {/* end (right) face */}
        <path
          d={`M${fillW} ${y0} L${fillW + DX} ${y0 - DY} L${fillW + DX} ${y0 - DY + H} L${fillW} ${y0 + H} Z`}
          fill={side}
        />
        {/* top face */}
        <path d={`M0 ${y0} L${DX} ${y0 - DY} L${fillW + DX} ${y0 - DY} L${fillW} ${y0} Z`} fill={top} />
        {/* front face + hatch */}
        <rect x={0} y={y0} width={fillW} height={H} fill={`url(#${fid})`} />
        <rect x={0} y={y0} width={fillW} height={H} fill={`url(#${hid})`} />
      </svg>
    </div>
  );
};

export default CubeBar;
