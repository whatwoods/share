import clsx from 'clsx';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LegacyGroup, LegacyItem, LegacySummary } from '@shared/contract';
import { LegacyDrawer } from '@/components/legacy/LegacyDrawer';
import { LegacyRow } from '@/components/legacy/LegacyRow';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/Copy';
import { BuildingSelect, FilterBar, SearchInput, Select, Toggle } from '@/components/ui/Fields';
import { Section } from '@/components/ui/Section';
import { Stat, StatRow } from '@/components/ui/Stat';
import { Empty, ErrorState, failedWithoutData, Loadable, Skeleton, type QueryState } from '@/components/ui/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { download } from '@/lib/api';
import { buildingName } from '@/lib/buildings';
import { fmtDays, fmtInt, ymd } from '@/lib/format';
import { useLegacy, useLegacySummary, useMeta } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';

const KEYS = ['group', 'status', 'building', 'q', 'all'] as const;
const ORDER: LegacyGroup[] = ['DECAI', 'SCG', 'QIJU', 'LEAK', 'DISPUTE', 'OTHER'];
const STATUS_COLOR: Record<string, string> = {
  已完成: '#30a46c',
  跟进中: '#5e6ad2',
  观察中: '#bcbcbc',
  未处理: '#f0a429',
  计划逾期: '#e5484d',
  重复漏水: '#e5484d',
  有争议: '#8e4ec6',
};

export default function LegacyPage() {
  const [s, set, reset] = useUrlState(KEYS);
  const meta = useMeta();
  const summary = useLegacySummary();
  const list = useLegacy({ group: s.group, status: s.status, building: s.building, q: s.q, open: s.all === '1' ? undefined : '1' });
  const [open, setOpen] = useState<LegacyItem | null>(null);
  const toast = useToast();
  const [exporting, setExporting] = useState<string | null>(null);
  const sm = summary.data;
  const groups = useMemo(() => (sm?.groups ?? []).filter((g) => g.total > 0).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)), [sm]);

  const doExport = async (group: string) => {
    setExporting(group);
    try {
      await download('/legacy/export', { group, open: s.all === '1' ? undefined : '1' }, '施工遗留索赔清单.xlsx');
      toast({ kind: 'success', title: '索赔清单已生成', body: '已按施工单位分表并格式化，可直接用于例会与法务' });
    } catch (e) {
      toast({ kind: 'error', title: '导出失败', body: (e as Error).message });
    } finally {
      setExporting(null);
    }
  };

  const repeatLeak = sm?.byStatus.find((x) => x.status === '重复漏水')?.count ?? 0;
  const dispute = sm?.groups.find((g) => g.key === 'DISPUTE');
  const items = list.data?.items ?? [];
  const grouped = useMemo(() => {
    const m = new Map<LegacyGroup, LegacyItem[]>();
    for (const i of items) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return ORDER.filter((k) => m.get(k)?.length).map((k) => ({ key: k, label: groups.find((g) => g.key === k)?.label ?? k, items: m.get(k)! }));
  }, [items, groups]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-h1 font-semibold tight">遗留攻坚</h1>
          <p className="mt-1 text-[14px] text-ink-3">施工单位久拖未决专项台账 · 索赔与质保对账</p>
        </div>
        <Button variant="primary" icon={<Download />} loading={exporting === 'ALL'} onClick={() => doExport('ALL')}>
          导出全部单位索赔清单
        </Button>
      </div>

      <StatRow className="mt-8 grid-cols-2 lg:grid-cols-5">
        <Stat label="台账总数" value={fmtInt(sm?.total)} unit="项" loading={summary.isLoading} />
        <Stat label="未闭环" value={fmtInt(sm?.open)} unit="项" sub={sm && `已闭环 ${sm.total - sm.open}`} loading={summary.isLoading} />
        <Stat label="高危隐患" tone="crit" value={fmtInt(sm?.radar.length)} unit="项" sub="外立面玻璃 · 排污堵塞等" loading={summary.isLoading} />
        <Stat label="重复漏水" tone="warn" value={fmtInt(repeatLeak)} unit="项" sub="多次处理仍复发" loading={summary.isLoading} />
        <Stat label="争议待定责" tone="violet" value={fmtInt(dispute?.open)} unit="项" sub="需上会明确责任主体" loading={summary.isLoading} onClick={() => set({ group: 'DISPUTE' })} />
      </StatRow>

      <div className="mt-14 grid gap-x-14 gap-y-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Radar summary={sm} query={summary} onOpen={setOpen} />
        <UnitTable groups={groups} query={summary} active={s.group} onPick={(k) => set({ group: s.group === k ? null : k })} onExport={doExport} exporting={exporting} />
      </div>

      <Section
        title="挂账清单"
        count={items.length}
        className="mt-14"
        actions={
          s.group && (
            <>
              <CopyButton label="复制对账摘要" text={() => digest(groups.find((g) => g.key === s.group)?.label ?? '', items)} />
              <Button size="sm" icon={<Download />} loading={exporting === s.group} onClick={() => doExport(s.group)}>
                导出本单位
              </Button>
            </>
          )
        }
        flush
      >
        <Tabs
          className="mt-1"
          value={s.group || 'ALL'}
          onChange={(v) => set({ group: v === 'ALL' ? null : v })}
          options={[{ value: 'ALL', label: '全部', count: sm?.open }, ...groups.map((g) => ({ value: g.key, label: g.label, count: g.open }))]}
        />
        <FilterBar active={!!(s.status || s.building || s.q || s.all)} onReset={() => (reset(), s.group && set({ group: s.group }))} className="mt-3">
          <Select value={s.status} onChange={(v) => set({ status: v })} placeholder="状态" label="状态" options={(meta.data?.legacyStatuses ?? []).map((x) => ({ value: x, label: x }))} />
          <BuildingSelect meta={meta.data} value={s.building} onChange={(v) => set({ building: v })} />
          <SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="搜索问题 / 进展 / 卡点" />
          <Toggle checked={s.all === '1'} onChange={(v) => set({ all: v ? '1' : null })} label="包含已完成" />
        </FilterBar>
        <Loadable query={list} fetching={list.isFetching} className="mt-3">
          {items.length === 0 ? (
            <Empty title="没有符合条件的遗留问题" />
          ) : s.group ? (
            items.map((i) => <LegacyRow key={i.id} item={i} onOpen={setOpen} />)
          ) : (
            <div className="space-y-8">
              {grouped.map((g) => (
                <GroupBlock key={g.key} label={g.label} items={g.items} onOpen={setOpen} onMore={() => set({ group: g.key })} />
              ))}
            </div>
          )}
        </Loadable>
      </Section>

      <LegacyDrawer item={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Radar({ summary, query, onOpen }: { summary?: LegacySummary; query: QueryState; onOpen: (i: LegacyItem) => void }) {
  return (
    <Section title="高危隐患" count={summary?.radar.length} desc="外立面玻璃、排污堵塞、重复渗漏、责任未定等硬骨头，按风险分排序">
      {failedWithoutData(query) ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-72" />
      ) : summary?.radar.length ? (
        <ol>
          {summary.radar.map((l, i) => (
            <li key={l.id}>
              <button
                onClick={() => onOpen(l)}
                className="-mx-2 grid w-[calc(100%+16px)] grid-cols-[22px_1fr_auto] items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-subtle"
              >
                <span className="num pt-px text-[13px] text-ink-4">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink-1">{l.description}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {l.unit} · {l.status} · 挂账 {fmtDays(l.ageDays)}
                    {l.progress && ` · ${l.progress}`}
                  </span>
                </span>
                <span className="num pt-px text-[13px] font-medium text-crit-ink">{l.risk.score}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <Empty title="暂无高危隐患" />
      )}
    </Section>
  );
}

function UnitTable({
  groups,
  query,
  active,
  onPick,
  onExport,
  exporting,
}: {
  groups: LegacySummary['groups'];
  query: QueryState;
  active: string;
  onPick: (k: string) => void;
  onExport: (k: string) => void;
  exporting: string | null;
}) {
  return (
    <Section title="按施工单位对账" desc="点击行切换下方清单 · 每个单位可单独导出索赔清单" flush>
      {failedWithoutData(query) ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} className="mt-4" />
      ) : query.isLoading ? (
        <Skeleton className="mt-4 h-60" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>单位</Th>
              <Th align="right">挂账</Th>
              <Th align="right">未闭环</Th>
              <Th align="right">高危</Th>
              <Th className="w-[34%]">状态分布</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Tr key={g.key} onClick={() => onPick(g.key)} className={clsx(active === g.key && 'bg-subtle')}>
                <Td className="font-medium">{g.label}</Td>
                <Td align="right">{g.total}</Td>
                <Td align="right">{g.open}</Td>
                <Td align="right" className={g.highRisk ? 'font-medium text-crit-ink' : 'text-ink-4'}>
                  {g.highRisk}
                </Td>
                <Td>
                  <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full" title={g.byStatus.map((x) => `${x.status} ${x.count}`).join(' · ')}>
                    {g.byStatus.map((x) => (
                      <span key={x.status} style={{ width: `${(x.count / Math.max(1, g.total)) * 100}%`, background: STATUS_COLOR[x.status] ?? '#d6d6d6' }} />
                    ))}
                  </div>
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Download />}
                    loading={exporting === g.key}
                    onClick={(e) => (e.stopPropagation(), onExport(g.key))}
                    aria-label={`导出 ${g.label} 索赔清单`}
                    title={`导出 ${g.label} 索赔清单`}
                  />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        {Object.entries(STATUS_COLOR).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: c }} />
            {k}
          </span>
        ))}
      </div>
    </Section>
  );
}

function GroupBlock({ label, items, onOpen, onMore }: { label: string; items: LegacyItem[]; onOpen: (i: LegacyItem) => void; onMore: () => void }) {
  const LIMIT = 6;
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2 text-[13px]">
        <span className="font-medium text-ink-1">{label}</span>
        <span className="num text-ink-3">{items.length}</span>
      </div>
      {items.slice(0, LIMIT).map((i) => (
        <LegacyRow key={i.id} item={i} onOpen={onOpen} />
      ))}
      {items.length > LIMIT && (
        <button onClick={onMore} className="mt-1 text-[13px] text-ink-3 hover:text-ink-1">
          查看 {label} 全部 {items.length} 项 →
        </button>
      )}
    </div>
  );
}

/** 例会用的对账摘要文本 */
function digest(unit: string, items: LegacyItem[]) {
  const open = items.filter((i) => i.isOpen);
  const lines = open.map((i, n) => `${n + 1}. ${buildingName(i.building)}${i.floor ? ` ${i.floor}F` : ''} ${i.description}【${i.status}】${i.progress ? ` —— ${i.progress}` : ''}`);
  return [`【湾谷园区 · ${unit} 施工遗留对账】截至 ${ymd(0)}，未闭环 ${open.length} 项：`, ...lines].join('\n');
}
