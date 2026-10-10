import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-ink shadow-[0_1px_2px_rgba(37,99,235,.3)] disabled:bg-brand/50',
  secondary: 'bg-surface text-ink-1 border border-line-strong hover:bg-hover hover:border-ink-4 disabled:text-ink-4',
  ghost: 'text-ink-2 hover:bg-hover hover:text-ink-1 disabled:text-ink-4',
  danger: 'bg-crit text-white hover:bg-crit-ink',
};
const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-caption gap-1.5 rounded-sm',
  md: 'h-8 px-3 text-body gap-2 rounded-[8px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}
