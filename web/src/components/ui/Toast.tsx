import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info';
interface Item {
  id: number;
  kind: Kind;
  title: string;
  body?: string;
}

const Ctx = createContext<(t: Omit<Item, 'id'>) => void>(() => {});
export const useToast = () => useContext(Ctx);

let seq = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const push = useCallback((t: Omit<Item, 'id'>) => {
    const id = ++seq;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[340px] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-[toast-in_200ms_var(--ease-out-soft)] gap-3 rounded-[12px] border border-line bg-surface p-3.5 shadow-pop">
            <span className={clsx('mt-0.5 [&_svg]:size-4', t.kind === 'success' ? 'text-good' : t.kind === 'error' ? 'text-crit' : 'text-brand')}>
              {t.kind === 'success' ? <CheckCircle2 /> : t.kind === 'error' ? <AlertCircle /> : <Info />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink-1">{t.title}</p>
              {t.body && <p className="mt-0.5 text-caption break-words text-ink-2">{t.body}</p>}
            </div>
            <button aria-label="关闭" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="self-start text-ink-3 hover:text-ink-1">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
