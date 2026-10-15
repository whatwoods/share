/**
 * 飞书开放平台最小客户端：tenant_access_token + 多维表格记录分页拉取。
 */
import { config } from '../config';

export interface FeishuRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

const RATE_LIMIT_CODES = new Set([99991400, 1254290, 1254291]);
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 20_000;

export class FeishuError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'FeishuError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FeishuClient {
  private tokenCache: TokenCache | null = null;

  constructor(
    private readonly opts = {
      baseUrl: config.feishu.baseUrl,
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret,
    },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** 带限流重试的 JSON 请求（429 / code 99991400 指数退避，最多重试 3 次） */
  private async request<T>(url: string, init: RequestInit): Promise<T & { code: number; msg?: string }> {
    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          await sleep(500 * 2 ** attempt++);
          continue;
        }
        throw new FeishuError(`请求飞书失败：${(err as Error).message}`);
      }
      let body: (T & { code: number; msg?: string }) | null = null;
      try {
        body = (await res.json()) as T & { code: number; msg?: string };
      } catch {
        body = null;
      }
      const rateLimited = res.status === 429 || (body !== null && RATE_LIMIT_CODES.has(body.code));
      if (rateLimited && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('x-ogw-ratelimit-reset') ?? res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        attempt++;
        await sleep(Math.min(wait, 15_000));
        continue;
      }
      if (body === null) throw new FeishuError(`飞书返回非 JSON 响应（HTTP ${res.status}）`, undefined, res.status);
      if (body.code !== 0) {
        throw new FeishuError(`飞书接口错误 code=${body.code} msg=${body.msg ?? ''}`, body.code, res.status);
      }
      return body;
    }
  }

  async getTenantToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt - 5 * 60_000 > now) return this.tokenCache.token;
    const body = await this.request<{ tenant_access_token: string; expire: number }>(
      `${this.opts.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: this.opts.appId, app_secret: this.opts.appSecret }),
      },
    );
    if (!body.tenant_access_token) throw new FeishuError('飞书未返回 tenant_access_token');
    this.tokenCache = { token: body.tenant_access_token, expiresAt: now + (body.expire || 7200) * 1000 };
    return body.tenant_access_token;
  }

  /** 全量拉取一张表的所有记录 */
  async listAllRecords(baseToken: string, tableId: string): Promise<FeishuRecord[]> {
    const out: FeishuRecord[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 1000; page++) {
      const token = await this.getTenantToken();
      const qs = new URLSearchParams({ page_size: '500' });
      if (pageToken) qs.set('page_token', pageToken);
      const url = `${this.opts.baseUrl}/open-apis/bitable/v1/apps/${encodeURIComponent(baseToken)}/tables/${encodeURIComponent(tableId)}/records?${qs}`;
      let body: {
        data?: { items?: FeishuRecord[] | null; has_more?: boolean; page_token?: string; total?: number };
      };
      try {
        body = await this.request(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      } catch (err: unknown) {
        if (err instanceof FeishuError && err.code === 1254302) {
          return this.listAllRecordsViaLarkCli(baseToken, tableId);
        }
        throw err;
      }
      const items = body.data?.items ?? [];
      for (const it of items) {
        if (it && typeof it.record_id === 'string') out.push({ record_id: it.record_id, fields: it.fields ?? {} });
      }
      if (!body.data?.has_more || !body.data.page_token) break;
      pageToken = body.data.page_token;
    }
    return out;
  }

  /** 当多维表格开启高级权限导致应用身份 1254302 时，无缝回退到本机 lark-cli 用户授权拉取 */
  private async listAllRecordsViaLarkCli(baseToken: string, tableId: string): Promise<FeishuRecord[]> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const out: FeishuRecord[] = [];
    let offset = 0;
    const limit = 200;
    while (true) {
      const { stdout } = await execFileAsync('lark-cli', [
        'base', '+record-list',
        '--base-token', baseToken,
        '--table-id', tableId,
        '--offset', String(offset),
        '--limit', String(limit),
        '--as', 'user',
        '--json',
      ], {
        maxBuffer: 15 * 1024 * 1024,
        env: {
          ...process.env,
          HOME: '/root',
          HERMES_HOME: '/root/.hermes',
          PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        },
      });
      const res = JSON.parse(stdout);
      if (!res.ok || !res.data) break;
      const dataRows = (res.data.data as unknown[][]) || [];
      const fields = (res.data.fields as string[]) || [];
      const recordIds = (res.data.record_id_list as string[]) || [];
      for (let i = 0; i < dataRows.length; i++) {
        const rowObj: Record<string, unknown> = {};
        for (let j = 0; j < fields.length; j++) {
          rowObj[fields[j]] = dataRows[i][j];
        }
        out.push({
          record_id: recordIds[i],
          fields: rowObj,
        });
      }
      if (dataRows.length < limit || !res.data.has_more) break;
      offset += dataRows.length;
    }
    return out;
  }
}
