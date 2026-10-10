import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useState } from 'react';
import type { Ticket, TicketStats } from '@shared/contract';
import { EChart } from '@/components/charts/EChart';
import { C } from '@/components/charts/echarts';
import { categoryColumns, monthStack } from '@/components/charts/options';
import { OverdueGroups } from '@/components/tickets/OverdueGroups';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { TicketRow } from '@/components/tickets/TicketRow';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/Copy';
import { DateRange } from '@/components/ui/DateRange';
import { BuildingSelect, FilterBar, SearchInput, Select, Toggle } from '@/components/ui/Fields';
import { Meter } from '@/components/ui/Meter';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Stat, StatRow } from '@/components/ui/Stat';
import { OverdueText, StatusText } from '@/components/ui/Status';
import { Empty, ErrorState, failedWithoutData, Loadable, Skeleton } from '@/components/ui/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { download, type Query } from '@/lib/api';
import { buildingShort } from '@/lib/buildings';
import { fmtAge, fmtDateTime, fmtInt, fmtPct } from '@/lib/format';
import { useMeta, useTicketBoard, useTickets, useTicketStats } from '@/lib/queries';
import { remindGroup, remindText } from '@/lib/remind';
import { useUrlState } from '@/lib/url-state';

const KEYS = ['tab', 'building', 'type', 'channel', 'status', 'overdue', 'from', 'to', 'q', 'ex', 'page', 'sort'] as const;
type TabKey = 'remind' | 'open' | 'all' | 'stats';
type S = Record<(typeof KEYS)[number], string>;
type SetS = (p: Partial<Record<(typeof KEYS)[number], string | null>>) => void;

export default function RepairPage() {
  const [s, set, reset] = useUrlState(KEYS);
  const tab = (s.tab || 'remind') as TabKey;
  const meta = useMeta();
  const [open, setOpen] = useState<Ticket | null>(null);

  const filter: Query = {
    building: s.building,
    type: s.type,
    channel: s.channel,
    from: s.from,
    to: s.to,
    q: s.q,
    excludeSpecial: s.ex === '1' ? '1' : undefined,
  };
  const stats = useTicketStats(filter);
  const sm = stats.data?.summary;
  const active = !!(s.building || s.type || s.channel || s.from || s.to || s.q || s.status || s.overdue);
  const patch: SetS = (p) => set({ ...p, page: null });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-h1 font-semibold tight">维修</h1>
          <p className="mt-1 text-[14px] text-ink-3">飞书「日常维修总表」· 每日 06:15 自动同步</p>
        </div>
        <Toggle
          checked={s.ex === '1'}
          onChange={(v) => patch({ ex: v ? '1' : null })}
          label={`排除专项摸排${sm ? `（${sm.special} 单）` : ''}`}
          hint="排除「报修渠道 = 专项摸排」的现场集中排查单，用于计算物业班组日常纯运维绩效"
        />
      </div>

      <Tabs
        className="mt-6"
        value={tab}
        onChange={(v) => set({ tab: v === 'remind' ? null : v, page: null })}
        options={[
          { value: 'remind', label: '超时催办', count: sm ? sm.red + sm.yellow : undefined },
          { value: 'open', label: '在途工单', count: sm?.open },
          { value: 'all', label: '全部工单', count: sm ? fmtInt(sm.total) : undefined },
          { value: 'stats', label: '考核统计' },
        ]}
      />

      <FilterBar active={active} onReset={reset} className="mt-3">
        <DateRange from={s.from} to={s.to} onChange={(f, t) => patch({ from: f, to: t })} />
        <BuildingSelect meta={meta.data} value={s.building} onChange={(v) => patch({ building: v })} />
        <Select value={s.type} onChange={(v) => patch({ type: v })} placeholder="工种" label="工种" options={(meta.data?.ticketTypes ?? []).map((t) => ({ value: t.type, label: t.type }))} />
        <Select value={s.channel} onChange={(v) => patch({ channel: v })} placeholder="渠道" label="渠道" options={(meta.data?.channels ?? []).map((c) => ({ value: c, label: c }))} />
        <SearchInput value={s.q} onChange={(v) => patch({ q: v })} placeholder="搜索描述 / 备注" />
      </FilterBar>

      <div className="mt-6">
        {tab === 'remind' && <RemindTab filter={filter} onOpen={setOpen} />}
        {tab === 'open' && <OpenTab filter={filter} onOpen={setOpen} />}
        {tab === 'all' && <AllTab filter={filter} s={s} set={set} onOpen={setOpen} />}
        {tab === 'stats' &&
          (failedWithoutData(stats) ? (
            <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
          ) : (
            <StatsTab stats={stats.data} loading={stats.isLoading} fetching={stats.isFetching} onPick={patch} />
          ))}
      </div>

      <TicketDrawer ticket={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ── 超时催办 ── */
function RemindTab({ filter, onOpen }: { filter: Query; onOpen: (t: Ticket) => void }) {
  const [level, setLevel] = useState<'red' | 'any'>('red');
  const list = useTickets({ ...filter, overdue: level, pageSize: 200, sort: '-ageHours' });
  const items = list.data?.items ?? [];
  const copyAll = () => {
    const by = new Map<string, Ticket[]>();
    for (const t of items) by.set(remindGroup(t), [...(by.get(remindGroup(t)) ?? []), t]);
    return [...by.entries()].map(([g, xs]) => remindText(g, xs)).join('\n\n');
  };
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: 'red', label: '超时' },
            { value: 'any', label: '超时 + 临期' },
          ]}
        />
        <span className="text-[13px] text-ink-3">超时：待处理 &gt;72 小时、跟进中 &gt;15 天 · 临期：待处理 &gt;24 小时、跟进中 &gt;7 天</span>
        <span className="flex-1" />
        <CopyButton label="复制全部催办" text={copyAll} />
      </div>
      <Loadable query={list} fetching={list.isFetching} skeleton={<Skeleton className="h-96" />}>
        <div className="max-w-[960px]">
          <OverdueGroups tickets={items} onOpen={onOpen} limitPerGroup={12} />
        </div>
      </Loadable>
    </div>
  );
}

/* ── 在途工单（待处理 / 跟进中） ── */
function OpenTab({ filter, onOpen }: { filter: Query; onOpen: (t: Ticket) => void }) {
  const board = useTicketBoard(filter);
  if (board.isLoading) return <Skeleton className="h-96" />;
  const cols = (board.data?.columns ?? []).filter((c) => c.column !== '已完成');
  return (
    <div className={clsx('grid gap-x-12 gap-y-10 xl:grid-cols-2', board.isFetching && 'refetching')}>
      {cols.map((c) => (
        <Section
          key={c.column}
          title={c.column}
          count={c.count}
          desc={c.column === '待处理' ? '超过 24 小时标黄、72 小时标红' : '超过 7 天标黄、15 天标红（含幕墙专项）'}
          actions={
            <span className="flex gap-3 text-[13px]">
              {c.red > 0 && <span className="text-crit-ink">超时 {c.red}</span>}
              {c.yellow > 0 && <span className="text-warn-ink">临期 {c.yellow}</span>}
            </span>
          }
        >
          {c.items.length ? c.items.map((t) => <TicketRow key={t.id} t={t} onOpen={onOpen} showStatus={false} dense />) : <Empty title="暂无" />}
          {c.count > c.items.length && <p className="pt-3 text-[13px] text-ink-3">仅显示前 {c.items.length} 单，更多请到「全部工单」筛选</p>}
        </Section>
      ))}
    </div>
  );
}

/* ── 全部工单 ── */
function AllTab({ filter, s, set, onOpen }: { filter: Query; s: S; set: SetS; onOpen: (t: Ticket) => void }) {
  const meta = useMeta();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const page = Number(s.page) || 1;
  const pageSize = 50;
  const list = useTickets({ ...filter, status: s.status, overdue: s.overdue, page, pageSize, sort: s.sort || '-reportedAt' });
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const doExport = async () => {
    setExporting(true);
    try {
      await download('/tickets/export', { ...filter, status: s.status, overdue: s.overdue }, '工单明细.xlsx');
    } catch (e) {
      toast({ kind: 'error', title: '导出失败', body: (e as Error).message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Select
          value={s.status}
          onChange={(v) => set({ status: v, page: null })}
          placeholder="状态"
          label="状态"
          options={(meta.data?.ticketStatuses ?? ['待处理', '跟进中', '已完成', '幕墙专项']).map((x) => ({ value: x, label: x }))}
        />
        <Select
          value={s.overdue}
          onChange={(v) => set({ overdue: v, page: null })}
          placeholder="超时"
          label="超时"
          options={[
            { value: 'red', label: '超时' },
            { value: 'yellow', label: '临期' },
            { value: 'any', label: '超时 + 临期' },
          ]}
        />
        <Segmented
          value={s.sort || '-reportedAt'}
          onChange={(v) => set({ sort: v === '-reportedAt' ? null : v, page: null })}
          options={[
            { value: '-reportedAt', label: '最新' },
            { value: 'reportedAt', label: '最早' },
            { value: '-ageHours', label: '挂单最久' },
          ]}
        />
        <span className="flex-1" />
        <span className="num text-[13px] text-ink-3">{fmtInt(total)} 条</span>
        <Button icon={<Download />} loading={exporting} onClick={doExport}>
          导出 Excel
        </Button>
      </div>
      <Loadable query={list} fetching={list.isFetching}>
        <div className="scroll-thin overflow-x-auto">
          <Table className="min-w-[1000px]">
            <thead>
              <tr>
                <Th className="w-[76px]">位置</Th>
                <Th>问题描述</Th>
                <Th className="w-[140px]">工种</Th>
                <Th className="w-[96px]">状态</Th>
                <Th className="w-[100px]">挂单</Th>
                <Th className="w-[88px]">渠道</Th>
                <Th className="w-[136px]">报修时间</Th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((t) => (
                <Tr key={t.id} onClick={() => onOpen(t)}>
                  <Td className="num whitespace-nowrap text-ink-2">
                    {buildingShort(t.building)}
                    {t.floor && <span className="text-ink-3"> {t.floor}F</span>}
                  </Td>
                  <Td>
                    <span className="line-clamp-1" title={t.description}>
                      {t.description}
                    </span>
                  </Td>
                  <Td className="text-ink-2">{t.type}</Td>
                  <Td>
                    <StatusText status={t.status} />
                  </Td>
                  <Td>{t.column === '已完成' ? <span className="text-ink-4">—</span> : <OverdueText level={t.overdue} ageHours={t.ageHours} />}</Td>
                  <Td className="text-ink-2">{t.channel}</Td>
                  <Td className="num whitespace-nowrap text-ink-3">{fmtDateTime(t.reportedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {list.data && list.data.items.length === 0 && <Empty title="没有符合条件的工单" />}
        </div>
      </Loadable>
      <div className="flex items-center justify-end gap-2 pt-4">
        <span className="num text-[13px] text-ink-3">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" icon={<ChevronLeft />} disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="上一页" />
        <Button size="sm" variant="ghost" icon={<ChevronRight />} disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="下一页" />
      </div>
    </div>
  );
}

/* ── 考核统计 ── */
function StatsTab({ stats, loading, fetching, onPick }: { stats?: TicketStats; loading: boolean; fetching: boolean; onPick: SetS }) {
  if (loading || !stats) return <Skeleton className="h-[600px]" />;
  const sm = stats.summary;
  const blds = stats.byBuilding.filter((b) => b.total > 0);
  return (
    <div className={clsx(fetching && 'refetching')}>
      <StatRow className="grid-cols-2 lg:grid-cols-5">
        <Stat label="工单总数" value={fmtInt(sm.total)} unit="单" />
        <Stat label="闭环率" value={(sm.rate * 100).toFixed(1)} unit="%" sub={`已完成 ${fmtInt(sm.closed)}`} />
        <Stat label="在途" value={fmtInt(sm.open)} unit="单" sub={`平均挂单 ${fmtAge(sm.avgOpenAgeHours)}`} />
        <Stat label="超时" tone="crit" value={fmtInt(sm.red)} unit="单" />
        <Stat label="临期" tone="warn" value={fmtInt(sm.yellow)} unit="单" />
      </StatRow>

      <div className="mt-12 grid gap-x-14 gap-y-12 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section title="工种闭环率" desc="8 大标准工种 · 点击行筛选" flush>
          <Table>
            <thead>
              <tr>
                <Th>工种</Th>
                <Th>责任主体</Th>
                <Th align="right">总数</Th>
                <Th align="right">在途</Th>
                <Th className="w-[34%]">闭环率</Th>
              </tr>
            </thead>
            <tbody>
              {stats.byType.map((r) => (
                <Tr key={r.type} onClick={() => onPick({ type: r.type, tab: 'all' })}>
                  <Td className="font-medium">{r.type}</Td>
                  <Td className="text-ink-3">{r.owner ?? '—'}</Td>
                  <Td align="right">{fmtInt(r.total)}</Td>
                  <Td align="right" className={r.open ? '' : 'text-ink-4'}>
                    {r.open}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Meter value={r.rate} tone={r.rate < 0.8 ? 'warn' : 'accent'} className="flex-1" />
                      <span className="num w-12 text-right text-[13px]">{fmtPct(r.rate)}</span>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <div className="space-y-12">
          <Section title="责任主体">
            <div className="space-y-4">
              {stats.byOwner.map((o) => (
                <div key={o.owner}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[14px]">
                    <span>{o.owner}</span>
                    <span className="num text-[13px] text-ink-3">
                      {fmtInt(o.total)} 单 · <span className="font-medium text-ink-1">{fmtPct(o.rate)}</span>
                    </span>
                  </div>
                  <Meter value={o.rate} tone={o.rate < 0.8 ? 'warn' : 'accent'} />
                </div>
              ))}
            </div>
          </Section>
          <Section title="报修渠道">
            <div className="space-y-3">
              {stats.byChannel.map((c) => {
                const max = Math.max(...stats.byChannel.map((x) => x.total));
                return (
                  <button key={c.channel} onClick={() => onPick({ channel: c.channel, tab: 'all' })} className="block w-full text-left">
                    <div className="mb-1 flex items-baseline justify-between text-[14px]">
                      <span>{c.channel || '未填写'}</span>
                      <span className="num text-[13px] text-ink-3">{fmtInt(c.total)}</span>
                    </div>
                    <Meter value={c.total / max} tone="accent" />
                  </button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      <div className="mt-12 grid gap-x-14 gap-y-12 xl:grid-cols-2">
        <Section title="月度报修与闭环" desc="近 12 个月">
          <EChart option={monthStack(stats.byMonth)} height={260} ariaLabel="月度报修与闭环" />
        </Section>
        <Section title="楼栋报修量" desc="点击柱子筛选楼栋">
          <EChart
            option={categoryColumns(
              blds.map((b) => ({ name: buildingShort(b.building), value: b.total, sub: `闭环率 ${fmtPct(b.rate)} · 在途 ${b.open}` })),
              { color: C.accent, unit: ' 单' },
            )}
            height={260}
            onClick={(p) => onPick({ building: blds[p.dataIndex].building, tab: 'all' })}
            ariaLabel="楼栋报修量"
          />
        </Section>
      </div>
    </div>
  );
}
