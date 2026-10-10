/**
 * Fastify 应用装配：插件、鉴权、路由、静态托管与 SPA fallback、统一错误处理。
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { registerAuth } from './auth';
import { config } from './config';
import type { Db } from './db';
import { setEnergyLogger } from './energy/service';
import type { HttpError } from './lib/http';
import { buildingRoutes } from './routes/buildings';
import type { AppContext } from './routes/context';
import { energyRoutes } from './routes/energy';
import { legacyRoutes } from './routes/legacy';
import { metaRoutes } from './routes/meta';
import { ticketRoutes } from './routes/tickets';

function readVersion(): string {
  for (const p of [new URL('../../package.json', import.meta.url), resolve(process.cwd(), 'package.json')]) {
    try {
      return (JSON.parse(readFileSync(p, 'utf8')) as { version?: string }).version ?? '0.0.0';
    } catch {
      /* next */
    }
  }
  return '0.0.0';
}

/** 前端构建产物目录：优先 <cwd>/dist/web，其次相对入口文件的 ../web（即 dist/web） */
export function resolveWebRoot(): string | null {
  const candidates = [resolve(process.cwd(), 'dist/web'), fileURLToPath(new URL('../web', import.meta.url))];
  return candidates.find((d) => existsSync(join(d, 'index.html'))) ?? null;
}

export async function buildApp(db: Db, opts: { logger?: boolean; now?: () => number } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    trustProxy: true,
  });
  setEnergyLogger({ warn: (m) => app.log.warn(m) });

  const ctx: AppContext = { db, now: opts.now ?? (() => Date.now()), version: readVersion() };

  app.setErrorHandler((err: FastifyError | HttpError | Error, req, reply) => {
    const code = (err as { statusCode?: number }).statusCode;
    const status = typeof code === 'number' && code >= 400 && code < 600 ? code : 500;
    if (status >= 500) req.log.error({ err }, '请求处理失败');
    reply.code(status).send({ error: err.message || '服务器内部错误' });
  });

  await app.register(fastifyCookie, { secret: config.auth.secret, hook: 'onRequest' });
  await registerAuth(app);
  await metaRoutes(app, ctx);
  await ticketRoutes(app, ctx);
  await legacyRoutes(app, ctx);
  await energyRoutes(app);
  await buildingRoutes(app, ctx);

  const webRoot = resolveWebRoot();
  if (webRoot) {
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      cacheControl: false,
      index: ['index.html'],
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${sep}assets${sep}`)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
        else if (filePath.endsWith('.html')) res.header('Cache-Control', 'no-cache');
        else res.header('Cache-Control', 'public, max-age=3600');
      },
    });
    app.log.info(`静态托管前端：${webRoot}`);
  } else {
    app.log.warn('未找到 dist/web/index.html，仅提供 /api 接口');
  }

  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0]!;
    if (path.startsWith('/api/') || path === '/api') {
      return reply.code(404).send({ error: `接口不存在：${req.method} ${path}` });
    }
    // SPA fallback：非 /api 的 GET 且不像静态资源（无扩展名或 .html）→ index.html
    const ext = extname(path);
    if (webRoot && (req.method === 'GET' || req.method === 'HEAD') && (!ext || ext === '.html')) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: '资源不存在' });
  });

  return app;
}

