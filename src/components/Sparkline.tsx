import { useId } from 'react';

interface Props {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  area?: boolean;
  strokeWidth?: number;
  className?: string;
}

/** Smooth (Catmull-Rom → Bézier) sparkline with optional gradient area fill. */
export function Sparkline({ data, color, width = 160, height = 60, area = true, strokeWidth = 2, className }: Props) {
  const id = useId().replace(/:/g, '');
  const pts = data.length > 1 ? data : [0, ...(data.length ? data : [0])];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const pad = strokeWidth + 1;
  const span = max - min || 1;
  const xy = pts.map((v, i) => [
    (i / (pts.length - 1)) * width,
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);
  let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[i + 2] ?? p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return (
    <svg className={className} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.38" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#sg${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
