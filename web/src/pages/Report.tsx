import { Maximize2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ParkMap } from '@/components/buildings/ParkMap';
import { EChart } from '@/components/charts/EChart';
import { C } from '@/components/charts/echarts';
import { trendArea } from '@/components/charts/options';
import { Logo } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Meter } from '@/components/ui/Meter';
import { Dot } from '@/components/ui/Status';
import { fmtInt, fmtPct, safeBoldHtml, splitCompact, ymd } from '@/lib/format';
import { useBuildingsOverview, useEnergyOverview, useInsight, useLegacySummary, useSolar, useTicketStats } from '@/lib/queries';

/** 汇报模式：一屏讲清园区运营态势，适合投屏（建议 1920×1080 全屏） */
export default function ReportPage() {
  const navigate = useNavigate();
  const energy = useEnergyOverview({ start: ymd(-29), end: ymd(0) });
  const solar = useSolar();
  const stats = useTicketStats({ excludeSpecial: '1' });
  const all = useTicketStats({});
  const legacy = useLegacySummary();
  const buildings = useBuildingsOverview();
  const insight = useInsight();
  const now = useClock();

  const e = energy.data;
  const s = stats.data?.summary;
  const month = splitCompact(e?.monthKwh, 'kWh');
  const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && !document.fullscreenElement && navigate(-1);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="flex min-h-dvh flex-col bg-white px-[3vw] py-[2.4vh] lg:h-dvh lg:overflow-hidden">
      <header className="flex items-center gap-3">
        <Logo size={28} />
        <h1 className="text-[clamp(18px,1.6vw,30px)] font-semibold tight">湾谷园区运营简报</h1>
        <span className="num ml-3 text-[clamp(13px,0.9vw,17px)] text-ink-3">
          {new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(now)}
        </span>
        <span className="flex-1" />
        <Button variant="ghost" icon={<Maximize2 />} onClick={fs} title="全屏" aria-label="全屏" />
        <Button variant="ghost" icon={<X />} onClick={() => navigate(-1)} title="退出汇报模式" aria-label="退出汇报模式" />
      </header>

      <div className="mt-[3vh] grid grid-cols-2 gap-y-6 lg:grid-cols-5 lg:divide-x lg:divide-line [&>*]:px-[1.6vw] [&>*:first-child]:pl-0">
        <Hero label="今日用电" value={fmtInt(e?.todayKwh)} unit="kWh" sub={e && `实时负荷 ${fmtInt(e.realtimeLoadKw)} kW`} />
        <Hero label="本月累计用电" value={month.value} unit={month.unit} sub={solar.data && `光伏今日发电 ${fmtInt(solar.data.todayYieldKwh)} kWh`} />
        <Hero label="日常运维闭环率" value={s ? (s.rate * 100).toFixed(1) : '—'} unit="%" sub={s && `累计 ${fmtInt(s.total)} 单 · 已排除专项摸排`} />
        <Hero label="在途报修" value={fmtInt(all.data?.summary.open)} unit="单" sub={all.data && <span className={all.data.summary.red ? 'text-crit-ink' : ''}>其中超时 {all.data.summary.red} 单</span>} />
        <Hero label="施工遗留未闭环" value={fmtInt(legacy.data?.open)} unit="项" sub={legacy.data && <span className="text-violet-ink">高危 {legacy.data.radar.length} 项</span>} />
      </div>

      <div className="mt-[3.5vh] grid min-h-0 flex-1 gap-[2.4vw] lg:grid-cols-[1.35fr_1fr]">
        <div className="flex min-h-0 flex-col">
          <Caption>园区楼宇 · 问题分布</Caption>
          <div className="mt-2">{buildings.data && <ParkMap items={buildings.data.items} selected={null} onSelect={() => {}} compact />}</div>
          <div className="mt-2 flex gap-5 text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <Dot tone="crit" /> 超时工单
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot tone="violet" /> 高危遗留
            </span>
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-[2.5vh]">
          <div>
            <Caption>近 30 天园区日用电（kWh）</Caption>
            {e && <EChart option={trendArea(e.daily, { color: C.accent, avgLine: true })} height="22vh" ariaLabel="近30天用电" />}
          </div>
          <div className="grid min-h-0 grid-cols-2 gap-x-[2vw]">
            <div>
              <Caption>工种闭环率</Caption>
              <div className="mt-2 space-y-[1.1vh]">
                {stats.data?.byType.slice(0, 8).map((r) => (
                  <div key={r.type}>
                    <div className="flex justify-between text-[clamp(12px,0.8vw,15px)]">
                      <span className="truncate">{r.type}</span>
                      <span className="num font-medium">{fmtPct(r.rate)}</span>
                    </div>
                    <Meter value={r.rate} tone={r.rate < 0.8 ? 'warn' : 'accent'} className="mt-1" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Caption>施工单位遗留闭环进度</Caption>
              <div className="mt-2 space-y-[1.1vh]">
                {legacy.data?.groups
                  .filter((g) => g.total > 0)
                  .map((g) => (
                    <div key={g.key}>
                      <div className="flex justify-between text-[clamp(12px,0.8vw,15px)]">
                        <span>{g.label}</span>
                        <span className="num text-ink-3">
                          <span className="font-medium text-ink-1">{g.total - g.open}</span> / {g.total}
                        </span>
                      </div>
                      <Meter value={(g.total - g.open) / Math.max(1, g.total)} tone="accent" className="mt-1" />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {insight.data && (
        <p
          className="insight mt-[2.4vh] border-t border-line pt-[1.6vh] text-[clamp(13px,0.95vw,18px)] leading-relaxed text-ink-2"
          dangerouslySetInnerHTML={{ __html: `<span style="color:#8f8f8f">AI 用电诊断　</span>${safeBoldHtml(insight.data.summary)}` }}
        />
      )}
    </div>
  );
}

function Hero({ label, value, unit, sub }: { label: string; value: React.ReactNode; unit: string; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[clamp(13px,0.9vw,17px)] text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="num tight text-[clamp(34px,3.6vw,72px)] leading-none font-medium">{value}</span>
        <span className="text-[clamp(13px,1vw,20px)] text-ink-3">{unit}</span>
      </div>
      {sub && <div className="mt-2 text-[clamp(12px,0.8vw,15px)] text-ink-3">{sub}</div>}
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <div className="text-[clamp(13px,0.85vw,16px)] font-medium text-ink-2">{children}</div>;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
