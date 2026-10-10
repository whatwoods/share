/** 施工遗留攻坚接口 */
import type { FastifyInstance } from 'fastify';
import type { LegacyGroup, LegacyItem, LegacySummary } from '../../../shared/contract';
import { feishuMode } from '../config';
import { LEGACY_GROUP_KEYS, summarizeLegacy } from '../domain/legacy';
import { filterLegacy, loadLegacyItems, parseLegacyFilter } from '../domain/legacyQuery';
import { qStr, type Query } from '../domain/ticketQuery';
import { sendWorkbook } from '../export/common';
import { buildLegacyWorkbook, legacyExportFilename } from '../export/legacy';
import { badRequest } from '../lib/http';
import { shDate } from '../lib/time';
import { localDataSource } from '../sync/runner';
import type { AppContext } from './context';

export async function legacyRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get<{ Querystring: Query }>('/api/legacy', async (req): Promise<{ items: LegacyItem[] }> => {
    const items = loadLegacyItems(db, ctx.now());
    return { items: filterLegacy(items, parseLegacyFilter(req.query)) };
  });

  app.get('/api/legacy/summary', async (): Promise<LegacySummary> => summarizeLegacy(loadLegacyItems(db, ctx.now())));

  app.get<{ Querystring: Query }>('/api/legacy/export', async (req, reply) => {
    const raw = (qStr(req.query, 'group') || 'ALL').toUpperCase();
    if (raw !== 'ALL' && !(LEGACY_GROUP_KEYS as string[]).includes(raw)) {
      throw badRequest(`group 参数无效：${raw}（可选 ${LEGACY_GROUP_KEYS.join('|')}|ALL）`);
    }
    const group = raw as LegacyGroup | 'ALL';
    const now = ctx.now();
    const wb = buildLegacyWorkbook(loadLegacyItems(db, now), group, {
      now,
      openOnly: qStr(req.query, 'open') === '1',
      dataMode: localDataSource(db) ?? feishuMode(),
    });
    return sendWorkbook(reply, wb, legacyExportFilename(group, now), `wangu_legacy_${group}_${shDate(now).replace(/-/g, '')}.xlsx`);
  });
}
