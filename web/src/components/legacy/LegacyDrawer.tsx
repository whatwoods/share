import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { LegacyItem } from '@shared/contract';
import { buildingName } from '@/lib/buildings';
import { fmtDateTime, fmtDays } from '@/lib/format';
import { Drawer, Field } from '../ui/Drawer';
import { RiskText, StatusText, Tag } from '../ui/Status';

export function LegacyDrawer({ item, onClose }: { item: LegacyItem | null; onClose: () => void }) {
  const navigate = useNavigate();
  const i = item;
  return (
    <Drawer open={!!i} onClose={onClose} title={i?.description ?? ''} meta={i && <span className="num">施工遗留 · 序号 {i.seq ?? '—'} · {i.sourceTable}</span>}>
      {i && (
        <div className="space-y-6">
          <dl>
            <Field label="状态">
              <StatusText status={i.status} />
            </Field>
            <Field label="风险">
              <span className="flex flex-wrap items-center gap-2">
                <RiskText level={i.risk.level} score={i.risk.score} />
                {i.risk.tags
                  .filter((t) => t !== i.status)
                  .map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
              </span>
            </Field>
            <Field label="责任单位">{i.unit || '—'}</Field>
            <Field label="位置">
              <button className="inline-flex items-center gap-0.5 hover:text-accent-ink" onClick={() => (onClose(), navigate(`/buildings?b=${i.building}`))}>
                {buildingName(i.building)}
                {i.floor && ` · ${i.floor} 层`}
                <ArrowUpRight className="size-3.5 text-ink-3" />
              </button>
            </Field>
            <Field label="类型">{i.type || '—'}</Field>
            <Field label="报修时间">
              <span className="num">{fmtDateTime(i.reportedAt)}</span>
            </Field>
            <Field label="挂账时长">
              <span className="num">{fmtDays(i.ageDays)}</span>
            </Field>
          </dl>
          <div>
            <div className="mb-2 text-[12px] text-ink-3">最新进展 / 卡点</div>
            <p className="border-l-2 border-ink-1 pl-3 text-[15px] leading-7 whitespace-pre-wrap text-ink-1">{i.progress || '暂无进展记录'}</p>
          </div>
        </div>
      )}
    </Drawer>
  );
}
