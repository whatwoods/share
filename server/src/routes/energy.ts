/** 能耗接口（只读代理 nenghao，响应头 X-Data-Mode 标注本次数据来源 live/mock） */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { BuildingCode } from '../../../shared/contract';
import { isBuildingCode, normalizeBuilding } from '../buildings';
import { qInt, qStr, type Query } from '../domain/ticketQuery';
import { RAW_PATH_WHITELIST, nenghaoRaw } from '../energy/adapter';
import * as energy from '../energy/service';
import { badRequest, HttpError } from '../lib/http';
import { DAY_MS, isDateStr, parseShDate } from '../lib/time';

/** 解析 start/end（YYYY-MM-DD），默认近 30 天（截至昨天） */
export function parseRange(q: Query): { start: string; end: string } {
  const def = energy.lastNDays(30);
  let start = qStr(q, 'start');
  let end = qStr(q, 'end');
  if (start && !isDateStr(start)) throw badRequest('start 格式应为 YYYY-MM-DD');
  if (end && !isDateStr(end)) throw badRequest('end 格式应为 YYYY-MM-DD');
  start ||= def[0]!;
  end ||= def[def.length - 1]!;
  if (start > end) [start, end] = [end, start];
  if ((parseShDate(end)! - parseShDate(start)!) / DAY_MS > 366) throw badRequest('时间跨度不能超过 366 天');
  return { start, end };
}

function send<T>(reply: FastifyReply, r: energy.Moded<T>): T {
  reply.header('X-Data-Mode', r.mode);
  return r.data;
}

export function parseBuildingParam(code: string): BuildingCode | null {
  const up = code.toUpperCase();
  if (isBuildingCode(up)) return up;
  const n = normalizeBuilding(decodeURIComponent(code));
  return n === 'UNKNOWN' ? null : n;
}

export async function energyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Query }>('/api/energy/overview', async (req, reply) => {
    const { start, end } = parseRange(req.query);
    return send(reply, await energy.getOverview(start, end));
  });

  app.get<{ Querystring: Query }>('/api/energy/buildings', async (req, reply) => {
    const { start, end } = parseRange(req.query);
    return send(reply, await energy.getBuildings(start, end));
  });

  app.get<{ Params: { code: string }; Querystring: Query }>('/api/energy/buildings/:code/trend', async (req, reply) => {
    const code = parseBuildingParam(req.params.code);
    if (!code) throw badRequest('楼栋编码无效');
    return send(reply, await energy.getBuildingTrend(code, qInt(req.query, 'days', 14, 1, 90)));
  });

  app.get<{ Querystring: Query }>('/api/energy/heatmap', async (req, reply) => {
    return send(reply, await energy.getHeatmap(qInt(req.query, 'days', 14, 1, 60)));
  });

  app.get('/api/energy/insight', async (_req, reply) => send(reply, await energy.getInsight()));
  app.get('/api/energy/circuits', async (_req, reply) => send(reply, await energy.getCircuits()));
  app.get('/api/energy/solar', async (_req, reply) => send(reply, await energy.getSolar()));

  /** 部署调试：返回 nenghao 原始响应。例：/api/energy/_raw?path=/api/overview&start=2026-09-10 00&end=2026-10-09 23 */
  app.get<{ Querystring: Query }>('/api/energy/_raw', async (req, reply) => {
    const path = qStr(req.query, 'path');
    if (!(RAW_PATH_WHITELIST as readonly string[]).includes(path)) {
      throw badRequest(`path 不在白名单内，可选：${RAW_PATH_WHITELIST.join(', ')}`);
    }
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) if (k !== 'path' && typeof v === 'string') query[k] = v;
    try {
      const r = await nenghaoRaw(path, query);
      return reply.code(r.status).header('Content-Type', r.contentType).header('X-Upstream-Url', r.url).send(r.body);
    } catch (err) {
      throw new HttpError(502, `nenghao 不可达：${(err as Error).message}`);
    }
  });
}
