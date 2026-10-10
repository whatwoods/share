import clsx from 'clsx';
import { Activity, CalendarDays, Gauge, Sparkles, Sun, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { EChart } from '@/components/charts/EChart';
import { C } from '@/components/charts/echarts';
import { heatmap, rankBars, trendArea } from '@/components/charts/options';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DateRange } from '@/components/ui/DateRange';
import { SearchInput, Select } from '@/components/ui/Fields';
import { KpiCard } from '@/components/ui/KpiCard';
import { Meter } from '@/components/ui/Meter';
import { Segmented } from '@/components/ui/Segmented';
import { Empty, Loadable, Skeleton } from '@/components/ui/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { buildingShort } from '@/lib/buildings';
import { fmtInt, safeBoldHtml, splitCompact, ymd } from '@/lib/format';
import { useCircuits, useEnergyBuildings, useEnergyOverview, useHeatmap, useInsight, useMeta, useSolar } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';

export default function EnergyPage() {
  const [s, set] = useUrlState(['from', 'to', 'scope', 'hm'] as const);
  const from = s.from || ymd(-29);
  const to = s.to || ymd(0);
  const range = { start: from, end: to };
  const ov = useEnergyOverview(range);
  const bld = useEnergyBuildings(range);
  const solar = useSolar();
  const navigate = useNavigate();
  const hmDays = Number(s.hm) || 14;
  const hm = useHeatmap(hmDays);
  const scope = (s.scope || 'all') as 'all' | 'office' | 'apartment';

  const o = ov.data;
  const delta = o?.yesterdayKwh && o.daily.length > 7 ? weekdayDelta(o.daily, o.yesterdayKwh) : null;
  const month = splitCompact(o?.monthKwh, 'kWh');
  const range$ = splitCompact(o?.rangeKwh, 'kWh');

  const rankRows = useMemo(() => {
    const items = bld.data?.items ?? [];
    return items
      .filter((r) => (scope === 'office' ? /^B(0\d|1[01])$/.test(r.building) : scope === 'apartment' ? /^B1[2-9]$/.test(r.building) : true))
      .sort((a, b) => b.kwh - a.kwh)
      .map((r) => ({ name: r.name, code: r.building, value: r.kwh, sub: `占全园 ${(r.share * 100).toFixed(1)}%` }));
  }, [bld.data, scope]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          loading={ov.isLoading}
          label="今日用电（截至当前）"
          value={fmtInt(o?.todayKwh)}
          unit="kWh"
          icon={<Zap />}
          accent="energy"
          delta={delta != null ? { value: delta, label: `昨日较同类日均（昨日 ${fmtInt(o?.yesterdayKwh)}）`, upIsGood: false } : null}
          foot={delta == null && o?.yesterdayKwh != null ? `昨日 ${fmtInt(o.yesterdayKwh)} kWh` : undefined}
        />
        <KpiCard loading={ov.isLoading} label="实时负荷" value={fmtInt(o?.realtimeLoadKw)} unit="kW" icon={<Gauge />} accent="energy" foot="CET 总进线回路合计" />
        <KpiCard loading={ov.isLoading} label="本月累计" value={month.value} unit={month.unit} icon={<CalendarDays />} accent="energy" foot={o && `区间日均 ${fmtInt(o.rangeKwh / Math.max(1, o.daily.length))} kWh`} />
        <KpiCard
          loading={ov.isLoading}
          label="区间总电量"
          value={range$.value}
          unit={range$.unit}
          icon={<Activity />}
          accent="energy"
          spark={o?.daily.slice(-14).map((d) => d.kwh)}
          foot={`${from.slice(5)} ~ ${to.slice(5)}`}
        />
        <KpiCard
          loading={solar.isLoading}
          label="光伏今日发电"
          value={fmtInt(solar.data?.todayYieldKwh)}
          unit="kWh"
          icon={<Sun />}
          accent="warn"
          foot={solar.data && `当前 ${fmtInt(solar.data.currentPowerKw)} kW · 累计 ${solar.data.totalYieldMwh ?? '—'} MWh`}
        />
      </div>

      <InsightCard />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="园区日用电趋势" subtitle="单位 kWh · 虚线为区间日均" actions={<DateRange allowAll={false} from={from} to={to} onChange={(f, t) => set({ from: f, to: t })} />} />
          <CardBody>
            <Loadable loading={ov.isLoading} fetching={ov.isFetching} error={ov.error} skeleton={<Skeleton className="h-[300px]" />}>
              {o && <EChart option={trendArea(o.daily, { color: C.energy, avgLine: true })} height={300} ariaLabel="园区日用电趋势" />}
            </Loadable>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="分项用电结构" subtitle="区间内各分项电量" />
          <CardBody className="space-y-3">
            {ov.isLoading && <Skeleton className="h-[280px]" />}
            {o && o.byCategory.length === 0 && <Empty title="能耗服务未提供分项数据" />}
            {o &&
              (() => {
                const total = o.byCategory.reduce((a, b) => a + b.kwh, 0) || 1;
                return [...o.byCategory]
                  .sort((a, b) => b.kwh - a.kwh)
                  .map((c) => (
                    <div key={c.type}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-body">
                        <span className="truncate text-ink-1">{c.type}</span>
                        <span className="num shrink-0 text-caption text-ink-3">
                          <b className="font-semibold text-ink-1">{fmtInt(c.kwh)}</b> kWh · {((c.kwh / total) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <Meter value={c.kwh / total} tone="energy" />
                    </div>
                  ));
              })()}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader
            title="楼栋电耗排行"
            subtitle="点击楼栋进入全景联动"
            actions={
              <Segmented
                size="sm"
                value={scope}
                onChange={(v) => set({ scope: v === 'all' ? null : v })}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'office', label: '1~11号楼' },
                  { value: 'apartment', label: '12~19号楼' },
                ]}
              />
            }
          />
          <CardBody>
            <Loadable loading={bld.isLoading} fetching={bld.isFetching} error={bld.error} skeleton={<Skeleton className="h-[420px]" />}>
              <EChart
                option={rankBars(rankRows, { color: C.energy, unit: 'kWh' })}
                height={Math.max(220, rankRows.length * 24)}
                onClick={(p) => navigate(`/buildings?b=${[...rankRows].reverse()[p.dataIndex].code}&m=energy`)}
                ariaLabel="楼栋电耗排行"
              />
            </Loadable>
          </CardBody>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader
            title="峰谷用电热力图"
            subtitle="每格 = 某日某小时电量 · 颜色越深负荷越高"
            actions={
              <Segmented
                size="sm"
                value={String(hmDays)}
                onChange={(v) => set({ hm: v === '14' ? null : v })}
                options={[
                  { value: '7', label: '7天' },
                  { value: '14', label: '14天' },
                  { value: '30', label: '30天' },
                ]}
              />
            }
          />
          <CardBody>
            <Loadable loading={hm.isLoading} fetching={hm.isFetching} error={hm.error} skeleton={<Skeleton className="h-[420px]" />}>
              {hm.data && <EChart option={heatmap(hm.data)} height={Math.max(300, hm.data.days.length * 22 + 70)} ariaLabel="峰谷热力图" />}
            </Loadable>
          </CardBody>
        </Card>
      </div>

      <CircuitLedger />
    </div>
  );
}

/** 昨日 vs 近 4 个同类日（同为工作日 / 周末）均值 */
function weekdayDelta(daily: { date: string; kwh: number }[], yesterday: number) {
  const dow = (d: string) => new Date(`${d}T00:00:00+08:00`).getDay();
  const yd = ymd(-1);
  const isWe = (d: string) => [0, 6].includes(dow(d));
  const same = daily.filter((d) => d.date < yd && isWe(d.date) === isWe(yd)).slice(-4);
  if (!same.length) return null;
  const avg = same.reduce((a, b) => a + b.kwh, 0) / same.length;
  return avg ? (yesterday - avg) / avg : null;
}

function InsightCard() {
  const ins = useInsight();
  const d = ins.data;
  const anomaly = d?.anomaly ?? 'normal';
  const tone = anomaly === 'high' ? 'crit' : anomaly === 'low' ? 'info' : 'good';
  const label = anomaly === 'high' ? '用电偏高' : anomaly === 'low' ? '用电偏低' : '用电平稳';
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 md:flex-row">
        <div className="flex shrink-0 items-start gap-3 md:w-[220px]">
          <span className="grid size-10 place-items-center rounded-[11px] bg-gradient-to-br from-[#3987e5] to-[#6250d6] text-white shadow-[0_6px_16px_-6px_rgba(42,120,214,.6)]">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h2 className="text-h2 font-semibold text-ink-1">AI 用电诊断简报</h2>
            <p className="num text-caption text-ink-3">{d?.date ?? '—'}</p>
            {d && (
              <Badge tone={tone} dot className="mt-1.5">
                {label}
              </Badge>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {ins.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : d ? (
            <>
              <p className="insight text-[14px] leading-6 text-ink-1" dangerouslySetInnerHTML={{ __html: safeBoldHtml(d.summary) }} />
              <ul className="mt-2 space-y-1.5">
                {d.points.map((p, i) => (
                  <li key={i} className="insight flex gap-2 text-body text-ink-2">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-energy" />
                    <span dangerouslySetInnerHTML={{ __html: safeBoldHtml(p) }} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty title="暂无诊断" className="py-4" />
          )}
        </div>
      </div>
    </Card>
  );
}

function CircuitLedger() {
  const c = useCircuits();
  const meta = useMeta();
  const [type, setType] = useState('');
  const [building, setBuilding] = useState('');
  const [q, setQ] = useState('');
  const [onlyIncluded, setOnlyIncluded] = useState<'all' | 'in' | 'out'>('all');
  const cats = c.data?.categories ?? [];
  const rows = useMemo(() => {
    let xs = c.data?.items ?? [];
    if (type) xs = xs.filter((x) => x.type === type);
    if (building) xs = xs.filter((x) => x.building === building);
    if (onlyIncluded !== 'all') xs = xs.filter((x) => x.include === (onlyIncluded === 'in'));
    if (q) {
      const k = q.toLowerCase();
      xs = xs.filter((x) => `${x.name} ${x.area} ${x.substation} ${x.nodeId}`.toLowerCase().includes(k));
    }
    return [...xs].sort((a, b) => (b.kwh ?? -1) - (a.kwh ?? -1));
  }, [c.data, type, building, q, onlyIncluded]);
  const hasKwh = (c.data?.items ?? []).some((x) => x.kwh != null);

  return (
    <Card>
      <CardHeader title="回路台账与下钻" subtitle={`CET 智能电表回路 · 共 ${c.data?.items.length ?? '—'} 个 · 选择分项下钻到单回路`} />
      <CardBody className="space-y-3">
        <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <CatChip active={!type} onClick={() => setType('')} label="全部分项" count={c.data?.items.length} />
          {cats.map((k) => (
            <CatChip key={k.type} active={type === k.type} onClick={() => setType(type === k.type ? '' : k.type)} label={k.type} count={k.count} kwh={k.kwh} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={building}
            onChange={setBuilding}
            placeholder="全部楼栋"
            width={112}
            options={(meta.data?.buildings ?? []).map((b) => ({ value: b.code, label: b.name }))}
          />
          <Segmented
            size="sm"
            value={onlyIncluded}
            onChange={setOnlyIncluded}
            options={[
              { value: 'all', label: '全部回路' },
              { value: 'in', label: '计入总量' },
              { value: 'out', label: '不计入' },
            ]}
          />
          <SearchInput value={q} onChange={setQ} placeholder="回路名称 / 区域 / 变电所" />
          <span className="num ml-auto text-caption text-ink-3">{rows.length} 个回路</span>
        </div>
        <Loadable loading={c.isLoading} error={c.error}>
          <div className="scroll-thin -mx-5 max-h-[480px] overflow-auto">
            <Table className="min-w-[860px]">
              <thead>
                <tr>
                  <Th className="w-16">编号</Th>
                  <Th>回路名称</Th>
                  <Th>区域</Th>
                  <Th className="w-24">楼栋</Th>
                  <Th>变电所</Th>
                  <Th>分项</Th>
                  <Th className="w-20">计入</Th>
                  {hasKwh && <Th align="right">区间电量 (kWh)</Th>}
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
                    <Td>
                      <Badge tone="energy">{x.type}</Badge>
                    </Td>
                    <Td>{x.include ? <span className="text-good-ink">● 是</span> : <span className="text-ink-4">○ 否</span>}</Td>
                    {hasKwh && <Td align="right">{fmtInt(x.kwh)}</Td>}
                  </Tr>
                ))}
              </tbody>
            </Table>
            {rows.length === 0 && !c.isLoading && <Empty title="没有匹配的回路" />}
          </div>
        </Loadable>
      </CardBody>
    </Card>
  );
}

function CatChip({ active, onClick, label, count, kwh }: { active: boolean; onClick: () => void; label: string; count?: number; kwh?: number | null }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex shrink-0 flex-col items-start rounded-[10px] border px-3 py-2 text-left transition-colors',
        active ? 'border-energy/50 bg-energy-soft' : 'border-line bg-surface hover:border-energy/30',
      )}
    >
      <span className={clsx('text-body font-medium whitespace-nowrap', active ? 'text-energy' : 'text-ink-1')}>{label}</span>
      <span className="num text-caption whitespace-nowrap text-ink-3">
        {count ?? '—'} 回路{kwh != null && ` · ${fmtInt(kwh)} kWh`}
      </span>
    </button>
  );
}
