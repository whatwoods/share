import clsx from 'clsx';
import { AlertCircle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function Empty({ title = '暂无数据', hint, icon, action, className }: { title?: string; hint?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}>
      <div className="text-ink-4 [&_svg]:size-5">{icon ?? <Inbox />}</div>
      <p className="text-[14px] text-ink-2">{title}</p>
      {hint && <p className="max-w-xs text-[13px] text-ink-3">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, className }: { error: unknown; className?: string }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className={clsx('flex items-center gap-2 rounded-md bg-crit-soft px-3 py-2 text-[13px] text-crit-ink', className)}>
      <AlertCircle className="size-4 shrink-0" />
      <span className="min-w-0 break-words">加载失败：{msg}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

/** 首次加载显示骨架；有旧数据时刷新只降低透明度，不跳动 */
export function Loadable({
  loading,
  fetching,
  error,
  skeleton,
  children,
  className,
}: {
  loading: boolean;
  fetching?: boolean;
  error?: unknown;
  skeleton?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (error && loading) return <ErrorState error={error} className="m-5" />;
  if (loading) return <>{skeleton ?? <Skeleton className="m-5 h-40" />}</>;
  return <div className={clsx(fetching && 'refetching', className)}>{children}</div>;
}
