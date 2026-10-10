import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { EChart } from '@/components/charts/EChart';
import { C } from '@/components/charts/echarts';
import { heatmap, trendArea } from '@/components/charts/options';
import { DateRange } from '@/components/ui/DateRange';
import { SearchInput, Select } from '@/components/ui/Fields';
import { Meter } from '@/components/ui/Meter';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Sparkline } from '@/components/ui/Sparkline';
import { Stat, StatRow } from '@/components/ui/Stat';
import { Dot } from '@/components/ui/Status';
import { Empty, Loadable, Skeleton } from '@/components/ui/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { ANOMALY_THRESHOLD, energyAnomalies } from '@/lib/anomaly';
import { buildingShort } from '@/lib/buildings';
import { fmtInt, safeBoldHtml, splitCompact, ymd } from '@/lib/format';
import { useBuildingsOverview, useCircuits, useEnergyBuildings, useEnergyOverview, useHeatmap, useInsight, useMeta, useSolar } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';

export default function EnergyPage() {
  const [s, set] = useUrlState(['from', 'to', 'scope', 'hm', 'sort'] as const);
  const from = s.from || ymd(-29);
  const to = s.to || ymd(0);
  const range = { start: from, end: to };
  const ov = useEnergyOverview(range);
  const bld = useEnergyBuildings(range);
  const cards = useBuildingsOverview();
  const solar = useSolar();
  const insight = useInsight();
  const navigate = useNavigate();
  const hmDays = Number(s.hm) || 14;
  const hm = useHeatmap(hmDays);
  const scope = (s.scope || 'all') as 'all' | 'office' | 'apartment';
  const sort = (s.sort || 'kwh') as 'kwh' | 'dev';

  const o = ov.data;
  const month = splitCompact(o?.monthKwh, 'kWh');
  const rangeKwh = splitCompact(o?.rangeKwh, 'kWh');

  const rows = useMemo(() => {
    const an = new Map(energyAnomalies(cards.data?.items ?? []).map((a) => [a.code, a]));
    const spark = new Map((cards.data?.items ?? []).map((c) => [c.code, c.energy.spark]));
    const list = (bld.data?.items ?? [])
      .filter((r) => (scope === 'office' ? /^B(0\d|1[01])$/.test(r.building) : scope === 'apartment' ? /^B1[2-9]$/.test(r.building) : true))
      .map((r) => ({ ...r, an: an.get(r.building), spark: spark.get(r.building) ?? [] }));
    return list.sort((a, b) => (sort === 'dev' ? Math.abs(b.an?.dev ?? 0) - Math.abs(a.an?.dev ?? 0) : b.kwh - a.kwh));
  }, [bld.data, cards.data, scope, sort]);
  const maxKwh = Math.max(1, ...rows.map((r) => r.kwh));

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-h1 font-semibold tight">能耗</h1>
          <p className="mt-1 text-[14px] text-ink-3">CET 智能电表 · 476 个回路 · 光伏电站</p>
        </div>
        <DateRange allowAll={false} from={from} to={to} onChange={(f, t) => set({ from: f, to: t })} />
      </div>

      <StatRow className="mt-8 grid-cols-2 lg:grid-cols-5">
        <Stat label="今日用电" value={fmtInt(o?.todayKwh)} unit="kWh" sub={o?.yesterdayKwh != null && `昨日 ${fmtInt(o.yesterdayKwh)}`} loading={ov.isLoading} />
        <Stat label="实时负荷" value={fmtInt(o?.realtimeLoadKw)} unit="kW" sub="总进线回路合计" loading={ov.isLoading} />
        <Stat label="本月累计" value={month.value} unit={month.unit} sub={o && `日均 ${fmtInt(o.rangeKwh / Math.max(1, o.daily.length))} kWh`} loading={ov.isLoading} />
        <Stat label="区间合计" value={rangeKwh.value} unit={rangeKwh.unit} sub={`${from.slice(5)} ~ ${to.slice(5)}`} loading={ov.isLoading} />
        <Stat label="光伏今日" value={fmtInt(solar.data?.todayYieldKwh)} unit="kWh" sub={solar.data && `当前 ${fmtInt(solar.data.currentPowerKw)} kW · 累计 ${solar.data.totalYieldMwh ?? '—'} MWh`} loading={solar.isLoading} />
      </StatRow>

      {insight.data && (
        <div className="mt-10 border-l-2 border-ink-1 pl-5">
          <div className="text-[12px] text-ink-3">AI 用电诊断 · {insight.data.date}</div>
          <p className="insight mt-1 text-[16px] leading-7 text-ink-1" dangerouslySetInnerHTML={{ __html: safeBoldHtml(insight.data.summary) }} />
          <ul className="mt-2 space-y-1">
            {insight.data.points.map((p, i) => (
              <li key={i} className="insight text-[14px] leading-6 text-ink-2" dangerouslySetInnerHTML={{ __html: `— ${safeBoldHtml(p)}` }} />
            ))}
          </ul>
        </div>
      )}

      <Section title="园区日用电" desc="kWh / 日 · 虚线为区间日均" className="mt-12">
        <Loadable loading={ov.isLoading} fetching={ov.isFetching} error={ov.error} skeleton={<Skeleton className="h-[280px]" />}>
          {o && <EChart option={trendArea(o.daily, { color: C.accent, avgLine: true })} height={280} ariaLabel="园区日用电趋势" />}
        </Loadable>
      </Section>

      <div className="mt-12 grid gap-x-14 gap-y-12 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section
          title="楼栋用电"
          desc={`区间电量排行 · 「昨日偏差」= 昨日 vs 近两周同类日均，超过 ±${ANOMALY_THRESHOLD * 100}% 标记`}
          actions={
            <>
              <Segmented
                value={sort}
                onChange={(v) => set({ sort: v === 'kwh' ? null : v })}
                options={[
                  { value: 'kwh', label: '按电量' },
                  { value: 'dev', label: '按偏差' },
                ]}
              />
              <Segmented
                value={scope}
                onChange={(v) => set({ scope: v === 'all' ? null : v })}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'office', label: '1~11' },
                  { value: 'apartment', label: '12~19' },
                ]}
              />
            </>
          }
          flush
        >
          <Loadable loading={bld.isLoading} fetching={bld.isFetching} error={bld.error} skeleton={<Skeleton className="mt-4 h-[420px]" />}>
            <div className="scroll-thin overflow-x-auto">
              <Table className="min-w-[620px]">
                <thead>
                  <tr>
                    <Th>楼栋</Th>
                    <Th className="w-[38%]">区间电量 kWh</Th>
                    <Th align="right">昨日</Th>
                    <Th align="right">昨日偏差</Th>
                    <Th>近14天</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dev = r.an?.dev;
                    const flagged = r.an?.flagged;
                    return (
                      <Tr key={r.building} onClick={() => navigate(`/buildings?b=${r.building}&m=energy`)}>
                        <Td className="font-medium whitespace-nowrap">{r.name}</Td>
                        <Td>
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grid">
                              <div className="h-full rounded-full bg-accent" style={{ width: `${(r.kwh / maxKwh) * 100}%` }} />
                            </div>
                            <span className="num w-16 text-right text-[13px] text-ink-2">{fmtInt(r.kwh)}</span>
                          </div>
                        </Td>
                        <Td align="right" className="text-ink-2">
                          {fmtInt(r.an?.yesterday)}
                        </Td>
                        <Td align="right">
                          {dev == null ? (
                            <span className="text-ink-4">—</span>
                          ) : (
                            <span className={clsx('inline-flex items-center justify-end gap-1.5 font-medium', flagged ? (dev > 0 ? 'text-crit-ink' : 'text-info-ink') : 'text-ink-3')}>
                              {flagged && <Dot tone={dev > 0 ? 'crit' : 'info'} />}
                              {dev > 0 ? '+' : ''}
                              {(dev * 100).toFixed(1)}%
                            </span>
                          )}
                        </Td>
                        <Td>
                          <Sparkline values={r.spark} width={80} height={20} stroke={flagged ? (dev! > 0 ? '#e5484d' : '#5e6ad2') : '#bcbcbc'} fill={false} />
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Loadable>
        </Section>

        <Section title="分项结构" desc="区间内各分项电量占比">
          {ov.isLoading && <Skeleton className="h-[240px]" />}
          {o && o.byCategory.length === 0 && <Empty title="能耗服务未提供分项数据" />}
          <div className="space-y-4">
            {o &&
              (() => {
                const total = o.byCategory.reduce((a, b) => a + b.kwh, 0) || 1;
                return [...o.byCategory]
                  .sort((a, b) => b.kwh - a.kwh)
                  .map((c) => (
                    <div key={c.type}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[14px]">
                        <span className="truncate text-ink-1">{c.type}</span>
                        <span className="num shrink-0 text-[13px] text-ink-3">
                          {fmtInt(c.kwh)} · <span className="font-medium text-ink-1">{((c.kwh / total) * 100).toFixed(1)}%</span>
                        </span>
                      </div>
                      <Meter value={c.kwh / total} tone="accent" />
                    </div>
                  ));
              })()}
          </div>
        </Section>
      </div>

      <Section
        title="峰谷分布"
        desc="每格 = 某日某小时的园区电量，颜色越深负荷越高"
        className="mt-12"
        actions={
          <Segmented
            value={String(hmDays)}
            onChange={(v) => set({ hm: v === '14' ? null : v })}
            options={[
              { value: '7', label: '7天' },
              { value: '14', label: '14天' },
              { value: '30', label: '30天' },
            ]}
          />
        }
      >
        <Loadable loading={hm.isLoading} fetching={hm.isFetching} error={hm.error} skeleton={<Skeleton className="h-[360px]" />}>
          {hm.data && <EChart option={heatmap(hm.data)} height={Math.max(260, hm.data.days.length * 20 + 70)} ariaLabel="峰谷热力图" />}
        </Loadable>
      </Section>

      <CircuitLedger />
    </div>
  );
}

function CircuitLedger() {
  const c = useCircuits();
  const meta = useMeta();
  const [type, setType] = useState('');
  const [building, setBuilding] = useState('');
  const [q, setQ] = useState('');
  const [inc, setInc] = useState<'all' | 'in' | 'out'>('all');
  const cats = c.data?.categories ?? [];
  const rows = useMemo(() => {
    let xs = c.data?.items ?? [];
    if (type) xs = xs.filter((x) => x.type === type);
    if (building) xs = xs.filter((x) => x.building === building);
    if (inc !== 'all') xs = xs.filter((x) => x.include === (inc === 'in'));
    if (q) {
      const k = q.toLowerCase();
      xs = xs.filter((x) => `${x.name} ${x.area} ${x.substation} ${x.nodeId}`.toLowerCase().includes(k));
    }
    return [...xs].sort((a, b) => (b.kwh ?? -1) - (a.kwh ?? -1));
  }, [c.data, type, building, q, inc]);
  const hasKwh = (c.data?.items ?? []).some((x) => x.kwh != null);

  return (
    <Section title="回路台账" count={c.data?.items.length} desc="按分项下钻到单回路" className="mt-12" flush>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <Select
          value={type}
          onChange={setType}
          placeholder="全部分项"
          label="分项"
          options={cats.map((k) => ({ value: k.type, label: `${k.type}（${k.count}）` }))}
        />
        <Select value={building} onChange={setBuilding} placeholder="全部楼栋" label="楼栋" options={(meta.data?.buildings ?? []).map((b) => ({ value: b.code, label: b.name }))} />
        <Segmented
          value={inc}
          onChange={setInc}
          options={[
            { value: 'all', label: '全部' },
            { value: 'in', label: '计入总量' },
            { value: 'out', label: '不计入' },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="回路名称 / 区域 / 变电所" />
        <span className="num ml-auto text-[13px] text-ink-3">{rows.length} 个回路</span>
      </div>
      <Loadable loading={c.isLoading} error={c.error}>
        <div className="scroll-thin max-h-[520px] overflow-auto">
          <Table className="min-w-[860px]">
            <thead>
              <tr>
                <Th className="w-14">编号</Th>
                <Th>回路名称</Th>
                <Th>区域</Th>
                <Th className="w-16">楼栋</Th>
                <Th>变电所</Th>
                <Th>分项</Th>
                <Th className="w-16">计入</Th>
                {hasKwh && <Th align="right">区间 kWh</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((x) => (
                <Tr key={x.nodeId}>
                  <Td className="num text-ink-3">{x.nodeId}</Td>
                  <Td className="font-medium">{x.name}</Td>
                  <Td className="text-ink-2">{x.area}</Td>
                  <Td className="num text-ink-2">{buildingShort(x.building)}</Td>
                  <Td className="text-ink-2">{x.substation}</Td>
                  <Td className="text-ink-2">{x.type}</Td>
                  <Td className={x.include ? 'text-ink-1' : 'text-ink-4'}>{x.include ? '是' : '否'}</Td>
                  {hasKwh && <Td align="right">{fmtInt(x.kwh)}</Td>}
                </Tr>
              ))}
            </tbody>
          </Table>
          {rows.length === 0 && !c.isLoading && <Empty title="没有匹配的回路" />}
        </div>
      </Loadable>
    </Section>
  );
}
