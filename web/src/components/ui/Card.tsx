import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card min-w-0', className)} {...rest} />;
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex min-h-12 items-center gap-3 px-5 pt-4 pb-2', className)}>
      {icon && <span className="text-ink-3">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-h2 font-semibold text-ink-1">{title}</h2>
        {subtitle && <p className="truncate text-caption text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('px-5 pb-5', className)} {...rest} />;
}
