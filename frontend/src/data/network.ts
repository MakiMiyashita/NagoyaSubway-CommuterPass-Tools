import { CONNECTIONS as rawConnections } from './adj.js';
import type { Connection, LineId, TransferPoint } from '../types';

export const CONNECTIONS = rawConnections as Connection[];

const edgeKey = (from: string, to: string) => [from, to].sort().join('::');

const lineByEdge = new Map<string, LineId>(
  CONNECTIONS.map((connection) => [edgeKey(connection.from, connection.to), connection.line]),
);

export const getLineBetween = (from: string, to: string) => lineByEdge.get(edgeKey(from, to));

export const deriveRouteLines = (routeNames: string[]) => {
  const edgeLines = routeNames
    .slice(0, -1)
    .map((station, index) => getLineBetween(station, routeNames[index + 1]))
    .filter((line): line is LineId => Boolean(line));

  const lines = edgeLines.filter((line, index) => index === 0 || line !== edgeLines[index - 1]);
  const transfers: TransferPoint[] = [];

  edgeLines.forEach((line, index) => {
    if (index === 0) return;
    const previous = edgeLines[index - 1];
    if (previous !== line) {
      transfers.push({
        station: routeNames[index],
        fromLine: previous,
        toLine: line,
      });
    }
  });

  return { lines, transfers };
};
