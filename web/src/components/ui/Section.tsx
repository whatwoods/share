import clsx from 'clsx';
import type { ReactNode } from 'react';

/** 区块：标题 + 细线，内容直接铺在白底上 */
export function Section({
  title,
  count,
  desc,
  actions,
  children,
  className,
  id,
  flush,
}: {
  title: ReactNode;
  count?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /** 内容不留上边距（用于表格紧贴标题线） */
  flush?: boolean;
}) {
  return (
    <section id={id} className={clsx('min-w-0 scroll-mt-20', className)}>
      <header className="flex min-h-9 items-end gap-3 border-b border-line pb-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-baseline gap-2 text-h2 font-semibold text-ink-1">
            {title}
            {count != null && <span className="num text-[13px] font-normal text-ink-3">{count}</span>}
          </h2>
          {desc && <p className="mt-0.5 truncate text-[13px] text-ink-3">{desc}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className={clsx(!flush && 'pt-4')}>{children}</div>
    </section>
  );
}
