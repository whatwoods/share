import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Logo } from '@/components/layout/AppShell';
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-subtle px-6">
      <form onSubmit={submit} className="w-full max-w-[340px]">
        <Logo size={36} />
        <h1 className="mt-6 text-[24px] leading-8 font-semibold tight">湾谷园区运营工作台</h1>
        <p className="mt-1 text-[14px] text-ink-3">能耗 · 维修 · 施工遗留 · 楼宇全景</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          aria-label="访问口令"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="field mt-8 h-10 w-full bg-white text-[14px]"
          placeholder="访问口令"
        />
        {err && <p className="mt-2 text-[13px] text-crit-ink">{err}</p>}
        <Button type="submit" variant="primary" loading={busy} className="mt-3 h-10 w-full text-[14px]">
          进入
        </Button>
      </form>
      <p className="absolute bottom-6 text-[12px] text-ink-4">数据每日 06:15 自动同步 · 飞书多维表格为唯一数据源</p>
    </div>
  );
}
