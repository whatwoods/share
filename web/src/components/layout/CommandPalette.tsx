import clsx from 'clsx';
import { ArrowRight, Building2, CornerDownLeft, FileWarning, Search, Wrench } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import type { LegacyItem, Ticket } from '@shared/contract';
import { buildingShort } from '@/lib/buildings';
import { useLegacy, useMeta, useTickets } from '@/lib/queries';
import { LegacyDrawer } from '../legacy/LegacyDrawer';
import { TicketDrawer } from '../tickets/TicketDrawer';
import { OverdueText, StatusText } from '../ui/Status';
import { NAV } from './AppShell';

type Item =
  | { kind: 'page'; key: string; label: string; to: string }
  | { kind: 'building'; key: string; label: string; to: string }
  | { kind: 'ticket'; key: string; t: Ticket }
  | { kind: 'legacy'; key: string; l: LegacyItem };

/** ⌘K 全局搜索：页面 / 楼栋 / 工单 / 遗留 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [idx, setIdx] = useState(0);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [legacy, setLegacy] = useState<LegacyItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const meta = useMeta();

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const tickets = useTickets({ q: dq, pageSize: 6, sort: '-reportedAt' }, open && !!dq);
  const legacies = useLegacy({ q: dq }, open && !!dq);

  const items = useMemo<Item[]>(() => {
    const k = dq.toLowerCase();
    const pages: Item[] = NAV.filter((n) => !k || n.label.includes(k)).map((n) => ({ kind: 'page', key: `p${n.to}`, label: n.label, to: n.to }));
    const blds: Item[] = (meta.data?.buildings ?? [])
      .filter((b) => k && (b.name.includes(k) || b.short.toLowerCase() === k || b.code.toLowerCase() === k || `${Number(b.code.slice(1))}` === k))
      .slice(0, 4)
      .map((b) => ({ kind: 'building', key: b.code, label: b.name, to: `/buildings?b=${b.code}` }));
    const ts: Item[] = dq ? (tickets.data?.items ?? []).slice(0, 6).map((t) => ({ kind: 'ticket', key: t.id, t })) : [];
    const ls: Item[] = dq ? (legacies.data?.items ?? []).slice(0, 5).map((l) => ({ kind: 'legacy', key: l.id, l })) : [];
    return [...blds, ...ts, ...ls, ...(dq ? [] : pages)];
  }, [dq, meta.data, tickets.data, legacies.data]);

  useEffect(() => setIdx(0), [dq]);

  const choose = (it: Item) => {
    if (it.kind === 'page' || it.kind === 'building') {
      navigate(it.to);
      onClose();
    } else if (it.kind === 'ticket') setTicket(it.t);
    else setLegacy(it.l);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setIdx((i) => Math.min(items.length - 1, i + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setIdx((i) => Math.max(0, i - 1)));
    else if (e.key === 'Enter' && items[idx]) (e.preventDefault(), choose(items[idx]));
    else if (e.key === 'Escape') onClose();
  };

  const group = (k: Item['kind']) => ({ page: '跳转', building: '楼栋', ticket: '日常工单', legacy: '施工遗留' })[k];

  return (
    <>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-start justify-center px-4 pt-[12vh]">
            <div className="absolute inset-0 animate-[fade-in_120ms_ease-out] bg-black/[.16]" onClick={onClose} />
            <div className="relative w-full max-w-[640px] animate-[pop-in_160ms_var(--ease-out-soft)] overflow-hidden rounded-xl bg-surface shadow-pop">
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search className="size-4 text-ink-3" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="搜索工单描述、遗留问题、楼栋（如 3号楼 / 漏水 / 后厨）"
                  className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-4"
                />
                <span className="kbd">Esc</span>
              </div>
              <div className="scroll-thin max-h-[56vh] overflow-y-auto p-2">
                {items.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-ink-3">{tickets.isFetching ? '搜索中…' : '没有匹配结果'}</p>}
                {items.map((it, i) => {
                  const showHead = i === 0 || items[i - 1].kind !== it.kind;
                  return (
                    <div key={`${it.kind}-${it.key}`}>
                      {showHead && <div className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-ink-3">{group(it.kind)}</div>}
                      <button
                        onMouseMove={() => setIdx(i)}
                        onClick={() => choose(it)}
                        className={clsx('flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[14px]', i === idx ? 'bg-hover' : '')}
                      >
                        {it.kind === 'page' && (
                          <>
                            <ArrowRight className="size-3.5 text-ink-3" />
                            <span className="flex-1">{it.label}</span>
                          </>
                        )}
                        {it.kind === 'building' && (
                          <>
                            <Building2 className="size-3.5 text-ink-3" />
                            <span className="flex-1">{it.label}</span>
                            <span className="text-[12px] text-ink-3">查看楼栋全景</span>
                          </>
                        )}
                        {it.kind === 'ticket' && (
                          <>
                            <Wrench className="size-3.5 shrink-0 text-ink-3" />
                            <span className="num w-14 shrink-0 text-[13px] text-ink-3">{buildingShort(it.t.building)} {it.t.floor && `${it.t.floor}F`}</span>
                            <span className="min-w-0 flex-1 truncate">{it.t.description}</span>
                            {it.t.column === '已完成' ? <StatusText status={it.t.status} /> : <OverdueText level={it.t.overdue} ageHours={it.t.ageHours} />}
                          </>
                        )}
                        {it.kind === 'legacy' && (
                          <>
                            <FileWarning className="size-3.5 shrink-0 text-ink-3" />
                            <span className="num w-14 shrink-0 text-[13px] text-ink-3">{buildingShort(it.l.building)}</span>
                            <span className="min-w-0 flex-1 truncate">{it.l.description}</span>
                            <span className="text-[12px] text-ink-3">{it.l.unit}</span>
                          </>
                        )}
                        {i === idx && <CornerDownLeft className="size-3.5 shrink-0 text-ink-3" />}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-ink-3">
                <span className="flex items-center gap-1">
                  <span className="kbd">↑</span>
                  <span className="kbd">↓</span> 选择
                </span>
                <span className="flex items-center gap-1">
                  <span className="kbd">↵</span> 打开
                </span>
                <span className="ml-auto">随时按 / 或 ⌘K 呼出</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
      <TicketDrawer ticket={ticket} onClose={() => setTicket(null)} />
      <LegacyDrawer item={legacy} onClose={() => setLegacy(null)} />
    </>
  );
}
