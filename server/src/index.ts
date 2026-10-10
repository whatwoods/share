/**
 * 湾谷园区综合运营工作台 · 后端入口
 *   node dist/server/index.js              启动 HTTP 服务
 *   node dist/server/index.js --sync-once  执行一次同步后退出（退出码反映成败）
 */
import { join } from 'node:path';
import { buildApp } from './app';
import { config, feishuMode } from './config';
import { closeDb, getDb } from './db';
import { cleanupStaleRuns, runSync } from './sync/runner';
import { startScheduler, stopScheduler } from './sync/scheduler';

async function syncOnce(): Promise<number> {
  const db = getDb(config.dataDir);
  cleanupStaleRuns(db);
  console.log(`[sync] 数据源：${feishuMode() === 'mock' ? '模拟数据' : '飞书'}，数据库：${join(config.dataDir, 'wangu.db')}`);
  try {
    const run = await runSync(db, 'manual');
    console.log(`[sync] ${run.message}（${run.durationMs} ms）`);
    return run.ok ? 0 : 1;
  } catch (err) {
    console.error('[sync] 失败：', err);
    return 1;
  } finally {
    closeDb();
  }
}

async function main() {
  if (process.argv.includes('--sync-once')) {
    process.exitCode = await syncOnce();
    return;
  }
  const db = getDb(config.dataDir);
  cleanupStaleRuns(db);
  const app = await buildApp(db);
  app.log.info(
    `数据模式：DATA_MODE=${config.dataMode}，飞书=${feishuMode()}，鉴权=${config.auth.enabled ? '开启' : '关闭（未配置 AUTH_PASSWORD）'}`,
  );
  await app.listen({ port: config.port, host: config.host });
  startScheduler(db, {
    info: (m) => app.log.info(m),
    warn: (m) => app.log.warn(m),
    error: (m) => app.log.error(m),
  });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`收到 ${signal}，正在关闭…`);
    stopScheduler();
    try {
      await app.close();
    } finally {
      closeDb();
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
