import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/** 把筛选条件放在 URL 上：可分享、可回退、刷新不丢 */
export function useUrlState<K extends string>(keys: readonly K[]) {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => {
    const o = {} as Record<K, string>;
    for (const k of keys) o[k] = sp.get(k) ?? '';
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, keys.join(',')]);

  const set = useCallback(
    (patch: Partial<Record<K, string | null>>, opts?: { replace?: boolean }) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch) as [string, string | null | undefined][]) {
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: opts?.replace ?? true },
      );
    },
    [setSp],
  );

  const reset = useCallback(() => {
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of keys) next.delete(k);
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSp, keys.join(',')]);

  return [state, set, reset] as const;
}
