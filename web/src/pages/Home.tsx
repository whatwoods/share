import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { LegacyItem, Ticket } from '@shared/contract';
import { LegacyDrawer } from '@/components/legacy/LegacyDrawer';
import { OverdueGroups } from '@/components/tickets/OverdueGroups';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { CopyButton } from '@/components/ui/Copy';
import { Toggle } from '@/components/ui/Fields';
import { Section } from '@/components/ui/Section';
import { Sparkline } from '@/components/ui/Sparkline';
import { Stat, StatRow } from '@/components/ui/Stat';
import { Dot } from '@/components/ui/Status';
import { failedWithoutData, Loadable, Skeleton } from '@/components/ui/States';
import { energyAnomalies } from '@/lib/anomaly';
import { buildingShort } from '@/lib/buildings';
import { fmtDays, fmtInt, safeBoldHtml, ymd } from '@/lib/format';
import { useBuildingsOverview, useEnergyOverview, useInsight, useLegacySummary, useTickets } from '@/lib/queries';
import { remindGroup, remindText } from '@/lib/remind';

/** 今日：打开就知道该干什么 —— 催办超时、看能耗异常、盯高危遗留 */
export default function HomePage() {
  const navigate = useNavigate();
  const [withYellow, setWithYellow] = useState(false);
  const overdue = useTickets({ overdue: withYellow ? 'any' : 'red', pageSize: 200, sort: '-ageHours' });
  const redCount = useTickets({ overdue: 'red', pageSize: 1 });
  const yellowCount = useTickets({ overdue: 'yellow', pageSize: 1 });
  const legacy = useLegacySummary();
  const buildings = useBuildingsOverview();
  const energy = useEnergyOverview({ start: ymd(-29), end: ymd(0) });
  const insight = useInsight();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [item, setItem] = useState<LegacyItem | null>(null);

  const anomalies = useMemo(() => energyAnomalies(buildings.data?.items ?? []), [buildings.data]);
  const flagged = anomalies.filter((a) => a.flagged);
  const red = redCount.data?.total;
  const high = legacy.data?.radar.length;
  // 标题依赖的两项数据任一失败时不再一直显示骨架
  const headFailed = failedWithoutData(redCount) || failedWithoutData(legacy);

  const copyAll = () => {
    const ts = overdue.data?.items ?? [];
    const by = new Map<string, Ticket[]>();
    for (const t of ts) by.set(remindGroup(t), [...(by.get(remindGroup(t)) ?? []), t]);
    return [...by.entries()].map(([g, xs]) => remindText(g, xs)).join('\n\n');
  };

  return (
    <div>
      <Greeting />
      <h1 className="mt-1 max-w-[880px] text-h1 font-semibold tight text-ink-1 max-md:text-[21px] max-md:leading-8">
        {headFailed ? (
          <span className="text-ink-2">
            今日概况没有加载出来，
            <button
              type="button"
              className="underline decoration-line-strong underline-offset-[6px] hover:text-ink-1"
              onClick={() => {
                if (failedWithoutData(redCount)) void redCount.refetch();
                if (failedWithoutData(legacy)) void legacy.refetch();
              }}
            >
              点此重试
            </button>
            。
          </span>
        ) : red == null || high == null ? (
          <span className="skeleton inline-block h-8 w-[520px] max-w-full align-middle" />
        ) : red + high + flagged.length === 0 ? (
          '园区运行平稳，今天没有需要特别跟进的事项。'
        ) : (
          <>
            今天有 <Em tone="crit">{red} 单超时报修</Em>、<Em tone="violet">{high} 项高危遗留</Em>
            {flagged.length > 0 && (
              <>
                {' '}和 <Em tone="warn">{flagged.length} 栋楼用电异常</Em>
              </>
            )}{' '}
            需要跟进。
          </>
        )}
      </h1>

      <StatRow className="mt-8 grid-cols-2 lg:grid-cols-4">
        <Stat label="超时工单" tone="crit" value={fmtInt(red)} unit="单" sub={`另有临期 ${fmtInt(yellowCount.data?.total)} 单`} loading={redCount.isLoading} onClick={() => document.getElementById('overdue')?.scrollIntoView({ behavior: 'smooth' })} />
        <Stat label="高危遗留" tone="violet" value={fmtInt(high)} unit="项" sub={legacy.data && `遗留未闭环共 ${legacy.data.open} 项`} loading={legacy.isLoading} onClick={() => navigate('/legacy')} />
        <Stat
          label="用电异常楼栋"
          tone="warn"
          value={buildings.data ? flagged.length : '—'}
          unit="栋"
          sub="昨日较同类日均偏差 ≥ 15%"
          loading={buildings.isLoading}
          onClick={() => document.getElementById('energy')?.scrollIntoView({ behavior: 'smooth' })}
        />
        <Stat
          label="今日用电"
          value={fmtInt(energy.data?.todayKwh)}
          unit="kWh"
          sub={energy.data && `实时负荷 ${fmtInt(energy.data.realtimeLoadKw)} kW`}
          loading={energy.isLoading}
          onClick={() => navigate('/energy')}
        />
      </StatRow>

      <div className="mt-14 grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Section
          id="overdue"
          title="超时工单催办"
          count={overdue.data?.total}
          desc="按责任方分组 · 一键复制催办消息发到群里"
          actions={
            <>
              <Toggle checked={withYellow} onChange={setWithYellow} label="含临期" />
              <CopyButton label="复制全部" text={copyAll} />
            </>
          }
        >
          <Loadable query={overdue} fetching={overdue.isFetching} skeleton={<Skeleton className="h-80" />}>
            <OverdueGroups tickets={overdue.data?.items ?? []} onOpen={setTicket} />
          </Loadable>
        </Section>

        <div className="space-y-12">
          <Section
            id="energy"
            title="用电异常"
            desc="昨日电量 vs 近两周同类日（工作日 / 周末）均值"
            actions={<MoreLink to="/energy">能耗</MoreLink>}
          >
            <Loadable query={buildings} skeleton={<Skeleton className="h-56" />}>
              <div>
                {anomalies.slice(0, 6).map((a) => (
                  <button
                    key={a.code}
                    onClick={() => navigate(`/buildings?b=${a.code}`)}
                    className="-mx-2 grid w-[calc(100%+16px)] grid-cols-[14px_56px_1fr_auto_72px] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-subtle [&+&]:shadow-[0_-1px_0_var(--color-line)]"
                  >
                    {a.flagged ? <Dot tone={a.dev > 0 ? 'crit' : 'info'} /> : <span />}
                    <span className="text-[14px] text-ink-1">{buildingShort(a.code)}</span>
                    <span className="num text-[13px] text-ink-3">
                      昨日 {fmtInt(a.yesterday)} · 均 {fmtInt(a.baseline)}
                    </span>
                    <Sparkline values={a.spark} width={64} height={20} stroke={a.flagged ? (a.dev > 0 ? '#e5484d' : '#5e6ad2') : '#bcbcbc'} fill={false} />
                    <span className={clsx('num text-right text-[14px] font-medium', a.flagged ? (a.dev > 0 ? 'text-crit-ink' : 'text-info-ink') : 'text-ink-3')}>
                      {a.dev > 0 ? '+' : ''}
                      {(a.dev * 100).toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            </Loadable>
            {insight.data && (
              <p className="insight mt-4 border-l-2 border-line-strong pl-3 text-[13px] leading-6 text-ink-2" dangerouslySetInnerHTML={{ __html: `<span style="color:#8f8f8f">AI 诊断 · ${insight.data.date}　</span>${safeBoldHtml(insight.data.summary)}` }} />
            )}
          </Section>

          <Section title="高危遗留" count={high} desc="施工遗留中风险最高的硬骨头" actions={<MoreLink to="/legacy">遗留攻坚</MoreLink>}>
            <Loadable query={legacy} skeleton={<Skeleton className="h-56" />}>
              <div>
                {legacy.data?.radar.slice(0, 6).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setItem(l)}
                    className="-mx-2 block w-[calc(100%+16px)] rounded-md px-2 py-2 text-left hover:bg-subtle [&+&]:shadow-[0_-1px_0_var(--color-line)]"
                  >
                    <span className="flex items-center gap-2">
                      <Dot tone="violet" />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-1">{l.description}</span>
                    </span>
                    <span className="mt-0.5 flex gap-2 pl-[15px] text-[12px] text-ink-3">
                      <span>{l.unit}</span>·<span>{l.status}</span>·<span className="num">挂账 {fmtDays(l.ageDays)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Loadable>
          </Section>
        </div>
      </div>

      <TicketDrawer ticket={ticket} onClose={() => setTicket(null)} />
      <LegacyDrawer item={item} onClose={() => setItem(null)} />
    </div>
  );
}

function Em({ tone, children }: { tone: 'crit' | 'violet' | 'warn'; children: React.ReactNode }) {
  const c = { crit: 'decoration-crit', violet: 'decoration-violet', warn: 'decoration-warn' }[tone];
  return <span className={clsx('underline decoration-2 underline-offset-[6px]', c)}>{children}</span>;
}

function MoreLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-[13px] text-ink-3 hover:text-ink-1">
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function Greeting() {
  const now = new Date();
  const h = Number(new Intl.DateTimeFormat('zh-CN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Shanghai' }).format(now));
  const hi = h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' }).format(now);
  return (
    <p className="text-[14px] text-ink-3">
      {date} · {hi}
    </p>
  );
}
