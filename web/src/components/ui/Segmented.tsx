import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx('inline-flex shrink-0 items-center rounded-lg bg-hover p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'inline-flex h-[26px] items-center gap-1 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-all duration-150',
              active ? 'bg-surface font-medium text-ink-1 shadow-[0_0_0_1px_rgba(0,0,0,.06),0_1px_2px_rgba(0,0,0,.06)]' : 'text-ink-3 hover:text-ink-1',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
