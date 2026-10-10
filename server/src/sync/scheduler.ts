/**
 * 同步调度：croner 按 SYNC_CRON（Asia/Shanghai）+ 可选固定间隔；启动时库为空则立即同步。
 */
import { Cron } from 'croner';
import { config } from '../config';
import type { Db } from '../db';
import { toShISO } from '../lib/time';
import { SyncBusyError, runSync, type SyncTrigger } from './runner';
import { countRows } from './store';

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

let cronJob: Cron | null = null;
let intervalTimer: NodeJS.Timeout | null = null;
let intervalNextAt: number | null = null;

async function safeRun(db: Db, trigger: SyncTrigger, log: Logger) {
  try {
    const run = await runSync(db, trigger, undefined, (m) => log.info(`[sync] ${m}`));
    if (!run.ok) log.warn(`[sync] ${run.message}`);
  } catch (err) {
    if (err instanceof SyncBusyError) log.info('[sync] 跳过：已有同步在执行');
    else log.error(`[sync] 异常：${(err as Error).stack ?? err}`);
  }
}

export function startScheduler(db: Db, log: Logger): void {
  stopScheduler();
  try {
    cronJob = new Cron(config.sync.cron, { timezone: 'Asia/Shanghai', protect: true, name: 'feishu-sync' }, () =>
      safeRun(db, 'schedule', log),
    );
    log.info(`[sync] 定时同步：${config.sync.cron}（Asia/Shanghai），下次 ${nextScheduledAt() ?? '-'}`);
  } catch (err) {
    log.error(`[sync] SYNC_CRON 无效（${config.sync.cron}）：${(err as Error).message}`);
  }
  const minutes = config.sync.intervalMinutes;
  if (minutes > 0) {
    const ms = minutes * 60_000;
    intervalNextAt = Date.now() + ms;
    intervalTimer = setInterval(() => {
      intervalNextAt = Date.now() + ms;
      void safeRun(db, 'schedule', log);
    }, ms);
    intervalTimer.unref();
    log.info(`[sync] 额外间隔同步：每 ${minutes} 分钟`);
  }
  if (countRows(db, 'daily') === 0 || countRows(db, 'legacy') === 0) {
    log.info('[sync] 本地库为空，启动后立即同步一次');
    void safeRun(db, 'startup', log);
  }
}

export function stopScheduler(): void {
  cronJob?.stop();
  cronJob = null;
  if (intervalTimer) clearInterval(intervalTimer);
  intervalTimer = null;
  intervalNextAt = null;
}

export function nextScheduledAt(): string | null {
  const candidates: number[] = [];
  const n = cronJob?.nextRun();
  if (n) candidates.push(n.getTime());
  if (intervalNextAt) candidates.push(intervalNextAt);
  return candidates.length ? toShISO(Math.min(...candidates)) : null;
}
