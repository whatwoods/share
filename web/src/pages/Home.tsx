import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Building2, Construction, Flame, Gauge, Sparkles, Sun, Wrench, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { LegacyItem, Ticket } from '@shared/contract';
import { ParkMap } from '@/components/buildings/ParkMap';
import { EChart } from '@/components/charts/EChart';
import { C } from '@/components/charts/echarts';
import { trendArea } from '@/components/charts/options';
import { LegacyCard } from '@/components/legacy/LegacyCard';
import { LegacyDrawer } from '@/components/legacy/LegacyDrawer';
import { TicketCard } from '@/components/tickets/TicketCard';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { Meter } from '@/components/ui/Meter';
import { Empty, Loadable, Skeleton } from '@/components/ui/States';
import { fmtAge, fmtInt, fmtPct, safeBoldHtml, ymd } from '@/lib/format';
import { useBuildingsOverview, useEnergyOverview, useInsight, useLegacySummary, useSolar, useTicketBoard, useTicketStats } from '@/lib/queries';

/** 运营总览：三条业务线的「今日要事」驾驶舱 */
export default function HomePage() {
  const navigate = useNavigate();
  const energy = useEnergyOverview({ start: ymd(-29), end: ymd(0) });
  const solar = useSolar();
  const insight = useInsight();
  const stats = useTicketStats({ excludeSpecial: '1' });
  const board = useTicketBoard({});
  const legacy = useLegacySummary();
  const buildings = useBuildingsOverview();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [item, setItem] = useState<LegacyItem | null>(null);

  const s = stats.data?.summary;
  const e = energy.data;
  const urgent = (board.data?.columns ?? [])
    .filter((c) => c.column !== '已完成')
    .flatMap((c) => c.items)
    .filter((t) => t.overdue === 'red')
    .sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <Greeting red={board.data?.overdue.red} radar={legacy.data?.radar.length} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard loading={energy.isLoading} label="今日用电" value={fmtInt(e?.todayKwh)} unit="kWh" icon={<Zap />} accent="energy" spark={e?.daily.slice(-14).map((d) => d.kwh)} onClick={() => navigate('/energy')} />
        <KpiCard loading={energy.isLoading} label="实时负荷" value={fmtInt(e?.realtimeLoadKw)} unit="kW" icon={<Gauge />} accent="energy" foot={solar.data && `光伏 ${fmtInt(solar.data.currentPowerKw)} kW`} onClick={() => navigate('/energy')} />
        <KpiCard
          loading={stats.isLoading}
          label="日常运维闭环率"
          value={s ? (s.rate * 100).toFixed(1) : '—'}
          unit="%"
          icon={<Wrench />}
          accent="repair"
          foot="已排除专项摸排"
          onClick={() => navigate('/repair?view=stats&ex=1')}
        />
        <KpiCard loading={stats.isLoading} label="未完成报修" value={fmtInt(s?.open)} unit="单" icon={<Wrench />} accent="repair" foot={s && `平均挂单 ${fmtAge(s.avgOpenAgeHours)}`} onClick={() => navigate('/repair')} />
        <KpiCard loading={board.isLoading} label="超时工单" value={fmtInt(board.data?.overdue.red)} unit="单" icon={<AlertTriangle />} accent="crit" foot={board.data && `另有临期 ${board.data.overdue.yellow} 单`} onClick={() => navigate('/repair?view=list&overdue=red')} />
        <KpiCard loading={legacy.isLoading} label="遗留未闭环" value={fmtInt(legacy.data?.open)} unit="项" icon={<Construction />} accent="legacy" foot={legacy.data && `高危 ${legacy.data.radar.length} 项`} onClick={() => navigate('/legacy')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            icon={<Building2 className="size-4" />}
            title="园区楼宇态势"
            subtitle="颜色 = 综合健康度 · 红色角标 = 超时工单数 · 点击进入楼宇全景"
            actions={
              <Link to="/buildings" className="inline-flex items-center gap-1 text-caption font-medium text-brand-ink hover:underline">
                全景视图 <ArrowRight className="size-3" />
              </Link>
            }
          />
          <CardBody>
            {buildings.isLoading ? (
              <Skeleton className="aspect-[16/8.4] w-full" />
            ) : (
              <ParkMap items={buildings.data?.items ?? []} selected={null} metric="health" onSelect={(c) => navigate(`/buildings?b=${c}`)} />
            )}
          </CardBody>
        </Card>
        <div className="flex flex-col gap-4 xl:col-span-5">
          <Card>
            <CardHeader
              icon={<Sparkles className="size-4" />}
              title="AI 用电诊断"
              subtitle={insight.data?.date}
              actions={insight.data && <Badge tone={insight.data.anomaly === 'high' ? 'crit' : insight.data.anomaly === 'low' ? 'info' : 'good'} dot>{insight.data.anomaly === 'high' ? '偏高' : insight.data.anomaly === 'low' ? '偏低' : '平稳'}</Badge>}
            />
            <CardBody>
              {insight.isLoading ? (
                <Skeleton className="h-16" />
              ) : insight.data ? (
                <>
                  <p className="insight text-body leading-6 text-ink-1" dangerouslySetInnerHTML={{ __html: safeBoldHtml(insight.data.summary) }} />
                  {insight.data.points[0] && <p className="insight mt-1.5 text-caption leading-5 text-ink-2" dangerouslySetInnerHTML={{ __html: safeBoldHtml(insight.data.points[0]) }} />}
                </>
              ) : (
                <Empty title="暂无诊断" className="py-4" />
              )}
            </CardBody>
          </Card>
          <Card className="flex-1">
            <CardHeader
              icon={<Zap className="size-4" />}
              title="近 30 天园区用电"
              subtitle="kWh / 日"
              actions={
                solar.data && (
                  <span className="inline-flex items-center gap-1 text-caption text-ink-2">
                    <Sun className="size-3.5 text-warn" /> 光伏今日 <b className="num font-semibold text-ink-1">{fmtInt(solar.data.todayYieldKwh)}</b> kWh
                  </span>
                )
              }
            />
            <CardBody>
              <Loadable loading={energy.isLoading} fetching={energy.isFetching} skeleton={<Skeleton className="h-[190px]" />}>
                {e && <EChart option={trendArea(e.daily, { color: C.energy })} height={190} ariaLabel="近30天园区用电" />}
              </Loadable>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<AlertTriangle className="size-4 text-crit" />}
            title="超时最久的报修"
            subtitle="红色超时 · 待处理 >72h 或跟进中 >15 天"
            actions={
              <Link to="/repair?view=list&overdue=red&sort=-ageHours" className="inline-flex items-center gap-1 text-caption font-medium text-brand-ink hover:underline">
                全部超时 <ArrowRight className="size-3" />
              </Link>
            }
          />
          <CardBody>
            <Loadable loading={board.isLoading}>
              {urgent.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {urgent.map((t) => (
                    <TicketCard key={t.id} t={t} onOpen={setTicket} />
                  ))}
                </div>
              ) : (
                <Empty title="没有超时工单" hint="所有在途工单都在时限内" />
              )}
            </Loadable>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            icon={<Flame className="size-4 text-crit" />}
            title="高危隐患雷达 Top"
            subtitle="施工遗留硬骨头"
            actions={
              <Link to="/legacy" className="inline-flex items-center gap-1 text-caption font-medium text-brand-ink hover:underline">
                攻坚台账 <ArrowRight className="size-3" />
              </Link>
            }
          />
          <CardBody>
            <Loadable loading={legacy.isLoading}>
              {legacy.data?.radar.length ? (
                <div className="grid gap-2">
                  {legacy.data.radar.slice(0, 4).map((i) => (
                    <LegacyCard key={i.id} item={i} onOpen={setItem} compact />
                  ))}
                </div>
              ) : (
                <Empty title="暂无高危隐患" />
              )}
            </Loadable>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader icon={<Wrench className="size-4" />} title="工种闭环率" subtitle="日常运维口径（已排除专项摸排）" />
        <CardBody>
          <Loadable loading={stats.isLoading}>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.data?.byType.map((r) => (
                <Link key={r.type} to={`/repair?view=list&type=${encodeURIComponent(r.type)}&ex=1`} className="group block">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-body text-ink-1 group-hover:text-brand-ink">{r.type}</span>
                    <span className="num shrink-0 text-caption text-ink-3">
                      <b className={clsx('font-semibold', r.rate < 0.8 ? 'text-warn-ink' : 'text-ink-1')}>{fmtPct(r.rate)}</b> · 未完成 {r.open}
                    </span>
                  </div>
                  <Meter value={r.rate} tone={r.rate < 0.8 ? 'warn' : 'repair'} />
                </Link>
              ))}
            </div>
          </Loadable>
        </CardBody>
      </Card>

      <TicketDrawer ticket={ticket} onClose={() => setTicket(null)} />
      <LegacyDrawer item={item} onClose={() => setItem(null)} />
    </div>
  );
}

function Greeting({ red, radar }: { red?: number; radar?: number }) {
  const h = Number(new Intl.DateTimeFormat('zh-CN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Shanghai' }).format(new Date()));
  const hi = h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' }).format(new Date());
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-h1 font-semibold text-ink-1">{hi}，今天是 {date}</h2>
        <p className="mt-0.5 text-body text-ink-2">
          {red == null ? '正在汇总园区运营态势…' : red > 0 || (radar ?? 0) > 0 ? (
            <>
              当前有 <b className="font-semibold text-crit-ink">{red} 单超时报修</b>、<b className="font-semibold text-crit-ink">{radar ?? 0} 项高危遗留</b> 需要优先跟进。
            </>
          ) : (
            '园区运行平稳，暂无超时工单与高危遗留。'
          )}
        </p>
      </div>
    </div>
  );
}
