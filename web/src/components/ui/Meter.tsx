import clsx from 'clsx';

/** 完成率条：填充 = 业务色，轨道为同色浅阶 */
export function Meter({ value, tone = 'repair', className }: { value: number; tone?: 'repair' | 'energy' | 'legacy' | 'crit' | 'warn' | 'good'; className?: string }) {
  const fill = { repair: 'bg-repair', energy: 'bg-energy', legacy: 'bg-legacy', crit: 'bg-crit', warn: 'bg-warn', good: 'bg-good' }[tone];
  const track = { repair: 'bg-repair-soft', energy: 'bg-energy-soft', legacy: 'bg-legacy-soft', crit: 'bg-crit-soft', warn: 'bg-warn-soft', good: 'bg-good-soft' }[tone];
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full', track, className)}>
      <div className={clsx('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
