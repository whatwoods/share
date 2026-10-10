import clsx from 'clsx';
import type { BuildingCard } from '@shared/contract';
import { fmtCompact } from '@/lib/format';
import { SLOTS, ZONES } from './layout';

export type MapMetric = 'health' | 'energy' | 'tickets' | 'legacy';

/** 单色顺序色阶（浅 → 深） */
const RAMPS: Record<Exclude<MapMetric, 'health'>, string[]> = {
  energy: ['#f3f8fe', '#d9e9fb', '#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6'],
  tickets: ['#f2faf6', '#d6f0e4', '#ade1c9', '#74c9a3', '#33ac7c', '#0f8a5f'],
  legacy: ['#f6f5fe', '#e3dffb', '#c9c1f5', '#a597ec', '#7e6de0', '#5a48c9'],
};
const HEALTH = {
  good: { bg: '#ffffff', ring: '#d9dfe7', ink: '#0f1729' },
  warn: { bg: '#fff8e6', ring: '#f2cf75', ink: '#0f1729' },
  bad: { bg: '#fdeeee', ring: '#ec9a9a', ink: '#0f1729' },
};

function metricValue(b: BuildingCard, m: MapMetric): number {
  if (m === 'energy') return b.energy.kwh30d ?? 0;
  if (m === 'tickets') return b.tickets.open;
  if (m === 'legacy') return b.legacy.open;
  return 0;
}

export function rampFor(m: Exclude<MapMetric, 'health'>) {
  return RAMPS[m];
}

export function ParkMap({
  items,
  selected,
  onSelect,
  metric,
}: {
  items: BuildingCard[];
  selected: string | null;
  onSelect: (code: string) => void;
  metric: MapMetric;
}) {
  const byCode = new Map(items.map((b) => [b.code, b]));
  const max = Math.max(1, ...items.filter((b) => b.code !== 'PUBLIC' || metric !== 'energy').map((b) => metricValue(b, metric)));
  const maxEnergy = Math.max(1, ...items.map((b) => b.energy.kwh30d ?? 0));

  return (
    <div className="relative w-full overflow-hidden rounded-[12px] border border-line bg-[#f7f9fb]" style={{ aspectRatio: '16 / 8.4' }}>
      {/* 底纹：场地网格 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'linear-gradient(#e9edf2 1px,transparent 1px),linear-gradient(90deg,#e9edf2 1px,transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {ZONES.map((z) => (
        <div
          key={z.label}
          className="pointer-events-none absolute rounded-[14px] border border-dashed border-[#d5dce5] bg-white/40"
          style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
        >
          <span className="absolute top-2 left-3 text-[11px] font-medium tracking-wide text-ink-3">{z.label}</span>
        </div>
      ))}
      {SLOTS.map((s) => {
        const b = byCode.get(s.code);
        if (!b) return null;
        const isSel = selected === s.code;
        const v = metricValue(b, metric);
        let bg: string, ring: string, ink: string;
        if (metric === 'health') {
          ({ bg, ring, ink } = HEALTH[b.health]);
        } else {
          const ramp = RAMPS[metric];
          const idx = v <= 0 ? 0 : Math.min(ramp.length - 1, 1 + Math.floor((v / max) * (ramp.length - 1.001)));
          bg = ramp[idx];
          ring = idx >= 3 ? ramp[ramp.length - 1] : '#d9dfe7';
          ink = idx >= 4 ? '#ffffff' : '#0f1729';
        }
        // 2.5D：挤出高度编码近 30 天电量
        const lift = 3 + Math.round(((b.energy.kwh30d ?? 0) / maxEnergy) * 7);
        const isPublic = s.code === 'PUBLIC';
        return (
          <button
            key={s.code}
            onClick={() => onSelect(s.code)}
            aria-pressed={isSel}
            aria-label={`${b.name}：未完成工单 ${b.tickets.open}，超时 ${b.tickets.red}，遗留未完成 ${b.legacy.open}，近30天电量 ${fmtCompact(b.energy.kwh30d)} kWh`}
            className={clsx(
              'group absolute flex flex-col justify-between rounded-[9px] border p-[clamp(4px,0.6vw,9px)] text-left transition-[transform,box-shadow] duration-200 ease-out',
              'hover:-translate-y-0.5 focus-visible:-translate-y-0.5',
              isSel && '-translate-y-1',
            )}
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.w}%`,
              height: `${s.h}%`,
              background: bg,
              borderColor: isSel ? '#2563eb' : ring,
              color: ink,
              boxShadow: `0 ${lift}px 0 -1px ${isSel ? '#bcd0f7' : '#dfe4eb'}, 0 ${lift + 6}px 14px -6px rgba(15,23,41,.18)${isSel ? ', 0 0 0 3px rgba(37,99,235,.18)' : ''}`,
            }}
          >
            <div className="flex items-start justify-between gap-1">
              <span className={clsx('leading-none font-semibold tracking-tight', isPublic ? 'text-[clamp(11px,1vw,14px)]' : 'text-[clamp(12px,1.25vw,18px)]')}>
                {isPublic ? '公区 · 设备用房 / 室外' : b.short}
              </span>
              {b.tickets.red > 0 && (
                <span className="grid h-[16px] min-w-[16px] place-items-center rounded-full bg-crit px-1 text-[10px] leading-none font-semibold text-white shadow-sm" title="超时工单">
                  {b.tickets.red}
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-1 text-[clamp(9px,0.72vw,11px)] leading-tight opacity-80 max-sm:hidden">
              <span className="num truncate">
                {metric === 'energy' || metric === 'health' ? `${fmtCompact(b.energy.kwh30d)}` : metric === 'tickets' ? `${b.tickets.open} 单` : `${b.legacy.open} 项`}
              </span>
              {metric !== 'legacy' && b.legacy.highRisk > 0 && <span title="高危遗留">⚠{b.legacy.highRisk}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
