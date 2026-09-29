import { deriveRouteLines } from '../data/network';
import type { ResultFilters } from '../utils/results';
import type { RouteResult, SearchConditions, SearchJob, SearchMeta, SearchResponse, SortKey } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:8000`;

interface RawRouteResult {
  route_ids?: string[];
  routeIds?: string[];
  route_names?: string[];
  routeNames?: string[];
  zone?: number;
  logs?: string[];
  satisfied?: string[];
  score?: number;
  stations_count?: number;
  stationsCount?: number;
}

interface RawSearchResponse {
  results?: RawRouteResult[];
  search?: Partial<SearchMeta> & {
    timed_out?: boolean;
    has_more?: boolean;
    returned_count?: number;
    candidate_count?: number;
    models_seen?: number;
    discovered_count?: number;
    elapsed_seconds?: number;
    stopped?: boolean;
  };
  detail?: string;
}

interface RawSearchJob {
  status: SearchJob['status'];
  response: RawSearchResponse;
  error?: string;
}

const normalizeRoute = (route: RawRouteResult, index: number): RouteResult => {
  const routeNames = route.routeNames ?? route.route_names ?? [];
  const routeIds = route.routeIds ?? route.route_ids ?? [];
  const { lines, transfers } = deriveRouteLines(routeNames);

  return {
    id: `${routeIds.join('-') || routeNames.join('-')}-${index}`,
    routeIds,
    routeNames,
    zone: route.zone ?? 0,
    logs: route.logs ?? [],
    satisfied: route.satisfied ?? [],
    score: route.score ?? 0,
    stationsCount: route.stationsCount ?? route.stations_count ?? routeNames.length,
    lines,
    transfers,
  };
};

const requestBody = (conditions: SearchConditions) => ({
      endpoints: conditions.selections.endpoints,
      via_hard: conditions.selections.via_hard,
      via_soft: conditions.selections.via_soft,
      avoid: conditions.selections.avoid,
      min_budget: conditions.minZone,
      budget: conditions.maxZone,
      max_results: 50,
});

const normalizeResponse = (payload: RawSearchResponse): SearchResponse => {
  const results = (payload.results ?? []).map(normalizeRoute);
  const search: SearchMeta = {
    complete: payload.search?.complete ?? true,
    timedOut: payload.search?.timedOut ?? payload.search?.timed_out ?? false,
    stopped: payload.search?.stopped ?? false,
    hasMore: payload.search?.hasMore ?? payload.search?.has_more ?? false,
    returnedCount: payload.search?.returnedCount ?? payload.search?.returned_count ?? results.length,
    candidateCount: payload.search?.candidateCount ?? payload.search?.candidate_count ?? results.length,
    modelsSeen: payload.search?.modelsSeen ?? payload.search?.models_seen ?? 0,
    discoveredCount: payload.search?.discoveredCount ?? payload.search?.discovered_count ?? 0,
    elapsedSeconds: payload.search?.elapsedSeconds ?? payload.search?.elapsed_seconds ?? 0,
  };

  return { results, search };
};

const parseError = async (response: Response) => {
  const payload = (await response.json()) as RawSearchResponse;
  throw new Error(payload.detail || '経路の検索に失敗しました');
};

export const searchRoutes = async (conditions: SearchConditions, signal?: AbortSignal): Promise<SearchResponse> => {
  const response = await fetch(`${API_BASE_URL}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody(conditions)),
    signal,
  });
  if (!response.ok) return parseError(response);
  return normalizeResponse((await response.json()) as RawSearchResponse);
};

export const startSearchJob = async (conditions: SearchConditions): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/solve/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody(conditions)),
  });
  if (!response.ok) return parseError(response);
  const payload = (await response.json()) as { job_id: string };
  return payload.job_id;
};

export const getSearchJob = async (jobId: string): Promise<SearchJob> => {
  const response = await fetch(`${API_BASE_URL}/solve/jobs/${jobId}`);
  if (!response.ok) return parseError(response);
  const payload = (await response.json()) as RawSearchJob;
  return {
    status: payload.status,
    response: normalizeResponse(payload.response),
    error: payload.error,
  };
};

export const stopSearchJob = async (jobId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/solve/jobs/${jobId}`, { method: 'DELETE' });
  if (!response.ok) return parseError(response);
};

export const getSearchJobResults = async (
  jobId: string,
  filters: ResultFilters,
  sortKey: SortKey,
  limit = 20,
): Promise<SearchResponse> => {
  const parameters = new URLSearchParams({
    sort_key: sortKey,
    min_satisfied: String(filters.minSatisfied),
    min_zone: String(filters.minZone),
    max_zone: String(filters.maxZone),
    min_stations: String(filters.minStations),
    max_stations: String(filters.maxStations),
    station_ids: filters.stationIds.join(','),
    limit: String(limit),
  });
  const response = await fetch(`${API_BASE_URL}/solve/jobs/${jobId}/results?${parameters}`);
  if (!response.ok) return parseError(response);
  return normalizeResponse((await response.json()) as RawSearchResponse);
};
