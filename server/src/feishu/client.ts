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
      const body = await this.request<{
        data?: { items?: FeishuRecord[] | null; has_more?: boolean; page_token?: string; total?: number };
      }>(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      const items = body.data?.items ?? [];
      for (const it of items) {
        if (it && typeof it.record_id === 'string') out.push({ record_id: it.record_id, fields: it.fields ?? {} });
      }
      if (!body.data?.has_more || !body.data.page_token) break;
      pageToken = body.data.page_token;
    }
    return out;
  }
}
