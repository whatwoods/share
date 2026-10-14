import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { BuildingCard, LegacyItem, Ticket } from '@shared/contract';
import { MapLegend, ParkMap, type MapMetric } from '@/components/buildings/ParkMap';
import { EChart } from '@/components/charts/EChart';
import { C } from '@/components/charts/echarts';
import { trendArea } from '@/components/charts/options';
import { LegacyDrawer } from '@/components/legacy/LegacyDrawer';
import { LegacyRow } from '@/components/legacy/LegacyRow';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { TicketRow } from '@/components/tickets/TicketRow';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Sparkline } from '@/components/ui/Sparkline';
import { Stat } from '@/components/ui/Stat';
import { Empty, Loadable, Skeleton } from '@/components/ui/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { fmtInt, fmtPct, splitCompact } from '@/lib/format';
import { useBuildingDetail, useBuildingsOverview } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';

export default function BuildingsPage() {
  const [url, setUrl] = useUrlState(['b', 'm', 'tab'] as const);
  const metric = (url.m || 'status') as MapMetric;
  const tab = (url.tab || 'tickets') as 'tickets' | 'legacy';
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
  const d = detail.data;
  const openLegacy = d?.legacy.filter((x) => x.isOpen) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-h1 font-semibold tight">楼宇</h1>
          <p className="mt-1 text-[14px] text-ink-3">1~19 号楼及公区 · 点选楼栋查看用电、在途报修与施工遗留</p>
        </div>
        <MapLegend metric={metric} />
        <Segmented
          value={metric}
          onChange={(m) => setUrl({ m: m === 'status' ? null : m })}
          options={[
            { value: 'status', label: '问题分布' },
            { value: 'energy', label: '用电强度' },
          ]}
        />
      </div>

      <div className="mt-6 grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]">
        <div className="min-w-0">
          {overview.isLoading ? <Skeleton className="aspect-[16/8.4] w-full" /> : <ParkMap items={items} selected={selected} onSelect={(c) => setUrl({ b: c })} metric={metric} />}

          <Section title="楼栋一览" className="mt-10" flush>
            <div className="scroll-thin overflow-x-auto">
              <BuildingTable items={items} selected={selected} onSelect={(c) => (setUrl({ b: c }), window.scrollTo({ top: 0, behavior: 'smooth' }))} />
            </div>
          </Section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[28px] leading-9 font-semibold tight">{card?.name ?? d?.building.name ?? '—'}</h2>
            <span className="text-[14px] text-ink-3">
              {card?.kind === 'office' ? '办公区' : card?.kind === 'apartment' ? '生活区' : card?.kind === 'public' ? '公共区域 · 设备用房' : ''}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-4 border-y border-line py-4">
            <Stat size="md" label="近30天" value={splitCompact(card?.energy.kwh30d, 'kWh').value} unit={splitCompact(card?.energy.kwh30d, 'kWh').unit} />
            <Stat size="md" label="昨日" value={fmtInt(card?.energy.yesterdayKwh)} unit="kWh" />
            <Stat size="md" label="在途报修" value={fmtInt(card?.tickets.open)} tone={card?.tickets.red ? 'crit' : undefined} sub={card?.tickets.red ? `超时 ${card.tickets.red}` : undefined} />
            <Stat size="md" label="遗留未闭环" value={fmtInt(card?.legacy.open)} tone={card?.legacy.highRisk ? 'violet' : undefined} sub={card?.legacy.highRisk ? `高危 ${card.legacy.highRisk}` : undefined} />
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between text-[13px] text-ink-3">
              <span>近 30 天日用电 · kWh</span>
              <Link to={`/energy`} className="hover:text-ink-1">
                能耗详情 →
              </Link>
            </div>
            <Loadable loading={detail.isLoading} fetching={detail.isFetching} skeleton={<Skeleton className="mt-2 h-[150px]" />}>
              {d?.energy.trend.length ? (
                <EChart option={trendArea(d.energy.trend, { color: C.accent, avgLine: true })} height={150} ariaLabel="楼栋日用电趋势" />
              ) : (
                <Empty title="能耗服务未返回该楼栋数据" className="py-6" />
              )}
            </Loadable>
          </div>

          <Tabs
            className="mt-6"
            value={tab}
            onChange={(v) => setUrl({ tab: v === 'tickets' ? null : v })}
            options={[
              { value: 'tickets', label: '在途报修', count: d?.tickets.open.length },
              { value: 'legacy', label: '施工遗留', count: openLegacy.length },
            ]}
          />
          <div className="scroll-thin max-h-[440px] overflow-y-auto pt-2 xl:max-h-[calc(100dvh-560px)] xl:min-h-[220px]">
            <Loadable loading={detail.isLoading} fetching={detail.isFetching}>
              {tab === 'tickets' ? (
                d?.tickets.open.length ? (
                  <>
                    {d.tickets.open.map((t) => (
                      <TicketRow key={t.id} t={t} onOpen={setTicket} dense />
                    ))}
                    <p className="pt-3 text-[12px] text-ink-3">
                      该楼累计 {fmtInt(d.tickets.stats.total)} 单，闭环率 {fmtPct(d.tickets.stats.rate)} ·{' '}
                      <Link to={`/repair?tab=all&building=${selected}`} className="text-ink-2 hover:text-ink-1">
                        查看全部 →
                      </Link>
                    </p>
                  </>
                ) : (
                  <Empty title="没有在途报修" />
                )
              ) : openLegacy.length ? (
                openLegacy.map((i) => <LegacyRow key={i.id} item={i} onOpen={setLegacy} />)
              ) : (
                <Empty title="没有未闭环的施工遗留" />
              )}
            </Loadable>
          </div>
        </aside>
      </div>

      <TicketDrawer ticket={ticket} onClose={() => setTicket(null)} />
      <LegacyDrawer item={legacy} onClose={() => setLegacy(null)} />
    </div>
  );
}

function score(b: BuildingCard) {
  return b.tickets.red * 10 + b.legacy.highRisk * 8 + b.tickets.yellow * 3 + b.tickets.open + b.legacy.open;
}

function BuildingTable({ items, selected, onSelect }: { items: BuildingCard[]; selected: string; onSelect: (c: string) => void }) {
  return (
    <Table className="min-w-[720px]">
      <thead>
        <tr>
          <Th>楼栋</Th>
          <Th align="right">近30天 kWh</Th>
          <Th>近14天</Th>
          <Th align="right">在途报修</Th>
          <Th align="right">超时</Th>
          <Th align="right">遗留未闭环</Th>
          <Th align="right">高危</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((b) => (
          <Tr key={b.code} onClick={() => onSelect(b.code)} className={clsx(b.code === selected && 'bg-subtle')}>
            <Td className="font-medium">{b.name}</Td>
            <Td align="right">{fmtInt(b.energy.kwh30d)}</Td>
            <Td>
              <Sparkline values={b.energy.spark} width={88} height={20} stroke="#8f8f8f" fill={false} />
            </Td>
            <Td align="right">{b.tickets.open || <span className="text-ink-4">0</span>}</Td>
            <Td align="right" className={b.tickets.red ? 'font-medium text-crit-ink' : 'text-ink-4'}>
              {b.tickets.red}
            </Td>
            <Td align="right">{b.legacy.open || <span className="text-ink-4">0</span>}</Td>
            <Td align="right" className={b.legacy.highRisk ? 'font-medium text-violet-ink' : 'text-ink-4'}>
              {b.legacy.highRisk}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
