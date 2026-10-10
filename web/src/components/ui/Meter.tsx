import clsx from 'clsx';

/** 细条：默认墨色，偏低时用警示色 */
export function Meter({ value, tone = 'ink', className }: { value: number; tone?: 'ink' | 'accent' | 'warn' | 'crit' | 'good'; className?: string }) {
  const fill = { ink: 'bg-ink-1', accent: 'bg-accent', warn: 'bg-warn', crit: 'bg-crit', good: 'bg-good' }[tone];
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={clsx('h-1 w-full overflow-hidden rounded-full bg-grid', className)}>
      <div className={clsx('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
