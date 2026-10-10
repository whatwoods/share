/** 按需引入 ECharts，减小包体积 */
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkLineComponent, CanvasRenderer]);

export { echarts };

/** 设计系统 · 图表 token（见 docs/DESIGN_SYSTEM.md §2.4，已过 dataviz validator） */
export const C = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  energy: '#2a78d6',
  repair: '#0f9b6e',
  legacy: '#6250d6',
  building: '#0e7490',
  baseline: '#b4bccb',
  crit: '#d03b3b',
  warn: '#e9a100',
  good: '#0ca30c',
  ink1: '#0f1729',
  ink2: '#4a5568',
  ink3: '#8a94a6',
  grid: '#edf0f4',
  axis: '#cfd6df',
  surface: '#ffffff',
  seq: ['#eef5fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
};

const FONT = `Inter, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif`;

export const baseText = { fontFamily: FONT, color: C.ink3, fontSize: 11 };

export const tooltipBase = {
  backgroundColor: '#ffffff',
  borderColor: '#e4e8ee',
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { fontFamily: FONT, color: C.ink1, fontSize: 12 },
  extraCssText: 'border-radius:10px;box-shadow:0 12px 32px -8px rgba(15,23,41,.18),0 4px 8px -4px rgba(15,23,41,.08);',
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
