export type StationRole = 'endpoints' | 'via_hard' | 'via_soft' | 'avoid';
export type MapSelectionMode = StationRole | 'filter_station';

export type TicketKind = 'commuter' | 'university' | 'student' | 'child' | 'discounted_commuter' | 'discounted_student';
export type TicketPeriod = '1' | '3' | '6';

export type StationSelection = Record<StationRole, string[]>;

export interface SearchConditions {
  ticketKind: TicketKind;
  period: TicketPeriod;
  minZone: number;
  maxZone: number;
  selections: StationSelection;
}

export interface StationData {
  nameJa: string;
  x: number;
  y: number;
  dir?: 'left' | 'right' | 'top' | 'bottom';
}

export type LineId =
  | 'higashiyama'
  | 'meijo'
  | 'meiko'
  | 'tsurumai'
  | 'sakuradori'
  | 'kamiiida';

export interface Connection {
  from: string;
  to: string;
  line: LineId;
}

export interface TransferPoint {
  station: string;
  fromLine: LineId;
  toLine: LineId;
}

export interface RouteResult {
  id: string;
  routeIds: string[];
  routeNames: string[];
  zone: number;
  satisfied: string[];
  logs: string[];
  stationsCount: number;
  score: number;
  transfers: TransferPoint[];
  lines: LineId[];
}

export interface SearchMeta {
  complete: boolean;
  timedOut: boolean;
  stopped: boolean;
  hasMore: boolean;
  returnedCount: number;
  candidateCount: number;
  modelsSeen: number;
  discoveredCount: number;
  elapsedSeconds: number;
}

export interface SearchResponse {
  results: RouteResult[];
  search: SearchMeta;
}

export interface SearchJob {
  status: 'running' | 'complete' | 'stopped' | 'error';
  response: SearchResponse;
  error?: string;
}

export type SortKey = 'recommended' | 'satisfaction' | 'zone' | 'stations';
