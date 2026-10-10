import { useEffect, useRef } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { echarts } from './echarts';

/** ECharts React 包装：自动 resize、增量 setOption、点击回调 */
export function EChart({
  option,
  height = 260,
  className,
  onClick,
  ariaLabel,
}: {
  option: EChartsCoreOption;
  height?: number | string;
  className?: string;
  onClick?: (p: { name: string; dataIndex: number; seriesIndex: number; value: unknown; data: unknown }) => void;
  ariaLabel?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    c.on('click', (p) => clickRef.current?.(p as never));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption({ animationDuration: 500, animationEasing: 'cubicOut', ...option }, { notMerge: true });
  }, [option]);

  return <div ref={el} role="img" aria-label={ariaLabel} className={className} style={{ height, width: '100%' }} />;
}
