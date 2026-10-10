/**
 * 运行配置：启动时加载 .env（若存在），并把环境变量解析为强类型配置对象。
 * 其他模块统一 `import { config } from './config'`，不要直接读 process.env。
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv(): void {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (err) {
    console.warn('[config] 加载 .env 失败：', (err as Error).message);
  }
}
loadDotEnv();

const env = process.env;

function str(name: string, def = ''): string {
  const v = env[name];
  return v === undefined ? def : v.trim();
}
function int(name: string, def: number): number {
  const n = Number.parseInt(str(name), 10);
  return Number.isFinite(n) ? n : def;
}
function bool(name: string, def: boolean): boolean {
  const v = str(name).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return def;
}

export type DataModeSetting = 'auto' | 'live' | 'mock';

const isProd = str('NODE_ENV') === 'production';
const authPassword = str('AUTH_PASSWORD');
const nenghaoBase = str('NENGHAO_API_BASE', 'http://127.0.0.1:3100').replace(/\/+$/, '');
const dataModeRaw = str('DATA_MODE', 'auto').toLowerCase();

export const config = {
  isProd,
  port: int('PORT', 3300),
  host: str('HOST', '127.0.0.1') || '127.0.0.1',
  dataDir: resolve(process.cwd(), str('DATA_DIR', './data') || './data'),
  logLevel: str('LOG_LEVEL', 'info') || 'info',

  auth: {
    password: authPassword,
    enabled: authPassword.length > 0,
    /** cookie 签名密钥：AUTH_SECRET 或由密码派生 */
    secret:
      str('AUTH_SECRET') ||
      createHash('sha256').update(`wangu-cookie-secret:${authPassword || 'disabled'}`).digest('hex'),
    cookieSecure: bool('COOKIE_SECURE', isProd),
    cookieName: 'wangu_session',
    maxAgeSec: 7 * 24 * 3600,
  },

  feishu: {
    appId: str('FEISHU_APP_ID'),
    appSecret: str('FEISHU_APP_SECRET'),
    baseToken: str('FEISHU_BASE_TOKEN', 'FHbvbqfybap1U1sWSNOcZQlvnqh'),
    tableDaily: str('FEISHU_TABLE_DAILY', 'tbl4m7w4tlwyI9j2'),
    tableLegacy: str('FEISHU_TABLE_LEGACY', 'tbl27kc7E8IQEEj0'),
    baseUrl: str('FEISHU_BASE_URL', 'https://open.feishu.cn').replace(/\/+$/, ''),
  },

  sync: {
    cron: str('SYNC_CRON', '15 6 * * *') || '15 6 * * *',
    intervalMinutes: Math.max(0, int('SYNC_INTERVAL_MINUTES', 0)),
  },

  energy: {
    base: nenghaoBase,
    solarUrl: str('SOLAR_API_URL') || `${nenghaoBase}/api/solar`,
  },

  dataMode: (['auto', 'live', 'mock'].includes(dataModeRaw) ? dataModeRaw : 'auto') as DataModeSetting,
};

/** 飞书凭证是否为占位/未配置 */
export function feishuCredentialsMissing(): boolean {
  const { appId, appSecret } = config.feishu;
  const placeholder = (s: string) => !s || /x{4,}/i.test(s) || s.includes('<') || s === 'changeme';
  return placeholder(appId) || placeholder(appSecret);
}

/** 飞书数据源实际使用的模式 */
export function feishuMode(): 'live' | 'mock' {
  if (config.dataMode === 'mock') return 'mock';
  if (config.dataMode === 'live') return 'live';
  return feishuCredentialsMissing() ? 'mock' : 'live';
}
