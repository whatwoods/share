import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, Hourglass, ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BoardColumn, Meta, Ticket, TicketStats } from '@shared/contract';
import { EChart } from '@/components/charts/EChart';
import { C } from '@/components/charts/echarts';
import { categoryColumns, dayColumns, monthStack, rankBars } from '@/components/charts/options';
import { TicketCard } from '@/components/tickets/TicketCard';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { Badge, OverdueBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DateRange } from '@/components/ui/DateRange';
import { FilterBar, SearchInput, Select, Toggle } from '@/components/ui/Fields';
import { KpiCard } from '@/components/ui/KpiCard';
import { Meter } from '@/components/ui/Meter';
import { Segmented } from '@/components/ui/Segmented';
import { Empty, Loadable, Skeleton } from '@/components/ui/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { download, type Query } from '@/lib/api';
import { buildingShort } from '@/lib/buildings';
import { fmtAge, fmtDateTime, fmtInt, fmtPct } from '@/lib/format';
import { useMeta, useTicketBoard, useTickets, useTicketStats } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';

const KEYS = ['view', 'building', 'type', 'channel', 'status', 'overdue', 'from', 'to', 'q', 'ex', 'page', 'sort'] as const;
type View = 'board' | 'stats' | 'list';

export default function RepairPage() {
  const [s, set, reset] = useUrlState(KEYS);
  const view = (s.view || 'board') as View;
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
  const active = !!(s.building || s.type || s.channel || s.from || s.to || s.q || s.ex || s.status || s.overdue);
  const patch = (p: Partial<Record<(typeof KEYS)[number], string | null>>) => set({ ...p, page: null });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<View>
          value={view}
          onChange={(v) => set({ view: v === 'board' ? null : v })}
          options={[
            { value: 'board', label: '待办看板' },
            { value: 'stats', label: '考核统计' },
            { value: 'list', label: '全量明细' },
          ]}
        />
        <div className="h-5 w-px bg-line" />
        <Toggle
          checked={s.ex === '1'}
          onChange={(v) => patch({ ex: v ? '1' : null })}
          label="排除专项摸排工单"
          hint="排除「报修渠道 = 专项摸排」的现场集中排查单，用于计算物业班组日常纯运维绩效"
        />
        {stats.data && (
          <span className="text-caption text-ink-3">
            {s.ex === '1' ? `已排除 ${stats.data.summary.special} 单专项摸排` : `含专项摸排 ${stats.data.summary.special} 单`}
          </span>
        )}
      </div>

      <FilterBar active={active} onReset={reset}>
        <DateRange from={s.from} to={s.to} onChange={(f, t) => patch({ from: f, to: t })} />
        <BuildingSelect meta={meta.data} value={s.building} onChange={(v) => patch({ building: v })} />
        <Select
          value={s.type}
          onChange={(v) => patch({ type: v })}
          placeholder="全部工种"
          width={156}
          options={(meta.data?.ticketTypes ?? []).map((t) => ({ value: t.type, label: t.type }))}
        />
        <Select
          value={s.channel}
          onChange={(v) => patch({ channel: v })}
          placeholder="全部渠道"
          width={124}
          options={(meta.data?.channels ?? []).map((c) => ({ value: c, label: c }))}
        />
        <SearchInput value={s.q} onChange={(v) => patch({ q: v })} placeholder="搜索描述 / 备注 / 楼层" />
      </FilterBar>

      <KpiRow stats={stats.data?.summary} loading={stats.isLoading} onOverdue={(lv) => set({ view: 'list', overdue: lv, page: null })} />

      {view === 'board' && <Board filter={filter} onOpen={setOpen} />}
      {view === 'stats' && <Stats stats={stats.data} loading={stats.isLoading} fetching={stats.isFetching} onPick={patch} />}
      {view === 'list' && <List filter={filter} s={s} set={set} onOpen={setOpen} />}

      <TicketDrawer ticket={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export function BuildingSelect({ meta, value, onChange, width = 112 }: { meta?: Meta; value: string; onChange: (v: string) => void; width?: number }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder="全部楼栋"
      width={width}
      options={(meta?.buildings ?? []).map((b) => ({ value: b.code, label: b.name }))}
    />
  );
}

function KpiRow({ stats, loading, onOverdue }: { stats?: TicketStats['summary']; loading: boolean; onOverdue: (lv: 'red' | 'yellow') => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiCard loading={loading} label="工单总数" value={fmtInt(stats?.total)} unit="单" icon={<ListChecks />} accent="repair" foot={stats && `已完成 ${fmtInt(stats.closed)}`} />
      <KpiCard
        loading={loading}
        label="闭环率"
        value={stats ? (stats.rate * 100).toFixed(1) : '—'}
        unit="%"
        icon={<CheckCircle2 />}
        accent="good"
        foot={stats && <Meter value={stats.rate} tone="repair" className="mt-1 w-28" />}
      />
      <KpiCard loading={loading} label="未完成" value={fmtInt(stats?.open)} unit="单" icon={<Hourglass />} accent="building" foot={stats && `平均挂单 ${fmtAge(stats.avgOpenAgeHours)}`} />
      <KpiCard loading={loading} label="红色超时" value={fmtInt(stats?.red)} unit="单" icon={<AlertTriangle />} accent="crit" foot="待处理 >72h · 跟进中 >15天" onClick={() => onOverdue('red')} />
      <KpiCard loading={loading} label="黄色临期" value={fmtInt(stats?.yellow)} unit="单" icon={<Clock />} accent="warn" foot="待处理 >24h · 跟进中 >7天" onClick={() => onOverdue('yellow')} />
    </div>
  );
}

/* ─────────── 看板 ─────────── */

const COL_META: Record<BoardColumn, { dot: string; hint: string }> = {
  待处理: { dot: 'bg-warn', hint: '>24h 黄 · >72h 红' },
  跟进中: { dot: 'bg-info', hint: '>7天 黄 · >15天 红（含幕墙专项）' },
  已完成: { dot: 'bg-good', hint: '最近闭环' },
};

function Board({ filter, onOpen }: { filter: Query; onOpen: (t: Ticket) => void }) {
  const board = useTicketBoard(filter);
  if (board.isLoading)
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[520px]" />
        ))}
      </div>
    );
  return (
    <div className={clsx('grid gap-4 lg:grid-cols-3', board.isFetching && 'refetching')}>
      {board.data?.columns.map((col) => (
        <section key={col.column} className="flex min-w-0 flex-col rounded-[14px] border border-line bg-subtle">
          <header className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
            <span className={clsx('size-2 rounded-full', COL_META[col.column].dot)} />
            <h3 className="text-h2 font-semibold text-ink-1">{col.column}</h3>
            <span className="num rounded-full bg-surface px-2 text-caption font-medium text-ink-2 shadow-card">{fmtInt(col.count)}</span>
            <span className="flex-1" />
            {col.red > 0 && <Badge tone="crit">超时 {col.red}</Badge>}
            {col.yellow > 0 && <Badge tone="warn">临期 {col.yellow}</Badge>}
          </header>
          <p className="px-4 pb-2 text-micro text-ink-3">{COL_META[col.column].hint}</p>
          <div className="scroll-thin flex max-h-[calc(100dvh-380px)] min-h-[320px] flex-col gap-2 overflow-y-auto px-3 pb-3">
            {col.items.length ? col.items.map((t) => <TicketCard key={t.id} t={t} onOpen={onOpen} />) : <Empty title="暂无工单" className="py-16" />}
            {col.count > col.items.length && (
              <p className="py-2 text-center text-caption text-ink-3">
                仅显示前 {col.items.length} 单，更多请在「全量明细」中筛选
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ─────────── 统计 ─────────── */

function Stats({
  stats,
  loading,
  fetching,
  onPick,
}: {
  stats?: TicketStats;
  loading: boolean;
  fetching: boolean;
  onPick: (p: Partial<Record<'building' | 'type' | 'channel', string>>) => void;
}) {
  const typeRows = useMemo(() => stats?.byType ?? [], [stats]);
  if (loading || !stats) return <Skeleton className="h-[600px]" />;
  return (
    <div className={clsx('space-y-4', fetching && 'refetching')}>
      <Card>
        <CardHeader title="8 大标准工种 · 闭环率" subtitle="点击工种卡片可筛选到该工种" />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {typeRows.map((r, i) => (
              <button
                key={r.type}
                onClick={() => onPick({ type: r.type })}
                className="rounded-[12px] border border-line p-3.5 text-left transition-colors hover:border-repair/40 hover:bg-repair-soft/30"
              >
                <div className="flex items-center gap-2">
                  <span className="num grid size-5 place-items-center rounded-[6px] bg-repair-soft text-micro font-semibold text-repair">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-body font-medium text-ink-1">{r.type}</span>
                  {r.owner && <span className="text-micro text-ink-3">{r.owner}</span>}
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="num text-[22px] leading-7 font-semibold text-ink-1">{fmtPct(r.rate)}</span>
                  <span className="num text-caption text-ink-3">
                    {fmtInt(r.closed)} / {fmtInt(r.total)}
                  </span>
                </div>
                <Meter value={r.rate} tone={r.rate < 0.8 ? 'warn' : 'repair'} className="mt-2" />
                <div className="mt-2 text-caption text-ink-3">
                  未完成 <span className={clsx('num font-medium', r.open ? 'text-ink-1' : '')}>{r.open}</span>
                </div>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="月度报修与闭环" subtitle="近 12 个月 · 柱高 = 当月新增报修" />
          <CardBody>
            <EChart option={monthStack(stats.byMonth)} height={280} ariaLabel="月度报修与闭环" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="近 30 天每日新增报修" />
          <CardBody>
            <EChart option={dayColumns(stats.byDay)} height={280} ariaLabel="每日新增报修" />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="楼栋报修量" subtitle="点击柱子筛选楼栋" />
          <CardBody>
            <EChart
              option={categoryColumns(
                stats.byBuilding.filter((b) => b.total > 0).map((b) => ({ name: buildingShort(b.building), value: b.total, sub: `闭环率 ${fmtPct(b.rate)} · 未完成 ${b.open}` })),
                { color: C.repair, unit: ' 单' },
              )}
              height={260}
              onClick={(p) => onPick({ building: stats.byBuilding.filter((b) => b.total > 0)[p.dataIndex].building })}
              ariaLabel="楼栋报修量"
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="责任主体" subtitle="按工种归属汇总" />
          <CardBody className="space-y-3.5">
            {stats.byOwner.map((o) => (
              <div key={o.owner}>
                <div className="mb-1 flex items-baseline justify-between text-body">
                  <span className="font-medium text-ink-1">{o.owner}</span>
                  <span className="num text-caption text-ink-3">
                    {fmtInt(o.total)} 单 · <span className="font-medium text-ink-1">{fmtPct(o.rate)}</span>
                  </span>
                </div>
                <Meter value={o.rate} tone={o.rate < 0.8 ? 'warn' : 'repair'} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="报修渠道" subtitle="点击筛选渠道" />
          <CardBody>
            <EChart
              option={rankBars(
                stats.byChannel.map((c) => ({ name: c.channel || '未填', value: c.total, sub: `闭环率 ${fmtPct(c.rate)}` })),
                { color: C.repair, unit: '单' },
              )}
              height={Math.max(160, stats.byChannel.length * 34)}
              onClick={(p) => onPick({ channel: [...stats.byChannel].reverse()[p.dataIndex].channel })}
              ariaLabel="报修渠道"
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="楼栋闭环率明细" />
          <div className="scroll-thin max-h-[320px] overflow-auto">
            <Table>
              <thead>
                <tr>
                  <Th>楼栋</Th>
                  <Th align="right">总数</Th>
                  <Th align="right">未完成</Th>
                  <Th align="right">超时</Th>
                  <Th>闭环率</Th>
                </tr>
              </thead>
              <tbody>
                {stats.byBuilding
                  .filter((b) => b.total > 0)
                  .map((b) => (
                    <Tr key={b.building} onClick={() => onPick({ building: b.building })}>
                      <Td className="font-medium">{buildingShort(b.building)}</Td>
                      <Td align="right">{fmtInt(b.total)}</Td>
                      <Td align="right">{b.open}</Td>
                      <Td align="right" className={b.red ? 'font-semibold text-crit-ink' : 'text-ink-3'}>
                        {b.red}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Meter value={b.rate} tone={b.rate < 0.8 ? 'warn' : 'repair'} className="w-24" />
                          <span className="num text-caption text-ink-2">{fmtPct(b.rate)}</span>
                        </div>
                      </Td>
                    </Tr>
                  ))}
              </tbody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─────────── 明细 ─────────── */

function List({
  filter,
  s,
  set,
  onOpen,
}: {
  filter: Query;
  s: Record<(typeof KEYS)[number], string>;
  set: (p: Partial<Record<(typeof KEYS)[number], string | null>>) => void;
  onOpen: (t: Ticket) => void;
}) {
  const meta = useMeta();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const page = Number(s.page) || 1;
  const pageSize = 50;
  const q: Query = { ...filter, status: s.status, overdue: s.overdue, page, pageSize, sort: s.sort || '-reportedAt' };
  const list = useTickets(q);
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
    <Card>
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-3">
        <Select
          value={s.status}
          onChange={(v) => set({ status: v, page: null })}
          placeholder="全部状态"
          width={112}
          options={(meta.data?.ticketStatuses ?? ['待处理', '跟进中', '已完成', '幕墙专项']).map((x) => ({ value: x, label: x }))}
        />
        <Select
          value={s.overdue}
          onChange={(v) => set({ overdue: v, page: null })}
          placeholder="超时等级"
          width={112}
          options={[
            { value: 'red', label: '红色超时' },
            { value: 'yellow', label: '黄色临期' },
            { value: 'any', label: '红 + 黄' },
          ]}
        />
        <Segmented
          size="sm"
          value={s.sort || '-reportedAt'}
          onChange={(v) => set({ sort: v === '-reportedAt' ? null : v, page: null })}
          options={[
            { value: '-reportedAt', label: '最新报修' },
            { value: 'reportedAt', label: '最早报修' },
            { value: '-ageHours', label: '挂单最久' },
          ]}
        />
        <span className="flex-1" />
        <span className="num text-caption text-ink-3">共 {fmtInt(total)} 条</span>
        <Button size="md" icon={<Download className="size-3.5" />} loading={exporting} onClick={doExport}>
          导出 Excel
        </Button>
      </div>
      <Loadable loading={list.isLoading} fetching={list.isFetching} error={list.error}>
        <div className="scroll-thin overflow-x-auto">
          <Table className="min-w-[1080px]">
            <thead>
              <tr>
                <Th className="w-[84px]">楼栋/楼层</Th>
                <Th>问题描述</Th>
                <Th className="w-[140px]">工种</Th>
                <Th className="w-[92px]">状态</Th>
                <Th className="w-[120px]">超时</Th>
                <Th className="w-[96px]">渠道</Th>
                <Th className="w-[136px]">报修时间</Th>
                <Th className="w-[200px]">备注</Th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((t) => (
                <Tr key={t.id} onClick={() => onOpen(t)}>
                  <Td className="num font-medium whitespace-nowrap">
                    {buildingShort(t.building)}
                    {t.floor && <span className="font-normal text-ink-3"> {t.floor}F</span>}
                  </Td>
                  <Td>
                    <span className="line-clamp-1" title={t.description}>
                      {t.description}
                    </span>
                  </Td>
                  <Td className="text-ink-2">{t.type}</Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td>{t.overdue !== 'none' ? <OverdueBadge level={t.overdue} ageHours={t.ageHours} /> : <span className="text-ink-4">—</span>}</Td>
                  <Td className="text-ink-2">
                    {t.channel}
                  </Td>
                  <Td className="num whitespace-nowrap text-ink-2">{fmtDateTime(t.reportedAt)}</Td>
                  <Td className="text-ink-3">
                    <span className="line-clamp-1" title={t.remark}>
                      {t.remark}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {list.data && list.data.items.length === 0 && <Empty title="没有符合条件的工单" hint="试试调整筛选条件" />}
        </div>
      </Loadable>
      <div className="flex items-center justify-end gap-2 px-5 py-3">
        <span className="num text-caption text-ink-3">
          第 {page} / {pages} 页
        </span>
        <Button size="sm" variant="secondary" icon={<ChevronLeft className="size-3.5" />} disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
          上一页
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>
          下一页
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </Card>
  );
}
