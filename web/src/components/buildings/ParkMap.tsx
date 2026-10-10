import clsx from 'clsx';
import type { BuildingCard } from '@shared/contract';
import { fmtCompact } from '@/lib/format';
import { SLOTS, ZONES } from './layout';

export type MapMetric = 'status' | 'energy';

/** 电耗模式：单色阶（强调色） */
const RAMP = ['#ffffff', '#f0f1fc', '#dfe2f9', '#c4c9f3', '#a2a9ea', '#7f88de', '#5e6ad2'];

export function ParkMap({
  items,
  selected,
  onSelect,
  metric = 'status',
  compact,
}: {
  items: BuildingCard[];
  selected: string | null;
  onSelect: (code: string) => void;
  metric?: MapMetric;
  compact?: boolean;
}) {
  const byCode = new Map(items.map((b) => [b.code, b]));
  const max = Math.max(1, ...items.filter((b) => b.code !== 'PUBLIC').map((b) => b.energy.kwh30d ?? 0));

  return (
    <div className="scroll-thin overflow-x-auto">
      <div className="relative w-full overflow-hidden rounded-xl bg-subtle max-md:min-w-[720px]" style={{ aspectRatio: '16 / 8.4' }}>
        {ZONES.map((z) => (
          <div
            key={z.label}
            className="pointer-events-none absolute rounded-lg bg-white/60 shadow-[inset_0_0_0_1px_rgba(0,0,0,.035)]"
            style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
          >
            <span className="absolute top-2 left-3 text-[11px] tracking-wide text-ink-3">{z.label}</span>
          </div>
        ))}
        {SLOTS.map((s) => {
          const b = byCode.get(s.code);
          if (!b) return null;
          const isSel = selected === s.code;
          const isPublic = s.code === 'PUBLIC';
          let bg = '#ffffff';
          let fg = '#171717';
          if (metric === 'energy') {
            const v = isPublic ? 0 : (b.energy.kwh30d ?? 0) / max;
            const idx = Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1)));
            bg = isPublic ? '#ffffff' : RAMP[idx];
            fg = idx >= 5 ? '#ffffff' : '#171717';
          }
          return (
            <button
              key={s.code}
              onClick={() => onSelect(s.code)}
              aria-pressed={isSel}
              aria-label={`${b.name}：未完成报修 ${b.tickets.open}，超时 ${b.tickets.red}，高危遗留 ${b.legacy.highRisk}，近30天电量 ${fmtCompact(b.energy.kwh30d)} kWh`}
              className={clsx(
                'absolute flex flex-col justify-between rounded-lg text-left transition-[box-shadow,transform] duration-150',
                compact ? 'p-[clamp(4px,0.5vw,8px)]' : 'p-[clamp(5px,0.65vw,10px)]',
                isSel
                  ? 'z-[2] shadow-[0_0_0_1.5px_#171717,0_8px_20px_-8px_rgba(0,0,0,.25)]'
                  : 'shadow-[0_0_0_1px_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.04)] hover:shadow-[0_0_0_1px_rgba(0,0,0,.18),0_4px_12px_-4px_rgba(0,0,0,.12)]',
              )}
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%`, background: bg, color: fg }}
            >
              <span className={clsx('leading-none font-semibold tight', isPublic ? 'text-[clamp(11px,0.95vw,14px)]' : 'text-[clamp(13px,1.35vw,20px)]')}>
                {isPublic ? '公区 · 设备用房 / 室外' : b.short}
              </span>
              <span className="flex items-end justify-between gap-1">
                <span className={clsx('num truncate text-[clamp(9px,0.7vw,11px)]', metric === 'energy' ? 'opacity-80' : 'text-ink-3')}>
                  {metric === 'energy' ? fmtCompact(b.energy.kwh30d) : ''}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {b.legacy.highRisk > 0 && <Pip color="#8e4ec6" n={b.legacy.highRisk} title="高危遗留" />}
                  {b.tickets.red > 0 && <Pip color="#e5484d" n={b.tickets.red} title="超时工单" />}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Pip({ color, n, title }: { color: string; n: number; title: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-[3px] text-[clamp(9px,0.7vw,11px)] leading-none font-semibold" style={{ color }}>
      <span className="size-[6px] rounded-full" style={{ background: color }} />
      <span className="num">{n}</span>
    </span>
  );
}

export function MapLegend({ metric }: { metric: MapMetric }) {
  if (metric === 'energy')
    return (
      <span className="flex items-center gap-2 text-[12px] text-ink-3">
        近 30 天电量 低
        <span className="flex overflow-hidden rounded-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]">
          {RAMP.map((c) => (
            <span key={c} className="h-2.5 w-4" style={{ background: c }} />
          ))}
        </span>
        高
      </span>
    );
  return (
    <span className="flex items-center gap-4 text-[12px] text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-[6px] rounded-full bg-crit" /> 超时工单
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-[6px] rounded-full bg-violet" /> 高危遗留
      </span>
    </span>
  );
}
