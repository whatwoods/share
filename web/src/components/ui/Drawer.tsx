import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-[fade-in_160ms_ease-out] bg-ink-1/25 backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{ width: `min(${width}px, 100vw)` }}
        className={clsx('relative flex h-full animate-[drawer-in_220ms_var(--ease-out-soft)] flex-col bg-surface shadow-drawer outline-none')}
      >
        <header className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 font-semibold text-ink-1">{title}</h2>
            {subtitle && <div className="mt-1 text-caption text-ink-3">{subtitle}</div>}
          </div>
          {actions}
          <button onClick={onClose} aria-label="关闭" className="-mr-2 rounded-md p-1.5 text-ink-3 hover:bg-hover hover:text-ink-1">
            <X className="size-4" />
          </button>
        </header>
        <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** 抽屉内的「键 - 值」行 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 py-2 text-body">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-ink-1">{children}</dd>
    </div>
  );
}
