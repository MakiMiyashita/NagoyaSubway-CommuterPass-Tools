import type { RouteResult, SortKey } from '../types';

export interface ResultFilters {
  minSatisfied: number;
  minZone: number;
  maxZone: number;
  minStations: number;
  maxStations: number;
  stationIds: string[];
  stationQuery: string;
}

export const filterAndSortResults = (
  results: RouteResult[],
  filters: ResultFilters,
  sortKey: SortKey,
) => {
  const filtered = results.filter(
    (result) =>
      result.satisfied.length >= filters.minSatisfied &&
      result.zone >= filters.minZone &&
      result.zone <= filters.maxZone &&
      result.stationsCount >= filters.minStations &&
      result.stationsCount <= filters.maxStations &&
      filters.stationIds.every((stationId) => result.routeNames.includes(stationId)),
  );

  return [...filtered].sort((a, b) => {
    if (sortKey === 'satisfaction') return b.satisfied.length - a.satisfied.length;
    if (sortKey === 'zone') return a.zone - b.zone;
    if (sortKey === 'stations') return b.stationsCount - a.stationsCount;
    return (
      b.satisfied.length - a.satisfied.length ||
      a.zone - b.zone ||
      b.stationsCount - a.stationsCount
    );
  });
};
