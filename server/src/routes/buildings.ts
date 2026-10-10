/** 楼宇全景：能耗（容错）+ 工单 + 遗留 */
import type { FastifyInstance } from 'fastify';
import {
  TICKET_TYPES,
  type BuildingCard,
  type BuildingCode,
  type BuildingDetail,
  type Circuit,
  type LegacyItem,
  type Ticket,
} from '../../../shared/contract';
import { BUILDING_CODES, buildingInfo } from '../buildings';
import { compareLegacy } from '../domain/legacy';
import { loadLegacyItems } from '../domain/legacyQuery';
import { parseTicketFilter, queryTickets } from '../domain/ticketQuery';
import { compareBySeverity, rateRow } from '../domain/tickets';
import * as energy from '../energy/service';
import { notFound } from '../lib/http';
import type { AppContext } from './context';
import { parseBuildingParam } from './energy';

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const t of list) {
    const k = key(t);
    const arr = m.get(k);
    if (arr) arr.push(t);
    else m.set(k, [t]);
  }
  return m;
}

async function safe<T>(p: Promise<T>, log: (e: unknown) => void): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    log(e);
    return null;
  }
}

function health(t: { red: number; yellow: number }, l: { open: number; highRisk: number }): BuildingCard['health'] {
  if (t.red > 0 || l.highRisk > 0) return 'bad';
  if (t.yellow > 0 || l.open > 0) return 'warn';
  return 'good';
}

export async function buildingRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const allTickets = (now: number) => queryTickets(db, parseTicketFilter({}), now);

  app.get('/api/buildings/overview', async (req): Promise<{ items: BuildingCard[] }> => {
    const now = ctx.now();
    const days30 = energy.lastNDays(30);
    const days14 = days30.slice(-14);
    const log = (e: unknown) => req.log.warn({ err: e }, '楼宇全景：能耗获取失败');
    const [totals, daily] = await Promise.all([
      safe(energy.getBuildingTotals(days30[0]!, days30[days30.length - 1]!), log),
      safe(energy.getBuildingDaily(days14), log),
    ]);
    const tickets = groupBy(allTickets(now), (t) => t.building);
    const legacy = groupBy(loadLegacyItems(db, now), (l) => l.building);
    const yesterday = days14[days14.length - 1]!;

    const items = BUILDING_CODES.map((code): BuildingCard => {
      const ts = (tickets.get(code) ?? []).filter((t) => t.column !== '已完成');
      const t = {
        open: ts.length,
        red: ts.filter((x) => x.overdue === 'red').length,
        yellow: ts.filter((x) => x.overdue === 'yellow').length,
      };
      const ls = (legacy.get(code) ?? []).filter((x) => x.isOpen);
      const l = { open: ls.length, highRisk: ls.filter((x) => x.risk.level === 'high').length };
      const kwh30 = totals?.data[code];
      return {
        ...buildingInfo(code),
        energy: {
          kwh30d: kwh30 === undefined ? null : Math.round(kwh30),
          yesterdayKwh: daily?.data[yesterday]?.[code] !== undefined ? Math.round(daily.data[yesterday]![code]!) : null,
          spark: daily ? days14.map((d) => Math.round(daily.data[d]?.[code] ?? 0)) : [],
        },
        tickets: t,
        legacy: l,
        health: health(t, l),
      };
    });
    return { items };
  });

  app.get<{ Params: { code: string } }>('/api/buildings/:code', async (req): Promise<BuildingDetail> => {
    const code = parseBuildingParam(req.params.code) as BuildingCode | null;
    if (!code || !(BUILDING_CODES as string[]).includes(code)) throw notFound('楼栋不存在');
    const now = ctx.now();
    const days30 = energy.lastNDays(30);
    const log = (e: unknown) => req.log.warn({ err: e }, '楼栋详情：能耗获取失败');
    const [totals, daily, circuits] = await Promise.all([
      safe(energy.getBuildingTotals(days30[0]!, days30[days30.length - 1]!), log),
      safe(energy.getBuildingDaily(days30), log),
      safe(energy.getCircuits(), log),
    ]);
    const yesterday = days30[days30.length - 1]!;

    const tickets: Ticket[] = queryTickets(db, parseTicketFilter({ building: code }), now);
    const open = tickets.filter((t) => t.column !== '已完成').sort(compareBySeverity);
    const closed = tickets.length - open.length;
    const typeMap = groupBy(tickets, (t) => t.type);
    const typeKeys = [...TICKET_TYPES, ...[...typeMap.keys()].filter((k) => !(TICKET_TYPES as readonly string[]).includes(k))];

    const legacy: LegacyItem[] = loadLegacyItems(db, now)
      .filter((l) => l.building === code)
      .sort(compareLegacy);
    const myCircuits: Circuit[] = circuits ? circuits.data.items.filter((c) => c.building === code) : [];
    const kwh30 = totals?.data[code];

    return {
      building: buildingInfo(code),
      energy: {
        kwh30d: kwh30 === undefined ? null : Math.round(kwh30),
        yesterdayKwh: daily?.data[yesterday]?.[code] !== undefined ? Math.round(daily.data[yesterday]![code]!) : null,
        trend: daily ? days30.map((date) => ({ date, kwh: Math.round(daily.data[date]?.[code] ?? 0) })) : [],
        circuits: myCircuits,
      },
      tickets: {
        stats: {
          ...rateRow(tickets.length, closed),
          red: open.filter((t) => t.overdue === 'red').length,
          yellow: open.filter((t) => t.overdue === 'yellow').length,
        },
        open: open.slice(0, 100),
        byType: typeKeys.map((type) => {
          const list = typeMap.get(type) ?? [];
          return { type, total: list.length, open: list.filter((t) => t.column !== '已完成').length };
        }),
      },
      legacy,
    };
  });
}
