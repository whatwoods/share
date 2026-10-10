/**
 * 图表 option 构造器 —— 统一遵循设计系统：
 * 线宽 2px、柱宽 ≤ 24px、4px 圆角柱端、1px 实线网格、tooltip 数值在前。
 */
import type { EChartsCoreOption } from 'echarts/core';
import { C, axisCommon, baseText, compactAxis, tipRow, tipTitle, tooltipBase } from './echarts';
import { fmtInt, shortDate } from '@/lib/format';

const grid = (o: Partial<{ top: number; right: number; bottom: number; left: number }> = {}) => ({
  top: 16,
  right: 12,
  bottom: 24,
  left: 8,
  containLabel: true,
  ...o,
});

/** 单系列日趋势（面积洗色）。highlightWeekend：周末刻度变浅 */
export function trendArea(
  data: { date: string; kwh: number }[],
  opts: { color?: string; unit?: string; name?: string; avgLine?: boolean } = {},
): EChartsCoreOption {
  const color = opts.color ?? C.energy;
  const unit = opts.unit ?? 'kWh';
  const vals = data.map((d) => d.kwh);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return {
    grid: grid({ top: 20 }),
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: C.axis, width: 1 } },
      formatter: (ps: { dataIndex: number }[]) => {
        const d = data[ps[0].dataIndex];
        const wd = '日一二三四五六'[new Date(`${d.date}T00:00:00+08:00`).getDay()];
        return tipTitle(`${d.date} 周${wd}`) + tipRow(color, `${fmtInt(d.kwh)} ${unit}`, opts.name ?? '用电量');
      },
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date),
      boundaryGap: false,
      ...axisCommon,
      splitLine: { show: false },
      axisLabel: { ...baseText, formatter: shortDate, hideOverlap: true },
    },
    yAxis: { type: 'value', ...axisCommon, axisLine: { show: false }, axisLabel: { ...baseText, formatter: compactAxis }, splitNumber: 4 },
    series: [
      {
        type: 'line',
        name: opts.name ?? '用电量',
        data: vals,
        smooth: 0.25,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: false,
        lineStyle: { width: 2, color, cap: 'round', join: 'round' },
        itemStyle: { color, borderColor: C.surface, borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: hexA(color, 0.16) }, { offset: 1, color: hexA(color, 0.01) }],
          },
        },
        emphasis: { focus: 'none', scale: true },
        markLine: opts.avgLine
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { color: C.baseline, type: [4, 4], width: 1 },
              label: { ...baseText, position: 'insideEndTop', formatter: `均值 ${fmtInt(avg)}` },
              data: [{ yAxis: avg }],
            }
          : undefined,
      },
    ],
  };
}

/** 横向排行条（名次从上到下）。onClick 由外部绑定 */
export function rankBars(
  rows: { name: string; value: number; sub?: string; color?: string }[],
  opts: { color?: string; unit?: string; valueFmt?: (v: number) => string; maxBars?: number } = {},
): EChartsCoreOption {
  const color = opts.color ?? C.energy;
  const fmt = opts.valueFmt ?? ((v: number) => fmtInt(v));
  const list = rows.slice(0, opts.maxBars ?? rows.length).reverse();
  return {
    grid: grid({ top: 4, right: 64, bottom: 4, left: 4 }),
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: { dataIndex: number }) => {
        const r = list[p.dataIndex];
        return tipTitle(r.name) + tipRow(r.color ?? color, `${fmt(r.value)}${opts.unit ? ` ${opts.unit}` : ''}`, r.sub ?? '', false);
      },
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: list.map((r) => r.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...baseText, color: C.ink2, fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        data: list.map((r) => ({ value: r.value, itemStyle: { color: r.color ?? color } })),
        barMaxWidth: 14,
        barCategoryGap: '38%',
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        showBackground: true,
        backgroundStyle: { color: '#f4f6f9', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', ...baseText, color: C.ink2, fontSize: 11, formatter: (p: { value: number }) => fmt(p.value) },
        emphasis: { itemStyle: { opacity: 0.85 } },
        cursor: 'pointer',
      },
    ],
  };
}

/** 月度：已完成 + 未完成 堆叠柱（≥2 系列 → 图例） */
export function monthStack(rows: { month: string; closed: number; open: number; rate: number }[]): EChartsCoreOption {
  return {
    grid: grid({ top: 36 }),
    legend: {
      top: 0,
      left: 0,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { ...baseText, color: C.ink2, fontSize: 12 },
    },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,23,41,.04)' } },
      formatter: (ps: { dataIndex: number }[]) => {
        const r = rows[ps[0].dataIndex];
        return (
          tipTitle(r.month) +
          tipRow(C.repair, fmtInt(r.closed), '已完成', false) +
          tipRow(C.baseline, fmtInt(r.open), '未完成', false) +
          `<div style="margin-top:4px;color:${C.ink3};font-size:11px">闭环率 <b style="color:${C.ink1}">${(r.rate * 100).toFixed(1)}%</b></div>`
        );
      },
    },
    xAxis: { type: 'category', data: rows.map((r) => r.month.slice(2).replace('-', '/')), ...axisCommon, splitLine: { show: false } },
    yAxis: { type: 'value', ...axisCommon, axisLine: { show: false }, axisLabel: { ...baseText, formatter: compactAxis }, splitNumber: 4 },
    series: [
      {
        name: '已完成',
        type: 'bar',
        stack: 't',
        data: rows.map((r) => r.closed),
        barMaxWidth: 22,
        itemStyle: { color: C.repair, borderColor: C.surface, borderWidth: 1 },
      },
      {
        name: '未完成',
        type: 'bar',
        stack: 't',
        data: rows.map((r) => r.open),
        barMaxWidth: 22,
        itemStyle: { color: C.baseline, borderRadius: [4, 4, 0, 0], borderColor: C.surface, borderWidth: 1 },
      },
    ],
  };
}

/** 日新增工单柱 */
export function dayColumns(rows: { date: string; total: number; closed: number }[], color = C.repair): EChartsCoreOption {
  return {
    grid: grid({ top: 12 }),
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,23,41,.04)' } },
      formatter: (ps: { dataIndex: number }[]) => {
        const r = rows[ps[0].dataIndex];
        return tipTitle(r.date) + tipRow(color, `${r.total} 单`, '新增报修', false) + tipRow(C.baseline, `${r.closed} 单`, '其中已完成', false);
      },
    },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.date),
      ...axisCommon,
      splitLine: { show: false },
      axisLabel: { ...baseText, formatter: shortDate, hideOverlap: true },
    },
    yAxis: { type: 'value', ...axisCommon, axisLine: { show: false }, minInterval: 1, splitNumber: 3 },
    series: [{ type: 'bar', data: rows.map((r) => r.total), barMaxWidth: 12, itemStyle: { color, borderRadius: [3, 3, 0, 0] } }],
  };
}

/** 峰谷热力图：days × 24h，单色蓝阶 */
export function heatmap(h: { days: string[]; hours: number[]; values: [number, number, number][] }): EChartsCoreOption {
  const max = Math.max(1, ...h.values.map((v) => v[2]));
  return {
    grid: grid({ top: 8, bottom: 40, left: 4, right: 8 }),
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: { value: [number, number, number] }) => {
        const [hr, di, v] = p.value;
        return tipTitle(`${h.days[di]} ${String(hr).padStart(2, '0')}:00–${String(hr + 1).padStart(2, '0')}:00`) + tipRow(C.energy, `${fmtInt(v)} kWh`, '时段电量', false);
      },
    },
    xAxis: {
      type: 'category',
      data: h.hours.map((x) => `${x}`),
      ...axisCommon,
      axisLine: { show: false },
      splitArea: { show: false },
      axisLabel: { ...baseText, interval: 1, formatter: (v: string) => `${v}时` },
    },
    yAxis: {
      type: 'category',
      data: h.days.map(shortDate),
      ...axisCommon,
      axisLine: { show: false },
      splitLine: { show: false },
    },
    visualMap: {
      min: 0,
      max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 160,
      text: ['高', '低'],
      textStyle: { ...baseText },
      inRange: { color: C.seq },
    },
    series: [
      {
        type: 'heatmap',
        // contract 为 [dayIndex, hour, kwh]；ECharts 需要 [x=hour, y=day, value]
        data: h.values.map(([d, hr, v]) => [hr, d, v]),
        itemStyle: { borderColor: C.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: C.ink1, borderWidth: 1 } },
      },
    ],
  };
}

/** 竖向分类柱（工种 / 分项），可点击 */
export function categoryColumns(
  rows: { name: string; value: number; sub?: string }[],
  opts: { color?: string; unit?: string; rotate?: number } = {},
): EChartsCoreOption {
  const color = opts.color ?? C.repair;
  return {
    grid: grid({ top: 20, bottom: 8 }),
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: { dataIndex: number }) => {
        const r = rows[p.dataIndex];
        return tipTitle(r.name) + tipRow(color, `${fmtInt(r.value)}${opts.unit ?? ''}`, r.sub ?? '', false);
      },
    },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.name),
      ...axisCommon,
      splitLine: { show: false },
      axisLabel: { ...baseText, color: C.ink2, interval: 0, rotate: opts.rotate ?? 0, overflow: 'break', width: 60 },
    },
    yAxis: { type: 'value', ...axisCommon, axisLine: { show: false }, axisLabel: { ...baseText, formatter: compactAxis }, splitNumber: 3 },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => r.value),
        barMaxWidth: 24,
        itemStyle: { color, borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', ...baseText, color: C.ink2, formatter: (p: { value: number }) => fmtInt(p.value) },
        cursor: 'pointer',
      },
    ],
  };
}

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
