import clsx from 'clsx';
import type { LegacyItem } from '@shared/contract';
import { buildingShort } from '@/lib/buildings';
import { fmtDays } from '@/lib/format';
import { Dot, StatusText } from '../ui/Status';

export function LegacyRow({ item, onOpen, showUnit }: { item: LegacyItem; onOpen: (i: LegacyItem) => void; showUnit?: boolean }) {
  const riskTone = item.risk.level === 'high' ? 'crit' : item.risk.level === 'medium' ? 'warn' : 'neutral';
  return (
    <button
      onClick={() => onOpen(item)}
      className={clsx(
        'grid w-[calc(100%+16px)] items-center gap-x-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-subtle [&+&]:shadow-[0_-1px_0_var(--color-line)]',
        '-mx-2 grid-cols-[14px_64px_minmax(0,1fr)_auto]',
        showUnit ? 'md:grid-cols-[14px_64px_minmax(0,1fr)_88px_96px_72px]' : 'md:grid-cols-[14px_64px_minmax(0,1fr)_96px_72px]',
      )}
    >
      <span title={`风险 ${item.risk.score}`}>
        <Dot tone={riskTone} />
      </span>
      <span className="num truncate text-[13px] text-ink-2">
        {buildingShort(item.building)}
        {item.floor && <span className="text-ink-3"> {item.floor}F</span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] text-ink-1">{item.description}</span>
        {item.progress && <span className="block truncate text-[13px] text-ink-3">{item.progress}</span>}
      </span>
      {showUnit && <span className="truncate text-[13px] text-ink-2 max-md:hidden">{item.unit}</span>}
      <span className="max-md:hidden">
        <StatusText status={item.status} />
      </span>
      <span className="num text-right text-[13px] text-ink-3 max-md:hidden">{fmtDays(item.ageDays)}</span>
    </button>
  );
}
