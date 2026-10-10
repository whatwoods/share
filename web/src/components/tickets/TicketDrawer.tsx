import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Ticket } from '@shared/contract';
import { buildingName } from '@/lib/buildings';
import { fmtAge, fmtDateTime } from '@/lib/format';
import { remindText } from '@/lib/remind';
import { CopyButton } from '../ui/Copy';
import { Drawer, Field } from '../ui/Drawer';
import { OverdueText, StatusText, Tag } from '../ui/Status';

export function TicketDrawer({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const navigate = useNavigate();
  const t = ticket;
  return (
    <Drawer open={!!t} onClose={onClose} title={t?.description || '工单详情'} meta={t && <span className="num">日常维修 · {t.id}</span>}>
      {t && (
        <div className="space-y-6">
          <dl>
            <Field label="状态">
              <span className="flex flex-wrap items-center gap-3">
                <StatusText status={t.status} />
                {t.column !== '已完成' && <OverdueText level={t.overdue} ageHours={t.ageHours} />}
                {t.isSpecial && <Tag>专项摸排</Tag>}
              </span>
            </Field>
            <Field label="位置">
              <button className="inline-flex items-center gap-0.5 hover:text-accent-ink" onClick={() => (onClose(), navigate(`/buildings?b=${t.building}`))}>
                {buildingName(t.building)}
                {t.floor && ` · ${t.floor} 层`}
                <ArrowUpRight className="size-3.5 text-ink-3" />
              </button>
            </Field>
            <Field label="工种">
              {t.type || '—'}
              {t.owner && <span className="text-ink-3"> · {t.owner}</span>}
            </Field>
            {t.remarkParsed.unit && <Field label="责任单位">{t.remarkParsed.unit}</Field>}
            <Field label="报修渠道">{t.channel || '—'}</Field>
            {t.remarkParsed.reporter && <Field label="报修人">{t.remarkParsed.reporter}</Field>}
            <Field label="报修时间">
              <span className="num">{fmtDateTime(t.reportedAt)}</span>
            </Field>
            <Field label="挂单时长">
              <span className="num">{t.column === '已完成' ? '已闭环' : fmtAge(t.ageHours)}</span>
            </Field>
            {t.remarkParsed.plan && <Field label="处理方案">{t.remarkParsed.plan}</Field>}
            {t.remarkParsed.extra &&
              Object.entries(t.remarkParsed.extra).map(([k, v]) => (
                <Field key={k} label={k}>
                  {v}
                </Field>
              ))}
          </dl>
          <div>
            <div className="mb-2 text-[12px] text-ink-3">备注原文</div>
            <p className="rounded-lg bg-subtle p-3 text-[14px] whitespace-pre-wrap text-ink-2">{t.remark || '—'}</p>
          </div>
          {t.column !== '已完成' && (
            <div className="flex items-center gap-2 border-t border-line pt-4">
              <CopyButton label="复制催办文本" text={() => remindText(t.remarkParsed.unit || t.owner || '', [t])} />
              <span className="text-[12px] text-ink-3">粘贴到微信 / 飞书群即可催办</span>
            </div>
          )}
          <p className="text-[12px] text-ink-4">只读视图 · 状态以飞书多维表格为准，飞书中修改后下次同步自动更新</p>
        </div>
      )}
    </Drawer>
  );
}
