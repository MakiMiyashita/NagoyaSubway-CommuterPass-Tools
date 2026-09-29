import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { getMatchingStationIds, getStationLabel, STATION_LABELS } from '../data/stations';
import type { ResultFilters } from '../utils/results';

interface Props {
  filters: ResultFilters;
  preferredCount: number;
  onFiltersChange: (filters: ResultFilters) => void;
}

const FilterIcon = () => (
  <svg className="filter-mark" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M2 3h16l-6.3 7.1v5.2l-3.4 1.7v-6.9L2 3Z" fill="currentColor" />
  </svg>
);

export function ResultFilterPanel({ filters, preferredCount, onFiltersChange }: Props) {
  const [focused, setFocused] = useState(false);
  const [closed, setClosed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | undefined>(undefined);
  const query = filters.stationQuery.trim();
  const suggestions = query
    ? STATION_LABELS.filter((name) => name.includes(query) && !filters.stationIds.some((id) => getStationLabel(id) === name)).slice(0, 6)
    : [];
  const update = (patch: Partial<ResultFilters>) => onFiltersChange({ ...filters, ...patch });
  const addStation = (name: string) => {
    const stationId = getMatchingStationIds(name).find((id) => getStationLabel(id) === name);
    if (!stationId || filters.stationIds.includes(stationId)) return;
    update({ stationIds: [...filters.stationIds, stationId], stationQuery: '' });
    setFocused(false);
  };
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position.x, originY: position.y };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setPosition({
      x: drag.current.originX + event.clientX - drag.current.x,
      y: drag.current.originY + event.clientY - drag.current.y,
    });
  };
  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = undefined;
  };
  const positionStyle = { '--filter-x': `${position.x}px`, '--filter-y': `${position.y}px` } as CSSProperties;

  if (closed) {
    return <button type="button" className="map-filter-reopen" onClick={() => setClosed(false)}><FilterIcon />絞り込む</button>;
  }

  return (
    <aside className="map-filter-panel" style={positionStyle}>
      <div className="map-filter-heading">
        <button type="button" className="map-filter-drag-handle" aria-label="絞り込みカードを移動" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
          <strong><FilterIcon />絞り込み</strong>
          <span>ドラッグして移動</span>
        </button>
        <button type="button" className="map-filter-close" aria-label="絞り込みカードを閉じる" onClick={() => setClosed(true)}>×</button>
      </div>
      <div className="map-filter-body">
        <label>この駅を経由
          <span className="station-autocomplete">
            <input
              value={filters.stationQuery}
              placeholder="駅名を入力，または地図で選択"
              autoComplete="off"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(event) => update({ stationQuery: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && suggestions[0]) {
                  event.preventDefault();
                  addStation(suggestions[0]);
                }
              }}
            />
            {focused && suggestions.length > 0 && (
              <span className="station-suggestions">
                {suggestions.map((name) => <button key={name} type="button" onMouseDown={(event) => { event.preventDefault(); addStation(name); }}>{name}</button>)}
              </span>
            )}
          </span>
        </label>
        {filters.stationIds.length > 0 && (
          <div className="filter-station-list">
            {filters.stationIds.map((id) => <button key={id} type="button" onClick={() => update({ stationIds: filters.stationIds.filter((item) => item !== id) })}>{getStationLabel(id)}<span>×</span></button>)}
          </div>
        )}
        <div className="map-filter-grid">
          <label>通したい駅の希望達成数<input type="number" min="0" max={preferredCount} value={filters.minSatisfied} onChange={(event) => update({ minSatisfied: Math.min(preferredCount, Math.max(0, Number(event.target.value))) })} /></label>
          <label>料金区下限<input type="number" min="1" max="5" value={filters.minZone} onChange={(event) => update({ minZone: Math.min(5, Math.min(Number(event.target.value), filters.maxZone)) })} /></label>
          <label>料金区上限<input type="number" min="1" max="5" value={filters.maxZone} onChange={(event) => update({ maxZone: Math.max(1, Math.max(Number(event.target.value), filters.minZone)) })} /></label>
          <label>駅数下限<input type="number" min="2" max="50" value={filters.minStations} onChange={(event) => update({ minStations: Math.min(50, Math.min(Number(event.target.value), filters.maxStations)) })} /></label>
          <label>駅数上限<input type="number" min="2" max="50" value={filters.maxStations} onChange={(event) => update({ maxStations: Math.max(2, Math.max(Number(event.target.value), filters.minStations)) })} /></label>
        </div>
      </div>
    </aside>
  );
}
