/**
 * 鉴权：单一共享密码 + HMAC-SHA256 签名 Cookie（@fastify/cookie signed cookie）。
 *  - POST /api/auth/login  { password } → 200 { ok } + Set-Cookie（HttpOnly, SameSite=Lax, Path=/, 7 天）
 *  - POST /api/auth/logout → { ok }
 *  - GET  /api/auth/me     → { authenticated, authEnabled }
 *  - 未配置 AUTH_PASSWORD：authEnabled=false，全部放行
 *  - 登录节流：同 IP 每分钟最多 10 次
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthMe } from '../../shared/contract';
import { config } from './config';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function passwordMatches(input: string, expected: string): boolean {
  // 先哈希成等长再比较，避免长度泄露
  return timingSafeEqual(sha256(input), sha256(expected));
}

/** 密码指纹：修改密码后旧 cookie 自动失效 */
const pwFingerprint = () => sha256(`fp:${config.auth.password}`).toString('hex').slice(0, 12);

function sessionValue(issuedAt = Date.now()): string {
  return `v1.${issuedAt}.${pwFingerprint()}`;
}

export function isAuthenticated(req: FastifyRequest): boolean {
  if (!config.auth.enabled) return true;
  const raw = req.cookies[config.auth.cookieName];
  if (!raw) return false;
  const res = req.unsignCookie(raw);
  if (!res.valid || !res.value) return false;
  const [v, issued, fp] = res.value.split('.');
  if (v !== 'v1' || fp !== pwFingerprint()) return false;
  const age = Date.now() - Number(issued);
  return Number.isFinite(age) && age >= 0 && age < config.auth.maxAgeSec * 1000;
}

/* ───────────── 登录节流 ───────────── */

const WINDOW_MS = 60_000;
const MAX_FAILURES = 10;
/** 只统计失败次数：同一 IP 每分钟最多 10 次密码错误，登录成功即清零 */
const failures = new Map<string, { count: number; resetAt: number }>();

export function isLockedOut(ip: string, now = Date.now()): boolean {
  const f = failures.get(ip);
  return !!f && f.resetAt > now && f.count >= MAX_FAILURES;
}

export function recordFailure(ip: string, now = Date.now()): void {
  if (failures.size > 5000) for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
  const f = failures.get(ip);
  if (!f || f.resetAt <= now) failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else f.count++;
}

/** 无需登录的接口 */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/logout', '/api/auth/me']);

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split('?')[0]!;
    if (!path.toLowerCase().startsWith('/api') || PUBLIC_PATHS.has(path)) return;
    if (!isAuthenticated(req)) {
      return reply.code(401).send({ error: '未登录或登录已过期' });
    }
  });

  app.post<{ Body: { password?: unknown } }>('/api/auth/login', async (req, reply) => {
    if (!config.auth.enabled) return { ok: true };
    if (isLockedOut(req.ip)) {
      return reply.code(429).send({ error: '尝试次数过多，请 1 分钟后再试' });
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !passwordMatches(password, config.auth.password)) {
      recordFailure(req.ip);
      req.log.warn({ ip: req.ip }, '登录失败');
      return reply.code(401).send({ error: '密码错误' });
    }
    failures.delete(req.ip);
    reply.setCookie(config.auth.cookieName, sessionValue(), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: config.auth.cookieSecure,
      maxAge: config.auth.maxAgeSec,
    });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(config.auth.cookieName, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req): Promise<AuthMe> => ({
    authenticated: isAuthenticated(req),
    authEnabled: config.auth.enabled,
  }));
}
