import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { OverdueLevel } from '@shared/contract';
import { fmtAge } from '@/lib/format';

export type Tone = 'crit' | 'warn' | 'good' | 'info' | 'violet' | 'neutral';

const dot: Record<Tone, string> = {
  crit: 'bg-crit',
  warn: 'bg-warn',
  good: 'bg-good',
  info: 'bg-info',
  violet: 'bg-violet',
  neutral: 'bg-ink-4',
};
const ink: Record<Tone, string> = {
  crit: 'text-crit-ink',
  warn: 'text-warn-ink',
  good: 'text-good-ink',
  info: 'text-info-ink',
  violet: 'text-violet-ink',
  neutral: 'text-ink-2',
};

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={clsx('inline-block size-[7px] shrink-0 rounded-full', dot[tone], className)} />;
}

/** 状态：圆点 + 文字（不加底色，保持安静） */
export function StatusText({ status, className }: { status: string; className?: string }) {
  const tone = statusTone(status);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-ink-2', className)}>
      <Dot tone={tone} />
      {status || '—'}
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
    case '重复漏水':
    case '计划逾期':
      return 'crit';
    case '有争议':
    case '幕墙专项':
      return 'violet';
    default:
      return 'neutral';
  }
}

/** 超时：只在有超时时出现，红/黄文字 */
export function OverdueText({ level, ageHours, className }: { level: OverdueLevel; ageHours: number | null; className?: string }) {
  if (level === 'none') return <span className={clsx('num text-[13px] text-ink-3', className)}>{fmtAge(ageHours)}</span>;
  return (
    <span className={clsx('num inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap', ink[level === 'red' ? 'crit' : 'warn'], className)}>
      <Dot tone={level === 'red' ? 'crit' : 'warn'} />
      {fmtAge(ageHours)}
    </span>
  );
}

export function RiskText({ level, score }: { level: 'high' | 'medium' | 'low'; score?: number }) {
  const m = { high: ['crit', '高危'], medium: ['warn', '中危'], low: ['neutral', '一般'] } as const;
  const [tone, label] = m[level];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap', ink[tone])}>
      <Dot tone={tone} />
      {label}
      {score != null && <span className="num font-normal text-ink-3">{score}</span>}
    </span>
  );
}

/** 中性小标签 */
export function Tag({ children, className, tone }: { children: ReactNode; className?: string; tone?: Tone }) {
  return (
    <span
      className={clsx(
        'inline-flex h-5 shrink-0 items-center rounded-[5px] px-1.5 text-[12px] whitespace-nowrap',
        tone ? clsx(ink[tone], { crit: 'bg-crit-soft', warn: 'bg-warn-soft', good: 'bg-good-soft', info: 'bg-info-soft', violet: 'bg-violet-soft', neutral: 'bg-hover' }[tone]) : 'bg-hover text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  );
}
