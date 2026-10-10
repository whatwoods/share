/** 极简 SVG 迷你趋势线：灰色主体，最后一点用强调色 */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  stroke = '#2a78d6',
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const pad = 3;
  const span = max - min || 1;
  const pts = v.map((y, i) => [pad + (i * (width - pad * 2)) / (v.length - 1), pad + (1 - (y - min) / span) * (height - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0 overflow-visible">
      {fill && <path d={`${d}L${last[0]},${height}L${pts[0][0]},${height}Z`} fill={stroke} opacity={0.08} />}
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      <circle cx={last[0]} cy={last[1]} r={2.75} fill={stroke} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
