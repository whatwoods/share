import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Flame, HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OverdueLevel } from '@shared/contract';
import { fmtAge } from '@/lib/format';

export type Tone = 'crit' | 'warn' | 'good' | 'info' | 'neutral' | 'energy' | 'repair' | 'legacy' | 'building';

const tones: Record<Tone, string> = {
  crit: 'bg-crit-soft text-crit-ink',
  warn: 'bg-warn-soft text-warn-ink',
  good: 'bg-good-soft text-good-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-hover text-ink-2',
  energy: 'bg-energy-soft text-energy',
  repair: 'bg-repair-soft text-repair',
  legacy: 'bg-legacy-soft text-legacy',
  building: 'bg-building-soft text-building',
};
const dots: Record<Tone, string> = {
  crit: 'bg-crit',
  warn: 'bg-warn',
  good: 'bg-good',
  info: 'bg-info',
  neutral: 'bg-ink-3',
  energy: 'bg-energy',
  repair: 'bg-repair',
  legacy: 'bg-legacy',
  building: 'bg-building',
};

export function Badge({
  tone = 'neutral',
  dot,
  icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-micro font-medium whitespace-nowrap [&_svg]:size-3',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={clsx('size-1.5 rounded-full', dots[tone])} />}
      {icon}
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case '已完成':
      return 'good';
    case '跟进中':
      return 'info';
    case '待处理':
    case '未处理':
      return 'warn';
    case '幕墙专项':
      return 'legacy';
    case '重复漏水':
    case '计划逾期':
      return 'crit';
    case '有争议':
      return 'legacy';
    case '观察中':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {status || '—'}
    </Badge>
  );
}

export function OverdueBadge({ level, ageHours }: { level: OverdueLevel; ageHours: number | null }) {
  if (level === 'none') return null;
  return (
    <Badge tone={level === 'red' ? 'crit' : 'warn'} icon={level === 'red' ? <AlertTriangle /> : <Clock />} title="按报修时间计算的挂单时长">
      {level === 'red' ? '超时' : '临期'} {fmtAge(ageHours)}
    </Badge>
  );
}

export function RiskBadge({ level, score }: { level: 'high' | 'medium' | 'low'; score?: number }) {
  const map = {
    high: { tone: 'crit' as const, label: '高危', icon: <Flame /> },
    medium: { tone: 'warn' as const, label: '中危', icon: <AlertTriangle /> },
    low: { tone: 'neutral' as const, label: '一般', icon: <CircleDot /> },
  }[level];
  return (
    <Badge tone={map.tone} icon={map.icon} title={score != null ? `风险分 ${score}` : undefined}>
      {map.label}
      {score != null && <span className="num opacity-70">{score}</span>}
    </Badge>
  );
}

export function HealthBadge({ health }: { health: 'good' | 'warn' | 'bad' }) {
  const m = {
    good: { tone: 'good' as const, label: '正常', icon: <CheckCircle2 /> },
    warn: { tone: 'warn' as const, label: '关注', icon: <HelpCircle /> },
    bad: { tone: 'crit' as const, label: '告警', icon: <AlertTriangle /> },
  }[health];
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {m.label}
    </Badge>
  );
}
