import clsx from 'clsx';
import { LogOut, Presentation, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { useAuthMe, useMeta, useSyncNow, useSyncStatus } from '@/lib/queries';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { CommandPalette } from './CommandPalette';

export const NAV = [
  { to: '/', label: '今日' },
  { to: '/buildings', label: '楼宇' },
  { to: '/energy', label: '能耗' },
  { to: '/repair', label: '维修' },
  { to: '/legacy', label: '遗留攻坚' },
];

export function AppShell() {
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (e.key === '/' && !/input|textarea|select/i.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-dvh">
      <TopBar onSearch={() => setPalette(true)} />
      <main className="mx-auto w-full max-w-[1320px] px-8 pt-8 pb-20 max-md:px-4 max-md:pt-5">
        <Outlet />
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const status = useSyncStatus();
  const sync = useSyncNow();
  const toast = useToast();
  const me = useAuthMe();
  const meta = useMeta();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const running = sync.isPending || status.data?.running;
  const last = status.data?.last;
  const mock = meta.data && (meta.data.dataMode.feishu === 'mock' || meta.data.dataMode.energy === 'mock');

  const onSync = () =>
    sync.mutate(undefined, {
      onSuccess: (r) => {
        if (!r.ok) return toast({ kind: 'error', title: '同步失败', body: r.message });
        const sum = (k: 'inserted' | 'updated' | 'deleted') => r.tables.reduce((a, t) => a + t[k], 0);
        toast({ kind: 'success', title: '同步完成', body: `新增 ${sum('inserted')} · 更新 ${sum('updated')} · 删除 ${sum('deleted')}` });
      },
      onError: (e) => toast({ kind: 'error', title: '同步失败', body: e.message }),
    });

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-8 max-md:gap-3 max-md:px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight max-sm:hidden">湾谷运营</span>
        </Link>
        <nav className="scroll-thin flex min-w-0 items-center gap-1 overflow-x-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'rounded-md px-2.5 py-1.5 text-[14px] whitespace-nowrap transition-colors',
                  isActive ? 'bg-hover font-medium text-ink-1' : 'text-ink-3 hover:text-ink-1',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        <button
          onClick={onSearch}
          className="flex h-8 w-[220px] items-center gap-2 rounded-md px-2.5 text-[13px] text-ink-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-colors hover:bg-subtle max-lg:w-8 max-lg:justify-center max-lg:px-0"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-left max-lg:hidden">搜索工单、遗留、楼栋</span>
          <span className="kbd max-lg:hidden">⌘K</span>
        </button>
        <div className="flex items-center gap-1">
          {mock && (
            <span className="mr-1 rounded-[5px] bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn-ink max-md:hidden" title="未接入真实数据源，当前为演示数据">
              演示数据
            </span>
          )}
          <span className="mr-1 text-[12px] text-ink-3 max-xl:hidden" title={last?.message}>
            {running ? '同步中…' : `同步于 ${fmtRelative(last?.finishedAt ?? last?.startedAt)}`}
          </span>
          <Button variant="ghost" loading={!!running} icon={<RefreshCw />} onClick={onSync} title="立即同步飞书数据" aria-label="立即同步" />
          <Button variant="ghost" icon={<Presentation />} onClick={() => navigate('/report')} title="汇报模式（适合投屏）" aria-label="汇报模式" />
          {me.data?.authEnabled && <Button variant="ghost" icon={<LogOut />} onClick={logout} title="退出登录" aria-label="退出登录" />}
        </div>
      </div>
    </header>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <rect width="24" height="24" rx="6" fill="#171717" />
      <path d="M5.5 17V9.5l3.5 3 3-4.5 3 4.5 3.5-3V17z" fill="#fff" />
    </svg>
  );
}
