import clsx from 'clsx';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Select({
  value,
  onChange,
  options,
  placeholder = '全部',
  label,
  className,
  width = 128,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  label?: string;
  className?: string;
  width?: number;
}) {
  return (
    <label className={clsx('relative inline-flex shrink-0 items-center', className)} style={{ width }}>
      {label && <span className="pointer-events-none absolute left-2.5 text-caption text-ink-3">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label ?? placeholder}
        className={clsx('field w-full appearance-none pr-7', label && 'pl-[calc(10px+3.2em)]', value ? 'font-medium text-ink-1' : 'text-ink-2')}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-ink-3" />
    </label>
  );
}

/** 防抖关键词输入（300ms） */
export function SearchInput({
  value,
  onChange,
  placeholder = '搜索…',
  width = 220,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  const [v, setV] = useState(value);
  const first = useRef(true);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => v !== value && onChange(v), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <label className="relative inline-flex shrink-0 items-center" style={{ width }}>
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onChange(v)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field w-full pr-7 pl-8 placeholder:text-ink-4"
      />
      {v && (
        <button aria-label="清除" onClick={() => (setV(''), onChange(''))} className="absolute right-1.5 rounded p-0.5 text-ink-3 hover:bg-hover hover:text-ink-1">
          <X className="size-3.5" />
        </button>
      )}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-body text-ink-2 select-none" title={hint}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-[18px] w-8 rounded-full transition-colors duration-150', checked ? 'bg-brand' : 'bg-ink-4')}
      >
        <span
          className={clsx(
            'absolute top-[2px] left-[2px] size-[14px] rounded-full bg-white shadow transition-transform duration-150',
            checked && 'translate-x-[14px]',
          )}
        />
      </button>
      <span className={checked ? 'font-medium text-ink-1' : ''}>{label}</span>
    </label>
  );
}

export function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="date"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="field num w-[136px] text-caption"
    />
  );
}

/** 筛选条：一行、位于内容上方，可横向滚动 */
export function FilterBar({ children, onReset, active }: { children: ReactNode; onReset?: () => void; active?: boolean }) {
  return (
    <div className="scroll-thin -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
      {children}
      {active && onReset && (
        <button onClick={onReset} className="ml-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-sm px-2 text-caption font-medium text-brand-ink hover:bg-brand-soft">
          <X className="size-3.5" />
          重置筛选
        </button>
      )}
    </div>
  );
}
