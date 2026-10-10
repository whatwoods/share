/** 按需引入 ECharts，减小包体积 */
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkLineComponent, CanvasRenderer]);

export { echarts };

/** 设计系统 · 图表 token（见 docs/DESIGN_SYSTEM.md §2.4，已过 dataviz validator） */
export const C = {
  series: ['#5e6ad2', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#8e4ec6', '#e34948'],
  accent: '#5e6ad2',
  energy: '#5e6ad2',
  repair: '#5e6ad2',
  legacy: '#5e6ad2',
  building: '#5e6ad2',
  baseline: '#d6d6d6',
  crit: '#e5484d',
  warn: '#f0a429',
  good: '#30a46c',
  ink1: '#171717',
  ink2: '#5d5d5d',
  ink3: '#8f8f8f',
  grid: '#f2f2f2',
  axis: '#e0e0e0',
  surface: '#ffffff',
  seq: ['#f5f6fd', '#e3e6fa', '#c8cdf5', '#a6adee', '#848ce3', '#5e6ad2', '#4651b8', '#333c92'],
};

const FONT = `Inter, -apple-system, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif`;

export const baseText = { fontFamily: FONT, color: C.ink3, fontSize: 11 };

export const tooltipBase = {
  backgroundColor: '#ffffff',
  borderColor: 'rgba(0,0,0,.06)',
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { fontFamily: FONT, color: C.ink1, fontSize: 12 },
  extraCssText: 'border-radius:8px;box-shadow:0 8px 24px -6px rgba(0,0,0,.12),0 2px 6px -2px rgba(0,0,0,.06);',
  confine: true,
};

export const axisCommon = {
  axisLine: { lineStyle: { color: C.axis } },
  axisTick: { show: false },
  axisLabel: { ...baseText },
  splitLine: { lineStyle: { color: C.grid, type: 'solid' as const } },
};

/** tooltip 行：短线 key + 数值在前、名称在后 */
export function tipRow(color: string, value: string, name: string, line = true) {
  const key = line
    ? `<span style="display:inline-block;width:10px;height:2px;border-radius:1px;background:${color};margin-right:6px;vertical-align:middle"></span>`
    : `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px;vertical-align:middle"></span>`;
  return `<div style="display:flex;align-items:center;gap:4px;line-height:18px">${key}<b style="font-weight:600;font-variant-numeric:tabular-nums">${esc(value)}</b><span style="color:${C.ink3};margin-left:4px">${esc(name)}</span></div>`;
}
export function tipTitle(t: string) {
  return `<div style="color:${C.ink3};font-size:11px;margin-bottom:4px">${esc(t)}</div>`;
}
export function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function compactAxis(v: number) {
  if (Math.abs(v) >= 1e4) return `${+(v / 1e4).toFixed(1)}万`;
  if (Math.abs(v) >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return String(v);
}
