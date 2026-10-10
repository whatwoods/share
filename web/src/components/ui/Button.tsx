import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-ink-1 text-white hover:bg-[#2b2b2b] disabled:bg-ink-4',
  secondary: 'bg-surface text-ink-1 shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-hover disabled:text-ink-4',
  ghost: 'text-ink-2 hover:bg-hover hover:text-ink-1 disabled:text-ink-4',
};
const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-1.5',
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
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150 select-none [&_svg]:size-3.5',
        variants[variant],
        sizes[size],
        !children && (size === 'sm' ? 'w-7 px-0' : 'w-8 px-0'),
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
