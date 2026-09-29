import { LINE_INFO } from '../constants/lines';
import { formatYen, getFare } from '../constants/fares';
import type { RouteResult, TicketKind, TicketPeriod } from '../types';
import { getStationLabel } from '../data/stations';

interface Props {
  result: RouteResult;
  preferredStations: string[];
  ticketKind: TicketKind;
  period: TicketPeriod;
  selected: boolean;
  onSelect: () => void;
}

export function RouteCard({ result, preferredStations, ticketKind, period, selected, onSelect }: Props) {
  const unmet = preferredStations.filter((station) => !result.satisfied.includes(station));
  const start = result.routeNames[0] ? getStationLabel(result.routeNames[0]) : '未設定';
  const end = result.routeNames.length ? getStationLabel(result.routeNames[result.routeNames.length - 1]) : '未設定';

  return (
    <button
      className={`route-card ${selected ? 'selected' : ''}`}
      onClick={(event) => {
        if (window.matchMedia('(max-width: 760px)').matches) {
          event.currentTarget.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
        onSelect();
      }}
      aria-pressed={selected}
    >
      <div className="route-card-top">
        <div>
          <span className="fare">{formatYen(getFare(ticketKind, period, result.zone))}</span>
          <span className="zone">{result.zone}区</span>
        </div>
        <span className="match">定期範囲 <strong>{result.stationsCount}</strong>駅</span>
      </div>
      <div className="journey-chain" aria-label={`${start}から${end}までの経路`}>
        <span className="journey-station">{start}</span>
        {result.lines.map((line, index) => (
          <span key={`${line}-${index}`} className="journey-leg">
            <span className="journey-dash">—</span>
            <span className="line-chip" style={{ '--line-color': LINE_INFO[line].color } as React.CSSProperties}>
              {LINE_INFO[line].code}<small>{LINE_INFO[line].name}</small>
            </span>
            <span className="route-arrow">→</span>
            <span className="journey-station">
              {index < result.transfers.length ? getStationLabel(result.transfers[index].station) : end}
            </span>
          </span>
        ))}
        {result.lines.length === 0 && <><span className="route-arrow">→</span><span className="journey-station">{end}</span></>}
      </div>
      <div className="route-stats">
        <span>乗換 {result.transfers.length}回</span>
      </div>
      {unmet.length > 0 && <p className="unmet">未達成：{unmet.map(getStationLabel).join('，')}</p>}
    </button>
  );
}
