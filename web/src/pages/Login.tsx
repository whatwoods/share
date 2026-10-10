import { useQueryClient } from '@tanstack/react-query';
import { Building2, Construction, Lock, Wrench, Zap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

export function LoginPage() {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pwd) return setErr('请输入访问口令');
    setBusy(true);
    setErr('');
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ password: pwd }) });
      await qc.invalidateQueries({ queryKey: ['auth'] });
      const next = sp.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-nav p-12 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[.07]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }}
        />
        <div className="relative flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#1b2740" />
            <path d="M7 22V12l5 4 4-6 4 6 5-4v10z" fill="#3987e5" />
            <path d="M7 22h18v2H7z" fill="#2fc28f" />
          </svg>
          <span className="text-[15px] font-semibold tracking-wide">湾谷园区运营工作台</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="text-[34px] leading-tight font-semibold">
            一张图看清园区
            <br />
            每一度电、每一张单
          </h1>
          <p className="mt-4 text-[14px] leading-6 text-white/60">以 1~19 号楼及公区物理空间为统一抓手，打通 CET 电表数据、日常报修流水与施工遗留专项台账。</p>
          <div className="mt-10 grid grid-cols-2 gap-3 text-[13px]">
            {[
              { icon: <Zap />, t: '能耗监控', c: '#5b9cf0' },
              { icon: <Wrench />, t: '设施维修', c: '#2fc28f' },
              { icon: <Construction />, t: '遗留攻坚', c: '#8c7ff0' },
              { icon: <Building2 />, t: '楼宇全景', c: '#22b3cf' },
            ].map((x) => (
              <div key={x.t} className="flex items-center gap-2.5 rounded-[10px] border border-white/[.08] bg-white/[.03] px-3.5 py-3">
                <span className="[&_svg]:size-4" style={{ color: x.c }}>
                  {x.icon}
                </span>
                {x.t}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-[360px]">
          <div className="mb-8">
            <div className="mb-4 grid size-11 place-items-center rounded-[12px] bg-brand-soft text-brand">
              <Lock className="size-5" />
            </div>
            <h2 className="text-[22px] font-semibold text-ink-1">登录工作台</h2>
            <p className="mt-1 text-body text-ink-3">请输入运营团队共享访问口令</p>
          </div>
          <label className="mb-1.5 block text-caption font-medium text-ink-2" htmlFor="pwd">
            访问口令
          </label>
          <input
            id="pwd"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            className="field h-10 w-full text-[14px]"
            placeholder="••••••••"
          />
          {err && <p className="mt-2 text-caption text-crit-ink">{err}</p>}
          <Button type="submit" variant="primary" loading={busy} className="mt-5 h-10 w-full text-[14px]">
            进入工作台
          </Button>
          <p className="mt-8 text-center text-caption text-ink-4">数据每日 06:15 自动同步 · 飞书多维表格为唯一数据源</p>
        </form>
      </section>
    </div>
  );
}
