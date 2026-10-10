import { RotateCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

/** 动态加载页面代码失败：多为发版后旧的哈希分块已被删除 */
const CHUNK_ERROR = /dynamically imported module|module script failed|Unable to preload CSS/i;

/**
 * 渲染出错时显示可恢复的提示，而不是整页白屏。
 * resetKey 变化（如切换路由）时自动清除错误，重新渲染子树。
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown; className?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = CHUNK_ERROR.test(error.message);
    return (
      <div role="alert" className={this.props.className ?? 'flex flex-col items-start gap-3 py-10'}>
        <p className="text-[15px] font-medium text-ink-1">{stale ? '工作台已更新，刷新后即可继续使用' : '页面出错了'}</p>
        <p className="max-w-xl text-[13px] break-words text-ink-3">{stale ? '当前页面的代码是旧版本，刷新会加载最新版本。' : error.message}</p>
        <Button variant="primary" icon={<RotateCw />} onClick={() => location.reload()}>
          刷新页面
        </Button>
      </div>
    );
  }
}
