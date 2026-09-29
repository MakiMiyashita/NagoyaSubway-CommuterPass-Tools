import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { CONNECTIONS, getLineBetween } from '../data/network';
import { STATIONS } from '../data/stations';
import { LINE_INFO } from '../constants/lines';
import type { MapSelectionMode, RouteResult, StationRole, StationSelection } from '../types';

const stationEntries = Object.entries(STATIONS);
const INITIAL_VIEW = { x: 25, y: 125, width: 800, height: 610 };
const MAP_BOUNDS = INITIAL_VIEW;
const MINIMUM_VIEW_WIDTH = 260;
const MAXIMUM_VIEW_WIDTH = MAP_BOUNDS.width;
const VIEW_ASPECT_RATIO = INITIAL_VIEW.height / INITIAL_VIEW.width;
const PINCH_ZOOM_SENSITIVITY = 1.25;

const stationLines = CONNECTIONS.reduce((linesByStation, connection) => {
  [connection.from, connection.to].forEach((stationId) => {
    const lines = linesByStation.get(stationId) ?? new Set();
    lines.add(connection.line);
    linesByStation.set(stationId, lines);
  });
  return linesByStation;
}, new Map<string, Set<string>>());

const transferStationIds = new Set(
  [...stationLines.entries()].filter(([, lines]) => lines.size > 1).map(([stationId]) => stationId),
);

const constrainView = (next: typeof INITIAL_VIEW) => {
  if (![next.x, next.y, next.width, next.height].every(Number.isFinite) || next.width <= 0 || next.height <= 0) {
    return INITIAL_VIEW;
  }
  const minimumX = MAP_BOUNDS.x;
  const maximumX = MAP_BOUNDS.x + MAP_BOUNDS.width - next.width;
  const minimumY = MAP_BOUNDS.y;
  const maximumY = MAP_BOUNDS.y + MAP_BOUNDS.height - next.height;
  return {
    ...next,
    x: minimumX > maximumX
      ? MAP_BOUNDS.x + (MAP_BOUNDS.width - next.width) / 2
      : Math.min(maximumX, Math.max(minimumX, next.x)),
    y: minimumY > maximumY
      ? MAP_BOUNDS.y + (MAP_BOUNDS.height - next.height) / 2
      : Math.min(maximumY, Math.max(minimumY, next.y)),
  };
};

const zoomViewAtClientPoint = (
  svg: SVGSVGElement,
  current: typeof INITIAL_VIEW,
  factor: number,
  clientX: number,
  clientY: number,
) => {
  const rect = svg.getBoundingClientRect();
  if (!Number.isFinite(factor) || factor <= 0 || rect.width <= 0 || rect.height <= 0) return current;

  // SVG's default xMidYMid meet alignment can add letterboxing. Account for the
  // actually rendered viewBox instead of treating the whole element as map space.
  const renderedScale = Math.min(rect.width / current.width, rect.height / current.height);
  const renderedWidth = current.width * renderedScale;
  const renderedHeight = current.height * renderedScale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;
  const ratioX = Math.min(1, Math.max(0, (clientX - rect.left - offsetX) / renderedWidth));
  const ratioY = Math.min(1, Math.max(0, (clientY - rect.top - offsetY) / renderedHeight));
  const centerX = current.x + ratioX * current.width;
  const centerY = current.y + ratioY * current.height;
  const width = Math.min(MAXIMUM_VIEW_WIDTH, Math.max(MINIMUM_VIEW_WIDTH, current.width * factor));
  const height = width * VIEW_ASPECT_RATIO;
  return constrainView({ x: centerX - width * ratioX, y: centerY - height * ratioY, width, height });
};

interface Props {
  selections: StationSelection;
  filterStationIds: string[];
  activeRole: MapSelectionMode;
  activeRoute?: RouteResult;
  onStationClick: (stationName: string) => void;
  overlay?: ReactNode;
}

const roleForStation = (stationId: string, selections: StationSelection) =>
  (Object.keys(selections) as StationRole[]).find((role) => selections[role].includes(stationId));

export function SubwayMap({ selections, filterStationIds, activeRole, activeRoute, onStationClick, overlay }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  const pointerPositionsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef<number | null>(null);
  const gestureScaleRef = useRef(1);
  const [view, setView] = useState(INITIAL_VIEW);
  const [dragged, setDragged] = useState(false);
  const routeEdges = useMemo(() => {
    const edges = new Set<string>();
    activeRoute?.routeNames.slice(0, -1).forEach((from, index) => {
      edges.add([from, activeRoute.routeNames[index + 1]].sort().join('::'));
    });
    return edges;
  }, [activeRoute]);

  const routeStationSet = useMemo(() => new Set(activeRoute?.routeNames ?? []), [activeRoute]);

  const zoom = (factor: number, centerX = view.x + view.width / 2, centerY = view.y + view.height / 2) => {
    const width = Math.min(MAXIMUM_VIEW_WIDTH, Math.max(MINIMUM_VIEW_WIDTH, view.width * factor));
    const height = width * VIEW_ASPECT_RATIO;
    const ratioX = (centerX - view.x) / view.width;
    const ratioY = (centerY - view.y) / view.height;
    setView(constrainView({ x: centerX - width * ratioX, y: centerY - height * ratioY, width, height }));
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const zoomFromPointer = (factor: number, clientX: number, clientY: number) => {
      const rect = svg.getBoundingClientRect();
      const pointerX = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2;
      const pointerY = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2;
      const safeFactor = Math.min(1.25, Math.max(0.75, factor));
      setView((current) => zoomViewAtClientPoint(svg, current, safeFactor, pointerX, pointerY));
    };

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1;
      const normalizedDelta = Math.max(-100, Math.min(100, event.deltaY * deltaScale));
      zoomFromPointer(Math.exp(normalizedDelta * 0.0015 * PINCH_ZOOM_SENSITIVITY), event.clientX, event.clientY);
    };
    const handleGestureStart = (event: Event) => {
      event.preventDefault();
      gestureScaleRef.current = 1;
    };
    const handleGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & { scale: number; clientX: number; clientY: number };
      if (!Number.isFinite(gesture.scale) || gesture.scale <= 0) return;
      const factor = Math.pow(gestureScaleRef.current / gesture.scale, PINCH_ZOOM_SENSITIVITY);
      gestureScaleRef.current = gesture.scale;
      zoomFromPointer(factor, gesture.clientX, gesture.clientY);
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    svg.addEventListener('gesturestart', handleGestureStart, { passive: false });
    svg.addEventListener('gesturechange', handleGestureChange, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
      svg.removeEventListener('gesturestart', handleGestureStart);
      svg.removeEventListener('gesturechange', handleGestureChange);
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch') {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pointers = [...pointerPositionsRef.current.values()];
      if (pointers.length >= 2) {
        pinchDistanceRef.current = Math.hypot(pointers[1].x - pointers[0].x, pointers[1].y - pointers[0].y);
        dragRef.current = null;
        setDragged(true);
        return;
      }
    }
    if (event.target instanceof Element && event.target.closest('.station')) {
      dragRef.current = null;
      setDragged(false);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
    setDragged(false);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch' && pointerPositionsRef.current.has(event.pointerId)) {
      pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pointers = [...pointerPositionsRef.current.values()];
      if (pointers.length >= 2) {
        const distance = Math.hypot(pointers[1].x - pointers[0].x, pointers[1].y - pointers[0].y);
        const previousDistance = pinchDistanceRef.current;
        pinchDistanceRef.current = distance;
        if (previousDistance && distance > 0) {
          const centerX = (pointers[0].x + pointers[1].x) / 2;
          const centerY = (pointers[0].y + pointers[1].y) / 2;
          const svg = event.currentTarget;
          setView((current) => zoomViewAtClientPoint(svg, current, previousDistance / distance, centerX, centerY));
        }
        return;
      }
    }
    if (!dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    const { viewX, viewY } = dragRef.current;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) setDragged(true);
    setView((current) => {
      const renderedScale = Math.min(rect.width / current.width, rect.height / current.height);
      return constrainView({
        ...current,
        x: viewX - deltaX / renderedScale,
        y: viewY - deltaY / renderedScale,
      });
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointerPositionsRef.current.delete(event.pointerId);
    if (pointerPositionsRef.current.size < 2) pinchDistanceRef.current = null;
    dragRef.current = null;
    if (pointerPositionsRef.current.size === 0) window.setTimeout(() => setDragged(false), 0);
  };

  const fitActiveRoute = () => {
    const points = activeRoute?.routeNames.map((stationId) => STATIONS[stationId]).filter(Boolean) ?? [];
    if (points.length < 2) return;
    const xs = points.map((point) => point!.x);
    const ys = points.map((point) => point!.y);
    const width = Math.max(260, Math.max(...xs) - Math.min(...xs) + 160);
    const height = width * VIEW_ASPECT_RATIO;
    const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
    setView(constrainView({ x: centerX - width / 2, y: centerY - height / 2, width, height }));
  };

  const labelScale = view.width / INITIAL_VIEW.width;
  const instruction = activeRole === 'endpoints'
    ? '駅をタップして始発・終着駅を選択'
    : activeRole === 'via_hard'
      ? '駅をタップして必須駅を選択'
      : activeRole === 'via_soft'
        ? '駅をタップして希望する駅を選択'
        : activeRole === 'avoid'
          ? '駅をタップして通らない駅を選択'
          : '経由駅を選択して経路を絞り込む';

  return (
    <section className="map-shell" aria-label="名古屋市営地下鉄の路線図">
      <div className="map-instruction">{instruction}</div>
      <svg
        ref={svgRef}
        className="subway-map"
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <rect x="-300" y="-300" width="1500" height="1400" className="map-background" />
        <g className="network-lines">
          {CONNECTIONS.map((connection) => {
            const from = STATIONS[connection.from];
            const to = STATIONS[connection.to];
            if (!from || !to) return null;
            const key = [connection.from, connection.to].sort().join('::');
            const active = routeEdges.has(key);
            const muted = Boolean(activeRoute) && !active;
            return <line key={`${connection.from}-${connection.to}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={LINE_INFO[connection.line].color} className={`route-line ${active ? 'active' : ''} ${muted ? 'map-muted' : ''}`} />;
          })}
        </g>
        <g className="stations">
          {stationEntries.map(([id, station]) => {
            const role = roleForStation(id, selections);
            const filterSelected = filterStationIds.includes(id);
            const onRoute = routeStationSet.has(id);
            const transferStation = transferStationIds.has(id);
            const muted = Boolean(activeRoute) && !onRoute && !role && !filterSelected;
            const important = Boolean(role || filterSelected || onRoute || transferStation || ['名古屋', '栄', '金山', '本山', '今池', '八事'].includes(station.nameJa));
            return (
              <g
                key={id}
                className={`station ${role ?? ''} ${filterSelected ? 'filter-selected' : ''} ${onRoute ? 'on-route' : ''} ${transferStation ? 'transfer-station' : ''} ${muted ? 'map-muted' : ''}`}
                transform={`translate(${station.x} ${station.y})`}
                onClick={(event) => { event.stopPropagation(); if (!dragged) onStationClick(id); }}
                role="button"
                tabIndex={0}
                aria-label={`${station.nameJa}を選択`}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onStationClick(id); }}
              >
                <circle r={16 * labelScale} className="station-hit-area" />
                {filterSelected && <circle r={14} className="filter-halo" />}
                {role && <circle r={11} className="role-halo" />}
                {transferStation && !role && !filterSelected && <circle r={7.5} className="transfer-ring" />}
                <circle r={role ? 6.2 : transferStation ? 5.2 : 4.2} className="station-dot" />
                <text
                  x={8 * labelScale}
                  y={-7 * labelScale}
                  fontSize={13 * labelScale}
                  className={`station-label ${important || view.width < 520 ? 'always-visible' : ''}`}
                >
                  {station.nameJa}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="map-controls" aria-label="地図操作">
        <button onClick={() => zoom(0.82)} aria-label="拡大">＋</button>
        <button onClick={() => zoom(1.22)} aria-label="縮小">−</button>
        {activeRoute && <button onClick={fitActiveRoute} aria-label="選択中の経路を表示">経路</button>}
        <button onClick={() => setView(INITIAL_VIEW)} aria-label="全体表示">全体</button>
      </div>
      {overlay}
    </section>
  );
}
