import clsx from 'clsx';
import type { Ticket } from '@shared/contract';
import { buildingShort } from '@/lib/buildings';
import { fmtDate } from '@/lib/format';
import { Dot, OverdueText, statusTone, Tag } from '../ui/Status';

/** Linear 式列表行：一行一单，信息按重要度从左到右 */
export function TicketRow({ t, onOpen, showStatus = true, dense }: { t: Ticket; onOpen: (t: Ticket) => void; showStatus?: boolean; dense?: boolean }) {
  return (
    <button
      onClick={() => onOpen(t)}
      className={clsx(
        'group -mx-2 grid w-[calc(100%+16px)] grid-cols-[14px_64px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 text-left transition-colors hover:bg-subtle md:grid-cols-[14px_64px_minmax(0,1fr)_132px_96px]',
        '[&+&]:shadow-[0_-1px_0_var(--color-line)]',
        dense ? 'h-10' : 'h-11',
      )}
    >
      <span title={t.status}>{showStatus ? <Dot tone={statusTone(t.status)} /> : null}</span>
      <span className="num truncate text-[13px] text-ink-2">
        {buildingShort(t.building)}
        {t.floor && <span className="text-ink-3"> {t.floor}F</span>}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[14px] text-ink-1">{t.description || '（无描述）'}</span>
        {t.status === '幕墙专项' && <Tag tone="violet">幕墙专项</Tag>}
        {t.isSpecial && <Tag>专项摸排</Tag>}
      </span>
      <span className="truncate text-[13px] text-ink-3 max-md:hidden">{t.type}</span>
      <span className="text-right">
        {t.column === '已完成' ? <span className="num text-[13px] text-ink-3">{fmtDate(t.reportedAt)}</span> : <OverdueText level={t.overdue} ageHours={t.ageHours} />}
      </span>
    </button>
  );
}
