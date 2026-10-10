import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Drawer({
  open,
  onClose,
  title,
  meta,
  children,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  meta?: ReactNode;
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
      <div className="absolute inset-0 animate-[fade-in_140ms_ease-out] bg-black/[.12]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{ width: `min(${width}px, 100vw)` }}
        className="relative m-2 flex animate-[drawer-in_200ms_var(--ease-out-soft)] flex-col overflow-hidden rounded-xl bg-surface shadow-drawer outline-none"
      >
        <div className="flex items-center gap-2 px-6 pt-4">
          <div className="min-w-0 flex-1 text-[12px] text-ink-3">{meta}</div>
          <button onClick={onClose} aria-label="关闭" className="-mr-2 rounded-md p-1.5 text-ink-3 hover:bg-hover hover:text-ink-1">
            <X className="size-4" />
          </button>
        </div>
        <h2 className="px-6 pt-2 pb-4 text-[20px] leading-7 font-semibold text-ink-1">{title}</h2>
        <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-8">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** 属性列表行 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-1.5 text-[14px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-ink-1">{children}</dd>
    </div>
  );
}
