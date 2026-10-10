import clsx from 'clsx';
import type { ReactNode } from 'react';

/** 下划线式标签页 */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx('flex items-center gap-6 border-b border-line', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              '-mb-px flex h-10 items-center gap-1.5 border-b-2 text-[14px] whitespace-nowrap transition-colors',
              active ? 'border-ink-1 font-medium text-ink-1' : 'border-transparent text-ink-3 hover:text-ink-1',
            )}
          >
            {o.label}
            {o.count != null && <span className={clsx('num text-[12px]', active ? 'text-ink-2' : 'text-ink-4')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
