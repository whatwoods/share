import clsx from 'clsx';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={clsx('w-full border-separate border-spacing-0 text-body', className)} {...rest} />;
}
export function Th({ className, align, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={clsx(
        'sticky top-0 z-[1] h-9 border-b border-line bg-subtle px-3 text-caption font-medium whitespace-nowrap text-ink-3 first:pl-5 last:pr-5',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...rest}
    />
  );
}
export function Td({ className, align, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={clsx(
        'h-10 border-b border-line/70 px-3 align-middle first:pl-5 last:pr-5',
        align === 'right' ? 'num text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...rest}
    />
  );
}
export function Tr({ className, onClick, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick(e as never) : undefined}
      className={clsx('transition-colors', onClick && 'cursor-pointer hover:bg-hover focus-visible:bg-hover', className)}
      {...rest}
    />
  );
}
