import { useNavigate } from 'react-router';
import type { Ticket } from '@shared/contract';
import { buildingName } from '@/lib/buildings';
import { fmtAge, fmtDateTime } from '@/lib/format';
import { Badge, OverdueBadge, StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer, Field } from '../ui/Drawer';

export function TicketDrawer({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const navigate = useNavigate();
  const t = ticket;
  return (
    <Drawer
      open={!!t}
      onClose={onClose}
      title={t ? t.description || '工单详情' : ''}
      subtitle={t && <span className="num">飞书记录 {t.id}</span>}
    >
      {t && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            <OverdueBadge level={t.overdue} ageHours={t.ageHours} />
            {t.isSpecial && <Badge tone="neutral">专项摸排</Badge>}
            {t.owner && <Badge tone="repair">{t.owner}</Badge>}
          </div>
          <dl className="divide-y divide-line/70">
            <Field label="位置">
              <button className="font-medium text-brand-ink hover:underline" onClick={() => (onClose(), navigate(`/buildings?b=${t.building}`))}>
                {buildingName(t.building)}
              </button>
              {t.floor && <span className="text-ink-2"> · {t.floor} 层</span>}
              {t.buildingRaw && t.building === 'UNKNOWN' && <span className="text-ink-3">（原始：{t.buildingRaw}）</span>}
            </Field>
            <Field label="工种">{t.type || '—'}</Field>
            <Field label="报修渠道">{t.channel || '—'}</Field>
            <Field label="报修时间">
              <span className="num">{fmtDateTime(t.reportedAt)}</span>
            </Field>
            <Field label="挂单时长">
              <span className="num">{t.column === '已完成' ? '已闭环' : fmtAge(t.ageHours)}</span>
            </Field>
            {t.remarkParsed.unit && <Field label="责任单位">{t.remarkParsed.unit}</Field>}
            {t.remarkParsed.reporter && <Field label="报修人">{t.remarkParsed.reporter}</Field>}
            {t.remarkParsed.plan && <Field label="处理方案">{t.remarkParsed.plan}</Field>}
            {t.remarkParsed.extra &&
              Object.entries(t.remarkParsed.extra).map(([k, v]) => (
                <Field key={k} label={k}>
                  {v}
                </Field>
              ))}
          </dl>
          <div>
            <div className="mb-2 text-caption font-medium text-ink-3">备注原文</div>
            <div className="rounded-[10px] bg-subtle p-3 text-body whitespace-pre-wrap text-ink-2">{t.remark || '—'}</div>
            {t.remarkParsed.fingerprint && <div className="num mt-2 text-micro text-ink-4">特征指纹 {t.remarkParsed.fingerprint}</div>}
          </div>
          <p className="text-caption text-ink-3">第一版为只读视图：状态以飞书多维表格为准，如需流转请在飞书中处理，下次同步后自动更新。</p>
          <Button variant="secondary" onClick={() => (onClose(), navigate(`/repair?view=list&building=${t.building}`))}>
            查看该楼栋全部工单
          </Button>
        </div>
      )}
    </Drawer>
  );
}
