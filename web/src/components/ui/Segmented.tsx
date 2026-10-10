import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx('inline-flex shrink-0 items-center gap-0.5 rounded-[9px] bg-hover p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-[7px] font-medium whitespace-nowrap transition-all duration-150',
              size === 'sm' ? 'h-6 px-2 text-caption' : 'h-7 px-3 text-body',
              active ? 'bg-surface text-ink-1 shadow-[0_1px_2px_rgba(15,23,41,.08),0_0_0_1px_rgba(15,23,41,.04)]' : 'text-ink-2 hover:text-ink-1',
            )}
          >
            {o.label}
            {o.count != null && <span className={clsx('num text-micro', active ? 'text-ink-3' : 'text-ink-4')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
