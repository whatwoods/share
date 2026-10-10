import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Dot, type Tone } from './Status';

/** 排版式指标：不要卡片，用字号与留白建立层级 */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  size = 'lg',
  onClick,
  loading,
  className,
  trailing,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  size?: 'hero' | 'lg' | 'md';
  onClick?: () => void;
  loading?: boolean;
  className?: string;
  trailing?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'group flex min-w-0 flex-col items-start text-left',
        onClick && '-m-2 rounded-lg p-2 transition-colors hover:bg-hover',
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
        {tone && <Dot tone={tone} />}
        {label}
      </span>
      {loading ? (
        <span className={clsx('skeleton mt-1.5', size === 'hero' ? 'h-14 w-32' : size === 'lg' ? 'h-9 w-24' : 'h-7 w-20')} />
      ) : (
        <span className="mt-1 flex items-baseline gap-1">
          <span
            className={clsx(
              'num tight font-medium text-ink-1',
              size === 'hero' ? 'text-hero' : size === 'lg' ? 'text-stat' : 'text-[24px] leading-8',
            )}
          >
            {value}
          </span>
          {unit && <span className={clsx('text-ink-3', size === 'hero' ? 'text-[18px]' : 'text-[14px]')}>{unit}</span>}
          {trailing}
        </span>
      )}
      {sub && <span className="mt-1 text-[13px] text-ink-3">{sub}</span>}
    </Tag>
  );
}

/** 指标行：竖向细线分隔 */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'grid gap-y-6 [&>*]:px-6 [&>*:first-child]:pl-0 max-lg:[&>*]:pl-0 lg:divide-x lg:divide-line',
        className,
      )}
    >
      {children}
    </div>
  );
}
