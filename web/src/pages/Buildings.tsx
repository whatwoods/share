import clsx from 'clsx';
import { ArrowRight, Building2, Construction, Wrench, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { BuildingCard, LegacyItem, Ticket } from '@shared/contract';
import { ParkMap, rampFor, type MapMetric } from '@/components/buildings/ParkMap';
import { EChart } from '@/components/charts/EChart';
import { C } from '@/components/charts/echarts';
import { trendArea } from '@/components/charts/options';
import { LegacyCard } from '@/components/legacy/LegacyCard';
import { LegacyDrawer } from '@/components/legacy/LegacyDrawer';
import { TicketCard } from '@/components/tickets/TicketCard';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { HealthBadge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Sparkline } from '@/components/ui/Sparkline';
import { Empty, Loadable, Skeleton } from '@/components/ui/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { fmtCompact, fmtInt, fmtPct } from '@/lib/format';
import { useBuildingDetail, useBuildingsOverview } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';

const METRICS: { value: MapMetric; label: string }[] = [
  { value: 'health', label: '综合健康' },
  { value: 'energy', label: '近30天电耗' },
  { value: 'tickets', label: '未完成报修' },
  { value: 'legacy', label: '遗留缺陷' },
];

export default function BuildingsPage() {
  const [url, setUrl] = useUrlState(['b', 'm'] as const);
  const metric = (url.m || 'health') as MapMetric;
  const overview = useBuildingsOverview();
  const items = overview.data?.items ?? [];

  const selected = useMemo(() => {
    if (url.b) return url.b;
    const worst = [...items].sort((a, b) => score(b) - score(a))[0];
    return worst?.code ?? 'B01';
  }, [url.b, items]);

  const detail = useBuildingDetail(selected);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [legacy, setLegacy] = useState<LegacyItem | null>(null);
  const card = items.find((b) => b.code === selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={metric} onChange={(m) => setUrl({ m: m === 'health' ? null : m })} options={METRICS} />
        <MapLegend metric={metric} />
        <span className="ml-auto text-caption text-ink-3">点击楼块联动查看 · 楼块厚度 = 近 30 天电量</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardBody className="pt-5">
            {overview.isLoading ? (
              <Skeleton className="aspect-[16/8.4] w-full" />
            ) : (
              <ParkMap items={items} selected={selected} onSelect={(c) => setUrl({ b: c })} metric={metric} />
            )}
          </CardBody>
        </Card>

        <Card className="flex flex-col xl:col-span-4">
          <div className="flex items-center gap-3 px-5 pt-5">
            <div className="grid size-10 place-items-center rounded-[11px] bg-building-soft text-building">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-semibold text-ink-1">{card?.name ?? detail.data?.building.name ?? '—'}</h2>
                {card && <HealthBadge health={card.health} />}
              </div>
              <p className="text-caption text-ink-3">
                {card?.kind === 'office' ? '研发办公' : card?.kind === 'apartment' ? '公寓及配套研发办公' : card?.kind === 'public' ? '公共区域 · 设备用房' : ''}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden border-y border-line bg-line mt-4">
            <Stat icon={<Zap />} label="近 30 天电量" value={fmtCompact(card?.energy.kwh30d)} unit="kWh" tone="energy" />
            <Stat icon={<Zap />} label="昨日电量" value={fmtInt(card?.energy.yesterdayKwh)} unit="kWh" tone="energy" />
            <Stat
              icon={<Wrench />}
              label="未完成报修"
              value={fmtInt(card?.tickets.open)}
              unit="单"
              tone="repair"
              note={card && (card.tickets.red || card.tickets.yellow) ? `超时 ${card.tickets.red} · 临期 ${card.tickets.yellow}` : undefined}
              noteTone={card?.tickets.red ? 'crit' : 'warn'}
            />
            <Stat
              icon={<Construction />}
              label="遗留缺陷"
              value={fmtInt(card?.legacy.open)}
              unit="项"
              tone="legacy"
              note={card?.legacy.highRisk ? `高危 ${card.legacy.highRisk}` : undefined}
              noteTone="crit"
            />
          </div>
          <div className="flex-1 px-3 pt-3 pb-2">
            <div className="px-2 text-caption font-medium text-ink-2">近 30 天日电耗</div>
            <Loadable loading={detail.isLoading} fetching={detail.isFetching} skeleton={<Skeleton className="m-2 h-[180px]" />}>
              {detail.data?.energy.trend.length ? (
                <EChart option={trendArea(detail.data.energy.trend, { color: C.energy, avgLine: true })} height={180} ariaLabel="楼栋日电耗趋势" />
              ) : (
                <Empty title="暂无能耗数据" hint="能耗服务未返回该楼栋数据" className="py-8" />
              )}
            </Loadable>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<Wrench className="size-4" />}
            title={`未完成报修 · ${card?.name ?? ''}`}
            subtitle={
              detail.data
                ? `共 ${detail.data.tickets.stats.total} 单，闭环率 ${fmtPct(detail.data.tickets.stats.rate)}，按超时严重度排序`
                : undefined
            }
            actions={
              <Link to={`/repair?view=list&building=${selected}`} className="inline-flex items-center gap-1 text-caption font-medium text-brand-ink hover:underline">
                全部工单 <ArrowRight className="size-3" />
              </Link>
            }
          />
          <CardBody>
            <Loadable loading={detail.isLoading} fetching={detail.isFetching}>
              {detail.data?.tickets.open.length ? (
                <div className="scroll-thin grid max-h-[420px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {detail.data.tickets.open.slice(0, 30).map((t) => (
                    <TicketCard key={t.id} t={t} onOpen={setTicket} />
                  ))}
                </div>
              ) : (
                <Empty title="该楼栋暂无未完成报修" hint="所有工单均已闭环" />
              )}
            </Loadable>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            icon={<Construction className="size-4" />}
            title={`施工遗留缺陷 · ${card?.name ?? ''}`}
            subtitle={detail.data ? `共 ${detail.data.legacy.length} 项，未完成 ${detail.data.legacy.filter((x) => x.isOpen).length} 项，按风险排序` : undefined}
            actions={
              <Link to={`/legacy?building=${selected}`} className="inline-flex items-center gap-1 text-caption font-medium text-brand-ink hover:underline">
                攻坚台账 <ArrowRight className="size-3" />
              </Link>
            }
          />
          <CardBody>
            <Loadable loading={detail.isLoading} fetching={detail.isFetching}>
              {detail.data?.legacy.length ? (
                <div className="scroll-thin grid max-h-[420px] gap-2 overflow-y-auto pr-1">
                  {detail.data.legacy.map((i) => (
                    <LegacyCard key={i.id} item={i} onOpen={setLegacy} compact />
                  ))}
                </div>
              ) : (
                <Empty title="该楼栋无施工遗留问题" />
              )}
            </Loadable>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="楼栋一览" subtitle="全部 19 栋楼及公区 · 点击行切换上方联动视图" />
        <div className="scroll-thin overflow-x-auto pb-2">
          <BuildingTable items={items} selected={selected} onSelect={(c) => (setUrl({ b: c }), window.scrollTo({ top: 0, behavior: 'smooth' }))} />
        </div>
      </Card>

      <TicketDrawer ticket={ticket} onClose={() => setTicket(null)} />
      <LegacyDrawer item={legacy} onClose={() => setLegacy(null)} />
    </div>
  );
}

function score(b: BuildingCard) {
  return b.tickets.red * 10 + b.legacy.highRisk * 8 + b.tickets.yellow * 3 + b.tickets.open + b.legacy.open;
}

function Stat({
  icon,
  label,
  value,
  unit,
  tone,
  note,
  noteTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  tone: 'energy' | 'repair' | 'legacy';
  note?: string;
  noteTone?: 'crit' | 'warn';
}) {
  const ic = { energy: 'text-energy', repair: 'text-repair', legacy: 'text-legacy' }[tone];
  return (
    <div className="bg-surface px-5 py-3">
      <div className="flex items-center gap-1.5 text-caption text-ink-3">
        <span className={clsx('[&_svg]:size-3', ic)}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[22px] leading-7 font-semibold text-ink-1">{value}</span>
        <span className="text-caption text-ink-3">{unit}</span>
      </div>
      <div className={clsx('h-4 text-caption font-medium', noteTone === 'crit' ? 'text-crit-ink' : 'text-warn-ink')}>{note}</div>
    </div>
  );
}

function MapLegend({ metric }: { metric: MapMetric }) {
  if (metric === 'health')
    return (
      <div className="flex items-center gap-3 text-caption text-ink-2">
        {[
          ['#ffffff', '#d9dfe7', '正常'],
          ['#fff8e6', '#f2cf75', '关注（临期 / 遗留未完成）'],
          ['#fdeeee', '#ec9a9a', '告警（超时 / 高危遗留）'],
        ].map(([bg, bd, t]) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] border" style={{ background: bg, borderColor: bd }} />
            {t}
          </span>
        ))}
      </div>
    );
  const ramp = rampFor(metric);
  return (
    <div className="flex items-center gap-2 text-caption text-ink-3">
      低
      <span className="flex overflow-hidden rounded-[3px]">
        {ramp.map((c) => (
          <span key={c} className="h-3 w-5" style={{ background: c }} />
        ))}
      </span>
      高
    </div>
  );
}

function BuildingTable({ items, selected, onSelect }: { items: BuildingCard[]; selected: string; onSelect: (c: string) => void }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>楼栋</Th>
          <Th>状态</Th>
          <Th align="right">近 30 天电量 (kWh)</Th>
          <Th>近 14 天趋势</Th>
          <Th align="right">昨日 (kWh)</Th>
          <Th align="right">未完成报修</Th>
          <Th align="right">超时 / 临期</Th>
          <Th align="right">遗留未完成</Th>
          <Th align="right">高危遗留</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((b) => (
          <Tr key={b.code} onClick={() => onSelect(b.code)} className={clsx(b.code === selected && 'bg-brand-soft/50')}>
            <Td className="font-medium">
              {b.name}
              <span className="ml-1.5 text-caption font-normal text-ink-3">{b.kind === 'office' ? '办公' : b.kind === 'apartment' ? '公寓/配套' : ''}</span>
            </Td>
            <Td>
              <HealthBadge health={b.health} />
            </Td>
            <Td align="right">{fmtInt(b.energy.kwh30d)}</Td>
            <Td>
              <Sparkline values={b.energy.spark} width={96} height={22} stroke={C.energy} fill={false} />
            </Td>
            <Td align="right">{fmtInt(b.energy.yesterdayKwh)}</Td>
            <Td align="right">{b.tickets.open}</Td>
            <Td align="right">
              <span className={b.tickets.red ? 'font-semibold text-crit-ink' : 'text-ink-3'}>{b.tickets.red}</span>
              <span className="text-ink-4"> / </span>
              <span className={b.tickets.yellow ? 'text-warn-ink' : 'text-ink-3'}>{b.tickets.yellow}</span>
            </Td>
            <Td align="right">{b.legacy.open}</Td>
            <Td align="right" className={b.legacy.highRisk ? 'font-semibold text-crit-ink' : 'text-ink-3'}>
              {b.legacy.highRisk}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
