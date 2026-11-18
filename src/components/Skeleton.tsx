import type { CSSProperties } from 'react';

export function Skel({ w = '100%', h = 14, r, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }) {
  return <span className="skel" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

export function SkelRows({ rows = 3, h = 56 }: { rows?: number; h?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skel key={i} h={h} r={14} />
      ))}
    </div>
  );
}
