import clsx from 'clsx';
import { AlertOctagon, Columns3, Download, FileSpreadsheet, Flame, Gavel, List, Radar, Repeat, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LegacyGroup, LegacyItem, LegacySummary } from '@shared/contract';
import { LegacyCard } from '@/components/legacy/LegacyCard';
import { LegacyDrawer } from '@/components/legacy/LegacyDrawer';
import { Badge, RiskBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { FilterBar, SearchInput, Select, Toggle } from '@/components/ui/Fields';
import { KpiCard } from '@/components/ui/KpiCard';
import { Segmented } from '@/components/ui/Segmented';
import { Empty, Loadable, Skeleton } from '@/components/ui/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { download } from '@/lib/api';
import { buildingShort } from '@/lib/buildings';
import { fmtDays, fmtInt } from '@/lib/format';
import { useLegacy, useLegacySummary, useMeta } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';
import { BuildingSelect } from './Repair';

const KEYS = ['group', 'status', 'building', 'q', 'all', 'view'] as const;
const GROUP_ORDER: LegacyGroup[] = ['DECAI', 'SCG', 'QIJU', 'LEAK', 'DISPUTE', 'OTHER'];
const GROUP_ICON: Record<LegacyGroup, React.ReactNode> = {
  DECAI: <Gavel />,
  SCG: <Gavel />,
  QIJU: <Gavel />,
  LEAK: <Repeat />,
  DISPUTE: <Scale />,
  OTHER: <AlertOctagon />,
};

export default function LegacyPage() {
  const [s, set, reset] = useUrlState(KEYS);
  const meta = useMeta();
  const summary = useLegacySummary();
  const list = useLegacy({ group: s.group, status: s.status, building: s.building, q: s.q, open: s.all === '1' ? undefined : '1' });
  const [open, setOpen] = useState<LegacyItem | null>(null);
  const toast = useToast();
  const [exporting, setExporting] = useState<string | null>(null);
  const view = (s.view || 'columns') as 'columns' | 'table';

  const groups = useMemo(() => (summary.data?.groups ?? []).filter((g) => g.total > 0).sort((a, b) => GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key)), [summary.data]);

  const doExport = async (group: string) => {
    setExporting(group);
    try {
      await download('/legacy/export', { group, open: s.all === '1' ? undefined : '1' }, '施工遗留索赔清单.xlsx');
      toast({ kind: 'success', title: '索赔清单已生成', body: '已按施工单位格式化，可直接用于例会协调与法务索赔' });
    } catch (e) {
      toast({ kind: 'error', title: '导出失败', body: (e as Error).message });
    } finally {
      setExporting(null);
    }
  };

  const sm = summary.data;
  const repeatLeak = sm?.byStatus.find((x) => x.status === '重复漏水')?.count ?? 0;
  const disputed = sm?.groups.find((g) => g.key === 'DISPUTE');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard loading={summary.isLoading} label="专项台账总数" value={fmtInt(sm?.total)} unit="项" icon={<FileSpreadsheet />} accent="legacy" foot="久拖未决历史遗留单" />
        <KpiCard loading={summary.isLoading} label="未闭环" value={fmtInt(sm?.open)} unit="项" icon={<AlertOctagon />} accent="building" foot={sm && `闭环 ${sm.total - sm.open} 项`} />
        <KpiCard loading={summary.isLoading} label="高危隐患" value={fmtInt(sm?.radar.length)} unit="项" icon={<Flame />} accent="crit" foot="外立面玻璃 · 排污堵塞等" />
        <KpiCard loading={summary.isLoading} label="重复漏水" value={fmtInt(repeatLeak)} unit="项" icon={<Repeat />} accent="warn" foot="多次处理仍复发" />
        <KpiCard
          loading={summary.isLoading}
          label="争议待定责"
          value={fmtInt(disputed?.open)}
          unit="项"
          icon={<Scale />}
          accent="legacy"
          foot="责任主体待明确，需上会"
          onClick={() => set({ group: 'DISPUTE' })}
        />
      </div>

      <RadarCard summary={sm} loading={summary.isLoading} onOpen={setOpen} />

      <Card>
        <CardHeader
          title="按施工单位切片对账"
          subtitle="每个单位的挂账清单 · 一键生成格式化 Excel 索赔清单"
          actions={
            <Button variant="primary" icon={<Download className="size-3.5" />} loading={exporting === 'ALL'} onClick={() => doExport('ALL')}>
              导出全部单位对账单
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {groups.map((g) => {
              const active = s.group === g.key;
              return (
                <div
                  key={g.key}
                  className={clsx(
                    'group relative rounded-[12px] border p-3.5 transition-colors',
                    active ? 'border-legacy/50 bg-legacy-soft/50 ring-2 ring-legacy/15' : 'border-line hover:border-legacy/30',
                  )}
                >
                  <button className="absolute inset-0 rounded-[12px]" aria-label={`筛选 ${g.label}`} onClick={() => set({ group: active ? null : g.key })} />
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-[7px] bg-legacy-soft text-legacy [&_svg]:size-3.5">{GROUP_ICON[g.key]}</span>
                    <span className="text-body font-semibold text-ink-1">{g.label}</span>
                    <span className="flex-1" />
                    <button
                      className="relative z-[1] rounded-md p-1 text-ink-3 hover:bg-surface hover:text-legacy"
                      title={`导出 ${g.label} 索赔清单`}
                      aria-label={`导出 ${g.label} 索赔清单`}
                      onClick={() => doExport(g.key)}
                      disabled={!!exporting}
                    >
                      <Download className={clsx('size-3.5', exporting === g.key && 'animate-pulse')} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="num text-[24px] leading-8 font-semibold text-ink-1">{g.total}</span>
                    <span className="text-caption text-ink-3">单</span>
                    <span className="flex-1" />
                    <span className="text-caption text-ink-2">
                      未闭环 <b className="num font-semibold text-ink-1">{g.open}</b>
                    </span>
                  </div>
                  <StatusStrip byStatus={g.byStatus} total={g.total} />
                  {g.highRisk > 0 && (
                    <div className="mt-2 text-caption font-medium text-crit-ink">
                      <Flame className="mr-0.5 inline size-3" />
                      高危 {g.highRisk} 项
                    </div>
                  )}
                </div>
              );
            })}
            {summary.isLoading && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[132px]" />)}
          </div>

          <FilterBar active={!!(s.group || s.status || s.building || s.q || s.all)} onReset={reset}>
            <Segmented
              value={view}
              onChange={(v) => set({ view: v === 'columns' ? null : v })}
              options={[
                { value: 'columns', label: <span className="inline-flex items-center gap-1"><Columns3 className="size-3.5" />分栏</span> },
                { value: 'table', label: <span className="inline-flex items-center gap-1"><List className="size-3.5" />列表</span> },
              ]}
            />
            <Select
              value={s.status}
              onChange={(v) => set({ status: v })}
              placeholder="全部状态"
              width={112}
              options={(meta.data?.legacyStatuses ?? []).map((x) => ({ value: x, label: x }))}
            />
            <BuildingSelect meta={meta.data} value={s.building} onChange={(v) => set({ building: v })} />
            <SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="搜索问题 / 进展 / 卡点" />
            <Toggle checked={s.all === '1'} onChange={(v) => set({ all: v ? '1' : null })} label="包含已完成" />
          </FilterBar>

          <Loadable loading={list.isLoading} fetching={list.isFetching} error={list.error}>
            {list.data && list.data.items.length === 0 ? (
              <Empty title="没有符合条件的遗留问题" />
            ) : view === 'columns' ? (
              <GroupColumns items={list.data?.items ?? []} groups={groups.filter((g) => !s.group || g.key === s.group)} onOpen={setOpen} />
            ) : (
              <LegacyTable items={list.data?.items ?? []} onOpen={setOpen} />
            )}
          </Loadable>
        </CardBody>
      </Card>

      <LegacyDrawer item={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function StatusStrip({ byStatus, total }: { byStatus: { status: string; count: number }[]; total: number }) {
  const color: Record<string, string> = {
    已完成: '#0ca30c',
    跟进中: '#2563eb',
    观察中: '#8a94a6',
    未处理: '#e9a100',
    计划逾期: '#d03b3b',
    重复漏水: '#d03b3b',
    有争议: '#6250d6',
  };
  return (
    <div className="mt-2.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full" title={byStatus.map((x) => `${x.status} ${x.count}`).join(' · ')}>
      {byStatus.map((x) => (
        <span key={x.status} style={{ width: `${(x.count / Math.max(1, total)) * 100}%`, background: color[x.status] ?? '#b4bccb' }} />
      ))}
    </div>
  );
}

function RadarCard({ summary, loading, onOpen }: { summary?: LegacySummary; loading: boolean; onOpen: (i: LegacyItem) => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-crit/10 bg-gradient-to-r from-crit-soft/70 to-transparent px-5 py-3.5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-crit text-white">
          <Radar className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 font-semibold text-ink-1">高危隐患雷达</h2>
          <p className="text-caption text-ink-2">高空外立面玻璃、后厨排污堵塞、重复渗漏、责任未定等硬骨头置顶 · 风险分按关键词、状态、挂账时长综合计算</p>
        </div>
        {summary && <Badge tone="crit">{summary.radar.length} 项</Badge>}
      </div>
      <CardBody className="pt-4">
        {loading ? (
          <Skeleton className="h-40" />
        ) : summary?.radar.length ? (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {summary.radar.map((i) => (
              <LegacyCard key={i.id} item={i} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <Empty title="暂无高危隐患" />
        )}
      </CardBody>
    </Card>
  );
}

function GroupColumns({
  items,
  groups,
  onOpen,
}: {
  items: LegacyItem[];
  groups: { key: LegacyGroup; label: string }[];
  onOpen: (i: LegacyItem) => void;
}) {
  const by = new Map<LegacyGroup, LegacyItem[]>();
  for (const i of items) by.set(i.group, [...(by.get(i.group) ?? []), i]);
  const cols = groups.filter((g) => by.get(g.key)?.length);
  return (
    <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {cols.map((g) => {
        const xs = by.get(g.key) ?? [];
        return (
          <section key={g.key} className={clsx('flex shrink-0 flex-col rounded-[14px] border border-line bg-subtle', cols.length === 1 ? 'w-full' : 'w-[340px]')}>
            <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
              <h3 className="text-body font-semibold text-ink-1">{g.label}</h3>
              <span className="num rounded-full bg-surface px-2 text-caption text-ink-2 shadow-card">{xs.length}</span>
            </header>
            <div className={clsx('scroll-thin max-h-[640px] gap-2 overflow-y-auto px-2.5 pb-2.5', cols.length === 1 ? 'grid md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col')}>
              {xs.map((i) => (
                <LegacyCard key={i.id} item={i} onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LegacyTable({ items, onOpen }: { items: LegacyItem[]; onOpen: (i: LegacyItem) => void }) {
  return (
    <div className="scroll-thin -mx-5 overflow-x-auto">
      <Table className="min-w-[1100px]">
        <thead>
          <tr>
            <Th className="w-14">序号</Th>
            <Th className="w-24">单位</Th>
            <Th className="w-20">楼栋</Th>
            <Th>问题描述</Th>
            <Th className="w-24">状态</Th>
            <Th className="w-[84px]">风险</Th>
            <Th className="w-[280px]">进展 / 卡点</Th>
            <Th className="w-20" align="right">挂账</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <Tr key={i.id} onClick={() => onOpen(i)}>
              <Td className="num text-ink-3">{i.seq ?? '—'}</Td>
              <Td className="text-ink-2">{i.unit}</Td>
              <Td className="num font-medium">
                {buildingShort(i.building)}
                {i.floor && <span className="font-normal text-ink-3"> {i.floor}F</span>}
              </Td>
              <Td>
                <span className="line-clamp-1 font-medium" title={i.description}>
                  {i.description}
                </span>
              </Td>
              <Td>
                <StatusBadge status={i.status} />
              </Td>
              <Td>
                <RiskBadge level={i.risk.level} />
              </Td>
              <Td className="text-ink-2">
                <span className="line-clamp-1" title={i.progress}>
                  {i.progress || '—'}
                </span>
              </Td>
              <Td align="right" className="text-ink-2">
                {fmtDays(i.ageDays)}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
