/** /api/health、/api/meta、/api/sync、/api/sync/status */
import type { FastifyInstance } from 'fastify';
import {
  OVERDUE_THRESHOLDS_HOURS,
  TICKET_TYPES,
  TICKET_TYPE_OWNER,
  type Meta,
  type SyncRun,
  type SyncStatus,
  type TicketStatus,
} from '../../../shared/contract';
import { BUILDINGS } from '../buildings';
import { feishuMode } from '../config';
import { groupInfos } from '../domain/legacy';
import { distinctLegacyStatuses } from '../domain/legacyQuery';
import { distinctChannels } from '../domain/ticketQuery';
import { energyMode } from '../energy/service';
import { toShISO } from '../lib/time';
import { isSyncRunning, lastSyncRun, listSyncRuns, localDataSource, runSync } from '../sync/runner';
import { nextScheduledAt } from '../sync/scheduler';
import type { AppContext } from './context';

const TICKET_STATUSES: TicketStatus[] = ['待处理', '跟进中', '已完成', '幕墙专项'];

export async function metaRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get('/api/health', async () => ({ ok: true, version: ctx.version }));

  app.get('/api/meta', async (): Promise<Meta> => {
    const groupRows = db.prepare('SELECT DISTINCT grp, source_table FROM legacy_items').all() as unknown as {
      grp: Meta['legacyGroups'][number]['key'];
      source_table: string;
    }[];
    return {
      buildings: BUILDINGS,
      ticketTypes: TICKET_TYPES.map((type) => ({ type, owner: TICKET_TYPE_OWNER[type] })),
      ticketStatuses: TICKET_STATUSES,
      channels: distinctChannels(db),
      legacyGroups: groupInfos(groupRows.map((r) => ({ group: r.grp, sourceTable: r.source_table }))),
      legacyStatuses: distinctLegacyStatuses(db),
      thresholds: OVERDUE_THRESHOLDS_HOURS,
      dataMode: { feishu: localDataSource(db) ?? feishuMode(), energy: await energyMode() },
      lastSync: lastSyncRun(db),
      now: toShISO(ctx.now()),
    };
  });

  app.post('/api/sync', async (req): Promise<SyncRun> => {
    return runSync(db, 'manual', undefined, (m) => req.log.info(`[sync] ${m}`));
  });

  app.get('/api/sync/status', async (): Promise<SyncStatus> => {
    const history = listSyncRuns(db, 20).filter((r) => r.finishedAt !== null);
    return {
      running: isSyncRunning(),
      last: lastSyncRun(db),
      history,
      nextScheduledAt: nextScheduledAt(),
    };
  });
}
