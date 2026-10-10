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

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className={clsx('flex items-center gap-2 rounded-md bg-crit-soft px-3 py-2 text-[13px] text-crit-ink', className)}>
      <AlertCircle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">加载失败：{msg}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded px-1.5 font-medium underline underline-offset-2 hover:bg-crit-ink/10">
          重试
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

/** Loadable 需要的查询状态（直接传 useQuery 的返回值即可） */
export interface QueryState {
  data: unknown;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  refetch: () => unknown;
}

/** 请求失败且没有任何可用数据（后台刷新失败时保留旧数据，不算） */
export const failedWithoutData = (q: QueryState) => q.isError && q.data === undefined;

/**
 * 首次加载显示骨架；失败且没有可用数据时显示错误与重试；有旧数据时刷新只降低透明度，不跳动。
 * 注意：TanStack Query v5 的 isLoading 在请求最终失败后为 false，必须单独判断 isError。
 */
export function Loadable({
  query,
  fetching,
  skeleton,
  children,
  className,
}: {
  query: QueryState;
  fetching?: boolean;
  skeleton?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (failedWithoutData(query)) return <ErrorState error={query.error} onRetry={() => void query.refetch()} className="m-5" />;
  if (query.isLoading) return <>{skeleton ?? <Skeleton className="m-5 h-40" />}</>;
  return <div className={clsx(fetching && 'refetching', className)}>{children}</div>;
}
