/** 日常维修工单接口 */
import type { FastifyInstance } from 'fastify';
import type { Paged, Ticket, TicketBoard, TicketStats } from '../../../shared/contract';
import { buildBoard, computeTicketStats } from '../domain/tickets';
import { parseTicketFilter, qInt, qStr, queryTickets, sortTickets, getTicketById, type ParsedTicketFilter, type Query } from '../domain/ticketQuery';
import { sendWorkbook } from '../export/common';
import { buildTicketsWorkbook } from '../export/tickets';
import { notFound } from '../lib/http';
import { shDate } from '../lib/time';
import type { AppContext } from './context';

function describeFilter(f: ParsedTicketFilter): string {
  const parts: string[] = [];
  if (f.buildings.length) parts.push(`楼栋 ${f.buildings.join('/')}`);
  if (f.types.length) parts.push(`工种 ${f.types.join('/')}`);
  if (f.statuses.length) parts.push(`状态 ${f.statuses.join('/')}`);
  if (f.column) parts.push(`看板列 ${f.column}`);
  if (f.channels.length) parts.push(`渠道 ${f.channels.join('/')}`);
  if (f.from || f.to) parts.push(`报修日期 ${f.from ?? '…'} ~ ${f.to ?? '…'}`);
  if (f.q) parts.push(`关键词「${f.q}」`);
  if (f.overdue) parts.push(`超时 ${f.overdue}`);
  if (f.excludeSpecial) parts.push('排除专项摸排');
  return parts.join('，');
}

export async function ticketRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get<{ Querystring: Query }>('/api/tickets', async (req): Promise<Paged<Ticket>> => {
    const f = parseTicketFilter(req.query);
    const page = qInt(req.query, 'page', 1, 1, 100_000);
    const pageSize = qInt(req.query, 'pageSize', 50, 1, 200);
    const all = sortTickets(queryTickets(db, f, ctx.now()), qStr(req.query, 'sort') || '-reportedAt');
    return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize };
  });

  app.get<{ Querystring: Query }>('/api/tickets/board', async (req): Promise<TicketBoard> => {
    return buildBoard(queryTickets(db, parseTicketFilter(req.query), ctx.now()));
  });

  app.get<{ Querystring: Query }>('/api/tickets/stats', async (req): Promise<TicketStats> => {
    const f = parseTicketFilter(req.query);
    const now = ctx.now();
    const tickets = queryTickets(db, f, now, { ignoreExcludeSpecial: true });
    return computeTicketStats(tickets, { now, excludeSpecial: f.excludeSpecial, from: f.from, to: f.to });
  });

  app.get<{ Querystring: Query }>('/api/tickets/export', async (req, reply) => {
    const f = parseTicketFilter(req.query);
    const now = ctx.now();
    const tickets = sortTickets(queryTickets(db, f, now), qStr(req.query, 'sort') || '-reportedAt');
    const wb = buildTicketsWorkbook(tickets, now, describeFilter(f));
    const ymd = shDate(now).replace(/-/g, '');
    return sendWorkbook(reply, wb, `湾谷园区_工单明细_${ymd}.xlsx`, `wangu_tickets_${ymd}.xlsx`);
  });

  app.get<{ Params: { id: string } }>('/api/tickets/:id', async (req): Promise<Ticket> => {
    const t = getTicketById(db, req.params.id, ctx.now());
    if (!t) throw notFound('工单不存在');
    return t;
  });
}
