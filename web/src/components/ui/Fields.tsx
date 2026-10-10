import clsx from 'clsx';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Meta } from '@shared/contract';

/** 筛选下拉：未选时为灰色文字按钮，选中后显示「标签：值」并可一键清除 */
export function Select({
  value,
  onChange,
  options,
  placeholder = '全部',
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  label?: string;
  className?: string;
  width?: number;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <span
      className={clsx(
        'relative inline-flex h-[30px] shrink-0 items-center rounded-md text-[13px] transition-colors',
        value ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-hover',
        className,
      )}
    >
      <span className="pointer-events-none flex items-center gap-1 pr-6 pl-2.5 whitespace-nowrap">
        {value ? (
          <>
            {label && <span className="opacity-70">{label}</span>}
            <span className="font-medium">{current?.label ?? value}</span>
          </>
        ) : (
          placeholder
        )}
      </span>
      {value ? (
        <button aria-label="清除" onClick={() => onChange('')} className="absolute right-1 z-[1] grid size-5 place-items-center rounded hover:bg-accent/10">
          <X className="size-3" />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-ink-3" />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label ?? placeholder}
        className={clsx('absolute inset-0 cursor-pointer opacity-0', value && 'right-6')}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** 楼栋筛选（维修页、遗留攻坚页共用） */
export function BuildingSelect({ meta, value, onChange }: { meta?: Meta; value: string; onChange: (v: string) => void }) {
  return <Select value={value} onChange={onChange} placeholder="楼栋" label="楼栋" options={(meta?.buildings ?? []).map((b) => ({ value: b.code, label: b.name }))} />;
}

/** 防抖关键词输入（250ms） */
export function SearchInput({ value, onChange, placeholder = '搜索…', width = 220 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  const [v, setV] = useState(value);
  const first = useRef(true);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => v !== value && onChange(v), 250);
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
    <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-[13px] text-ink-2 select-none" title={hint}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-4 w-7 rounded-full transition-colors duration-150', checked ? 'bg-accent' : 'bg-ink-4')}
      >
        <span className={clsx('absolute top-[2px] left-[2px] size-3 rounded-full bg-white shadow transition-transform duration-150', checked && 'translate-x-3')} />
      </button>
      <span className={checked ? 'text-ink-1' : ''}>{label}</span>
    </label>
  );
}

export function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input type="date" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} className="field num w-[132px]" />;
}

/** 筛选条：一行，位于内容上方 */
export function FilterBar({ children, onReset, active, className }: { children: ReactNode; onReset?: () => void; active?: boolean; className?: string }) {
  return (
    <div className={clsx('scroll-thin -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1', className)}>
      {children}
      {active && onReset && (
        <button onClick={onReset} className="ml-1 h-[30px] shrink-0 rounded-md px-2 text-[13px] text-ink-3 hover:bg-hover hover:text-ink-1">
          清除筛选
        </button>
      )}
    </div>
  );
}
