import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  icon?: ReactNode;
  accent?: 'energy' | 'repair' | 'legacy' | 'building' | 'crit' | 'warn' | 'good';
  /** 变化率（0.12 = +12%）；upIsGood 决定颜色 */
  delta?: { value: number; label?: string; upIsGood?: boolean } | null;
  foot?: ReactNode;
  spark?: number[];
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

const accentText: Record<NonNullable<KpiCardProps['accent']>, string> = {
  energy: 'text-energy bg-energy-soft',
  repair: 'text-repair bg-repair-soft',
  legacy: 'text-legacy bg-legacy-soft',
  building: 'text-building bg-building-soft',
  crit: 'text-crit-ink bg-crit-soft',
  warn: 'text-warn-ink bg-warn-soft',
  good: 'text-good-ink bg-good-soft',
};
const accentStroke: Record<NonNullable<KpiCardProps['accent']>, string> = {
  energy: '#2a78d6',
  repair: '#0f9b6e',
  legacy: '#6250d6',
  building: '#0e7490',
  crit: '#d03b3b',
  warn: '#e9a100',
  good: '#0ca30c',
};

export function KpiCard({ label, value, unit, icon, accent = 'energy', delta, foot, spark, loading, onClick, className }: KpiCardProps) {
  const Tag = onClick ? 'button' : 'div';
  const up = delta ? delta.value >= 0 : false;
  const good = delta ? (delta.upIsGood ?? true) === up : false;
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'card group relative flex min-w-0 flex-col gap-2 p-4 text-left transition-[border-color,box-shadow] duration-150',
        onClick && 'hover:border-brand/40 hover:shadow-pop',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon && <span className={clsx('grid size-6 place-items-center rounded-[7px] [&_svg]:size-3.5', accentText[accent])}>{icon}</span>}
        <span className="truncate text-caption font-medium text-ink-2">{label}</span>
      </div>
      {loading ? (
        <div className="skeleton h-8 w-28" />
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div className="flex shrink-0 items-baseline gap-1">
            <span className="text-kpi whitespace-nowrap font-semibold tracking-tight text-ink-1">{value}</span>
            {unit && <span className="text-body text-ink-3">{unit}</span>}
          </div>
          {spark && spark.length > 1 && (
            <div className="flex min-w-0 justify-end overflow-hidden">
              <Sparkline values={spark} stroke={accentStroke[accent]} width={84} height={28} />
            </div>
          )}
        </div>
      )}
      {(delta || foot) && (
        <div className="flex min-h-4 items-center gap-2 text-caption text-ink-3">
          {delta && (
            <span className={clsx('inline-flex items-center gap-0.5 font-medium', good ? 'text-good-ink' : 'text-crit-ink')}>
              {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta.value * 100).toFixed(1)}%
            </span>
          )}
          {delta?.label && <span>{delta.label}</span>}
          {foot && <span className="truncate">{foot}</span>}
        </div>
      )}
    </Tag>
  );
}
