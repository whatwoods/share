import { ymd } from '@/lib/format';
import { DateInput } from './Fields';
import { Segmented } from './Segmented';

type Preset = 'all' | '7' | '30' | '90' | 'ytd' | 'custom';

/** 时间范围：预设优先，自定义在后 */
export function DateRange({
  from,
  to,
  onChange,
  allowAll = true,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  allowAll?: boolean;
}) {
  const today = ymd(0);
  const preset: Preset = !from && !to ? 'all' : to === today || !to ? detect(from, today) : 'custom';
  const opts: { value: Preset; label: string }[] = [
    ...(allowAll ? [{ value: 'all' as Preset, label: '全部' }] : []),
    { value: '7', label: '近7天' },
    { value: '30', label: '近30天' },
    { value: '90', label: '近90天' },
    { value: 'ytd', label: '今年' },
    { value: 'custom', label: '自定义' },
  ];
  const pick = (p: Preset) => {
    if (p === 'all') onChange('', '');
    else if (p === 'ytd') onChange(`${today.slice(0, 4)}-01-01`, today);
    else if (p === 'custom') onChange(from || ymd(-30), to || today);
    else onChange(ymd(-(Number(p) - 1)), today);
  };
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Segmented value={preset} onChange={pick} options={opts} />
      {preset === 'custom' && (
        <>
          <DateInput label="开始日期" value={from} onChange={(v) => onChange(v, to)} />
          <span className="text-ink-3">—</span>
          <DateInput label="结束日期" value={to} onChange={(v) => onChange(from, v)} />
        </>
      )}
    </div>
  );
}

function detect(from: string, today: string): Preset {
  for (const n of [7, 30, 90]) if (from === ymd(-(n - 1))) return String(n) as Preset;
  if (from === `${today.slice(0, 4)}-01-01`) return 'ytd';
  return 'custom';
}
