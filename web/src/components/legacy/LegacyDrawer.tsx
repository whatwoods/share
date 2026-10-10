import { useNavigate } from 'react-router';
import type { LegacyItem } from '@shared/contract';
import { buildingName } from '@/lib/buildings';
import { fmtDateTime, fmtDays } from '@/lib/format';
import { Badge, RiskBadge, StatusBadge } from '../ui/Badge';
import { Drawer, Field } from '../ui/Drawer';

export function LegacyDrawer({ item, onClose }: { item: LegacyItem | null; onClose: () => void }) {
  const navigate = useNavigate();
  const i = item;
  return (
    <Drawer
      open={!!i}
      onClose={onClose}
      title={i?.description ?? ''}
      subtitle={i && <span className="num">专项台账 序号 {i.seq ?? '—'} · {i.sourceTable}</span>}
    >
      {i && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={i.status} />
            <RiskBadge level={i.risk.level} score={i.risk.score} />
            {i.risk.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
          <section className="rounded-[12px] border border-legacy/20 bg-legacy-soft/60 p-4">
            <div className="mb-1.5 text-caption font-medium text-legacy">最新进展 / 卡点</div>
            <p className="text-body whitespace-pre-wrap text-ink-1">{i.progress || '暂无进展记录'}</p>
          </section>
          <dl className="divide-y divide-line/70">
            <Field label="责任单位">{i.unit || '—'}</Field>
            <Field label="位置">
              <button className="font-medium text-brand-ink hover:underline" onClick={() => (onClose(), navigate(`/buildings?b=${i.building}`))}>
                {buildingName(i.building)}
              </button>
              {i.floor && <span className="text-ink-2"> · {i.floor} 层</span>}
            </Field>
            <Field label="工单类型">{i.type || '—'}</Field>
            <Field label="报修时间">
              <span className="num">{fmtDateTime(i.reportedAt)}</span>
            </Field>
            <Field label="挂账时长">
              <span className="num">{fmtDays(i.ageDays)}</span>
            </Field>
            <Field label="来源表">{i.sourceTable}</Field>
          </dl>
        </div>
      )}
    </Drawer>
  );
}
