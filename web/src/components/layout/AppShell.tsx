import clsx from 'clsx';
import { Building2, ChevronsLeft, ChevronsRight, Construction, Database, LayoutDashboard, LogOut, RefreshCw, Wrench, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { useAuthMe, useMeta, useSyncNow, useSyncStatus } from '@/lib/queries';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

const NAV: { to: string; label: string; icon: ReactNode; color: string; desc: string }[] = [
  { to: '/', label: '运营总览', icon: <LayoutDashboard />, color: '#93a4bf', desc: '跨域驾驶舱' },
  { to: '/buildings', label: '楼宇全景', icon: <Building2 />, color: '#22b3cf', desc: '1~19号楼 · 公区' },
  { to: '/energy', label: '能耗监控', icon: <Zap />, color: '#5b9cf0', desc: 'CET 电表 · 光伏' },
  { to: '/repair', label: '设施维修', icon: <Wrench />, color: '#2fc28f', desc: '日常报修流水' },
  { to: '/legacy', label: '施工遗留攻坚', icon: <Construction />, color: '#8c7ff0', desc: '索赔与质保专项' },
];

export const PAGE_TITLES: Record<string, string> = {
  '/': '运营总览',
  '/buildings': '楼宇全景',
  '/energy': '能耗监控',
  '/repair': '设施维修运维',
  '/legacy': '施工遗留攻坚',
};

function readCollapsed() {
  try {
    return localStorage.getItem('nav-collapsed') === '1';
  } catch {
    return false;
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  useEffect(() => {
    try {
      localStorage.setItem('nav-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="scroll-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-6 pt-5 pb-10 max-md:px-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const meta = useMeta();
  const mode = meta.data?.dataMode;
  return (
    <aside
      className={clsx(
        'relative flex shrink-0 flex-col bg-nav text-white/80 transition-[width] duration-200 max-md:hidden',
        collapsed ? 'w-16' : 'w-[232px]',
      )}
    >
      <div className={clsx('flex h-14 items-center gap-2.5 border-b border-white/[.06]', collapsed ? 'justify-center' : 'px-5')}>
        <Logo />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[14px] font-semibold tracking-wide text-white">湾谷运营工作台</div>
            <div className="truncate text-[11px] text-white/45">Wangu Park Ops Console</div>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 px-2.5 py-4">
        {!collapsed && <div className="px-2.5 pb-2 text-[11px] font-medium tracking-wider text-white/35">工作台</div>}
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            title={collapsed ? n.label : undefined}
            className={({ isActive }) =>
              clsx(
                'group relative flex h-10 items-center gap-3 rounded-[9px] text-[13px] transition-colors',
                collapsed ? 'justify-center' : 'px-3',
                isActive ? 'bg-white/[.08] font-medium text-white' : 'text-white/65 hover:bg-white/[.04] hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full" style={{ background: n.color }} />}
                <span className="[&_svg]:size-[18px]" style={{ color: isActive ? n.color : undefined }}>
                  {n.icon}
                </span>
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{n.label}</span>
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {!collapsed && mode && (
        <div className="mx-3 mb-3 rounded-[10px] border border-white/[.06] bg-white/[.03] p-3 text-[11px]">
          <div className="mb-2 flex items-center gap-1.5 font-medium text-white/50">
            <Database className="size-3" />
            数据源
          </div>
          <SourceRow label="飞书多维表格" mode={mode.feishu} />
          <SourceRow label="CET 能耗服务" mode={mode.energy} />
        </div>
      )}
      <button
        onClick={onToggle}
        aria-label={collapsed ? '展开导航' : '收起导航'}
        className="flex h-10 items-center justify-center gap-2 border-t border-white/[.06] text-[12px] text-white/40 hover:text-white/80"
      >
        {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        {!collapsed && '收起'}
      </button>
    </aside>
  );
}

function SourceRow({ label, mode }: { label: string; mode: 'live' | 'mock' }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-white/60">{label}</span>
      <span className={clsx('inline-flex items-center gap-1', mode === 'live' ? 'text-[#5fd39a]' : 'text-[#f5c45e]')}>
        <span className={clsx('size-1.5 rounded-full', mode === 'live' ? 'bg-[#5fd39a]' : 'bg-[#f5c45e]')} />
        {mode === 'live' ? '实时' : '演示数据'}
      </span>
    </div>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#1b2740" />
      <path d="M7 22V12l5 4 4-6 4 6 5-4v10z" fill="#3987e5" />
      <path d="M7 22h18v2H7z" fill="#2fc28f" />
    </svg>
  );
}

function Topbar() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? '湾谷运营工作台';
  const status = useSyncStatus();
  const sync = useSyncNow();
  const toast = useToast();
  const me = useAuthMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const running = sync.isPending || status.data?.running;
  const last = status.data?.last;

  const onSync = () =>
    sync.mutate(undefined, {
      onSuccess: (r) => {
        if (!r.ok) return toast({ kind: 'error', title: '同步失败', body: r.message });
        const sum = (k: 'inserted' | 'updated' | 'deleted') => r.tables.reduce((a, t) => a + t[k], 0);
        toast({
          kind: 'success',
          title: '同步完成',
          body: `新增 ${sum('inserted')} · 更新 ${sum('updated')} · 删除 ${sum('deleted')}，用时 ${(r.durationMs / 1000).toFixed(1)}s`,
        });
      },
      onError: (e) => toast({ kind: 'error', title: '同步失败', body: e.message }),
    });

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface/90 px-6 backdrop-blur max-md:px-4">
      <MobileNav />
      <h1 className="min-w-0 flex-1 truncate text-[16px] max-md:invisible font-semibold text-ink-1">{title}</h1>
      <div className="hidden items-center gap-1.5 text-caption text-ink-3 sm:flex" title={last?.message}>
        <span className={clsx('size-1.5 rounded-full', last ? (last.ok ? 'bg-good' : 'bg-crit') : 'bg-ink-4')} />
        {running ? '正在同步…' : `上次同步 ${fmtRelative(last?.finishedAt ?? last?.startedAt)}`}
      </div>
      <Button variant="primary" size="md" loading={!!running} icon={<RefreshCw className="size-3.5" />} onClick={onSync} disabled={!!running}>
        立即同步
      </Button>
      {me.data?.authEnabled && (
        <Button variant="ghost" size="md" icon={<LogOut className="size-3.5" />} onClick={logout} aria-label="退出登录">
          <span className="max-lg:hidden">退出</span>
        </Button>
      )}
    </header>
  );
}

/** 小屏：顶部下拉导航 */
function MobileNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <select
      className="field md:hidden"
      value={NAV.some((n) => n.to === pathname) ? pathname : '/'}
      onChange={(e) => navigate(e.target.value)}
      aria-label="切换页面"
    >
      {NAV.map((n) => (
        <option key={n.to} value={n.to}>
          {n.label}
        </option>
      ))}
    </select>
  );
}
