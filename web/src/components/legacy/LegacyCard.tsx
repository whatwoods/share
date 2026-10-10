import clsx from 'clsx';
import type { LegacyItem } from '@shared/contract';
import { buildingShort } from '@/lib/buildings';
import { fmtDays } from '@/lib/format';
import { Badge, RiskBadge, StatusBadge } from '../ui/Badge';

export function LegacyCard({ item, onOpen, compact }: { item: LegacyItem; onOpen: (i: LegacyItem) => void; compact?: boolean }) {
  return (
    <button
      onClick={() => onOpen(item)}
      className={clsx(
        'group relative w-full overflow-hidden rounded-[10px] border bg-surface text-left shadow-card transition-[border-color,box-shadow] duration-150 hover:shadow-pop',
        item.risk.level === 'high' && item.isOpen ? 'border-crit/25 hover:border-crit/45' : 'border-line hover:border-line-strong',
        compact ? 'p-3' : 'p-3.5',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {item.seq != null && <span className="num text-micro text-ink-4">#{item.seq}</span>}
        <Badge tone="building" className="num">
          {buildingShort(item.building)}
          {item.floor && ` ${item.floor}F`}
        </Badge>
        <span className="truncate text-caption text-ink-3">{item.type}</span>
        <span className="flex-1" />
        <RiskBadge level={item.risk.level} score={compact ? undefined : item.risk.score} />
      </div>
      <p className={clsx('text-body font-medium text-ink-1', compact ? 'line-clamp-1' : 'line-clamp-2')}>{item.description}</p>
      {!compact && item.progress && <p className="mt-1 line-clamp-2 text-caption text-ink-2">{item.progress}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.status} />
        {item.risk.tags.slice(0, compact ? 2 : 4).map((tag) => (
          <Badge key={tag} tone="neutral">
            {tag}
          </Badge>
        ))}
        <span className="flex-1" />
        {item.ageDays != null && <span className="num text-caption text-ink-3">挂账 {fmtDays(item.ageDays)}</span>}
      </div>
    </button>
  );
}
