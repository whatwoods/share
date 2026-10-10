import clsx from 'clsx';
import type { Ticket } from '@shared/contract';
import { buildingShort } from '@/lib/buildings';
import { fmtAge, fmtDate } from '@/lib/format';
import { Badge, OverdueBadge } from '../ui/Badge';

const bar = { red: 'bg-crit', yellow: 'bg-warn', none: 'bg-transparent' } as const;

export function TicketCard({ t, onOpen }: { t: Ticket; onOpen: (t: Ticket) => void }) {
  return (
    <button
      onClick={() => onOpen(t)}
      className="group relative w-full shrink-0 overflow-hidden rounded-[10px] border border-line bg-surface p-3 pl-3.5 text-left shadow-card transition-[border-color,box-shadow,transform] duration-150 hover:border-line-strong hover:shadow-pop"
    >
      <span className={clsx('absolute top-0 bottom-0 left-0 w-[3px]', bar[t.overdue])} aria-hidden />
      <div className="mb-1.5 flex items-center gap-1.5">
        <Badge tone="building" className="num">
          {buildingShort(t.building)}
          {t.floor && ` ${t.floor}F`}
        </Badge>
        <span className="truncate text-caption text-ink-3">{t.type}</span>
        {t.status === '幕墙专项' && <Badge tone="legacy">幕墙专项</Badge>}
        {t.isSpecial && <Badge tone="neutral">专项摸排</Badge>}
      </div>
      <p className="line-clamp-2 text-body text-ink-1">{t.description || '（无描述）'}</p>
      <div className="mt-2 flex items-center gap-2 text-caption text-ink-3">
        <span className="truncate">{t.channel || '—'}</span>
        <span className="text-ink-4">·</span>
        <span className="num shrink-0">{t.column === '已完成' ? fmtDate(t.reportedAt) : fmtAge(t.ageHours)}</span>
        <span className="flex-1" />
        <OverdueBadge level={t.overdue} ageHours={t.ageHours} />
      </div>
    </button>
  );
}
