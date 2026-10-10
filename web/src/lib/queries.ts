import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthMe,
  BuildingCard,
  BuildingDetail,
  Circuit,
  EnergyBuildingRow,
  EnergyHeatmap,
  EnergyInsight,
  EnergyOverview,
  LegacyItem,
  LegacySummary,
  Meta,
  Paged,
  SolarStatus,
  SyncRun,
  SyncStatus,
  Ticket,
  TicketBoard,
  TicketStats,
} from '@shared/contract';
import { api, type Query } from './api';

const MIN = 60_000;

export const useAuthMe = () =>
  useQuery({ queryKey: ['auth', 'me'], queryFn: () => api<AuthMe>('/auth/me'), staleTime: 5 * MIN, retry: false });

export const useMeta = () =>
  useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: MIN, refetchInterval: 5 * MIN });

export const useSyncStatus = (enabled = true) =>
  useQuery({
    queryKey: ['sync', 'status'],
    queryFn: () => api<SyncStatus>('/sync/status'),
    enabled,
    refetchInterval: (q) => (q.state.data?.running ? 2000 : MIN),
  });

export function useSyncNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SyncRun>('/sync', { method: 'POST' }),
    onSettled: () => qc.invalidateQueries(),
  });
}

/* ── 工单 ── */
export const useTickets = (q: Query, enabled = true) =>
  useQuery({ queryKey: ['tickets', 'list', q], queryFn: () => api<Paged<Ticket>>('/tickets', { query: q }), placeholderData: keepPreviousData, enabled });

export const useTicketBoard = (q: Query) =>
  useQuery({ queryKey: ['tickets', 'board', q], queryFn: () => api<TicketBoard>('/tickets/board', { query: q }), placeholderData: keepPreviousData });

export const useTicketStats = (q: Query) =>
  useQuery({ queryKey: ['tickets', 'stats', q], queryFn: () => api<TicketStats>('/tickets/stats', { query: q }), placeholderData: keepPreviousData });

export const useTicket = (id: string | null) =>
  useQuery({ queryKey: ['tickets', 'one', id], queryFn: () => api<Ticket>(`/tickets/${encodeURIComponent(id!)}`), enabled: !!id });

/* ── 遗留 ── */
export const useLegacy = (q: Query, enabled = true) =>
  useQuery({ queryKey: ['legacy', 'list', q], queryFn: () => api<{ items: LegacyItem[] }>('/legacy', { query: q }), placeholderData: keepPreviousData, enabled });

export const useLegacySummary = () =>
  useQuery({ queryKey: ['legacy', 'summary'], queryFn: () => api<LegacySummary>('/legacy/summary') });

/* ── 能耗 ── */
export const useEnergyOverview = (q: Query) =>
  useQuery({
    queryKey: ['energy', 'overview', q],
    queryFn: () => api<EnergyOverview>('/energy/overview', { query: q }),
    placeholderData: keepPreviousData,
    refetchInterval: MIN,
  });

export const useEnergyBuildings = (q: Query) =>
  useQuery({
    queryKey: ['energy', 'buildings', q],
    queryFn: () => api<{ start: string; end: string; items: EnergyBuildingRow[] }>('/energy/buildings', { query: q }),
    placeholderData: keepPreviousData,
  });

export const useBuildingTrend = (code: string | null, days = 14) =>
  useQuery({
    queryKey: ['energy', 'trend', code, days],
    queryFn: () => api<{ code: string; items: { date: string; kwh: number }[] }>(`/energy/buildings/${code}/trend`, { query: { days } }),
    enabled: !!code,
  });

export const useHeatmap = (days = 14) =>
  useQuery({ queryKey: ['energy', 'heatmap', days], queryFn: () => api<EnergyHeatmap>('/energy/heatmap', { query: { days } }) });

export const useInsight = () =>
  useQuery({ queryKey: ['energy', 'insight'], queryFn: () => api<EnergyInsight>('/energy/insight'), staleTime: 10 * MIN });

export const useCircuits = () =>
  useQuery({
    queryKey: ['energy', 'circuits'],
    queryFn: () => api<{ items: Circuit[]; categories: { type: string; count: number; kwh: number | null }[] }>('/energy/circuits'),
    staleTime: 10 * MIN,
  });

export const useSolar = () =>
  useQuery({ queryKey: ['energy', 'solar'], queryFn: () => api<SolarStatus>('/energy/solar'), refetchInterval: MIN });

/* ── 楼宇 ── */
export const useBuildingsOverview = () =>
  useQuery({ queryKey: ['buildings', 'overview'], queryFn: () => api<{ items: BuildingCard[] }>('/buildings/overview'), refetchInterval: 2 * MIN });

export const useBuildingDetail = (code: string | null) =>
  useQuery({
    queryKey: ['buildings', 'detail', code],
    queryFn: () => api<BuildingDetail>(`/buildings/${code}`),
    enabled: !!code,
    placeholderData: keepPreviousData,
  });
