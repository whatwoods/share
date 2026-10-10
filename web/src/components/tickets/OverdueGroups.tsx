import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Ticket } from '@shared/contract';
import { remindGroup, remindText } from '@/lib/remind';
import { CopyButton } from '../ui/Copy';
import { Empty } from '../ui/States';
import { TicketRow } from './TicketRow';

/** 超时工单按「催办对象」分组：每组一键复制催办文本 */
export function OverdueGroups({ tickets, onOpen, limitPerGroup = 6 }: { tickets: Ticket[]; onOpen: (t: Ticket) => void; limitPerGroup?: number }) {
  const groups = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of tickets) {
      const g = remindGroup(t);
      m.set(g, [...(m.get(g) ?? []), t]);
    }
    return [...m.entries()]
      .map(([name, ts]) => ({
        name,
        items: [...ts].sort((a, b) => (a.overdue === b.overdue ? (b.ageHours ?? 0) - (a.ageHours ?? 0) : a.overdue === 'red' ? -1 : 1)),
        red: ts.filter((t) => t.overdue === 'red').length,
      }))
      .sort((a, b) => b.red - a.red || b.items.length - a.items.length);
  }, [tickets]);

  if (!tickets.length) return <Empty title="没有超时工单" hint="所有在途工单都在时限内" />;
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Group key={g.name} name={g.name} items={g.items} red={g.red} limit={limitPerGroup} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Group({ name, items, red, limit, onOpen }: { name: string; items: Ticket[]; red: number; limit: number; onOpen: (t: Ticket) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[13px] font-medium text-ink-1">{name}</span>
        <span className="num text-[12px] text-ink-3">
          {items.length} 单{red > 0 && red !== items.length && ` · 超时 ${red}`}
        </span>
        <span className="flex-1" />
        <CopyButton label="复制催办" text={() => remindText(name, items)} title="生成可粘贴到微信 / 飞书群的催办消息" />
      </div>
      <div>
        {shown.map((t) => (
          <TicketRow key={t.id} t={t} onOpen={onOpen} dense />
        ))}
      </div>
      {items.length > limit && (
        <button onClick={() => setAll((v) => !v)} className="mt-1 inline-flex items-center gap-0.5 text-[13px] text-ink-3 hover:text-ink-1">
          {all ? '收起' : `展开其余 ${items.length - limit} 单`}
          <ChevronRight className={`size-3.5 transition-transform ${all ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      )}
    </div>
  );
}
