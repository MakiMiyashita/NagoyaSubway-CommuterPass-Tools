import { useEffect, useState } from 'react';
import { FARES, PERIOD_LABELS, TICKET_LABELS, formatYen } from '../constants/fares';
import { getStationLabel } from '../data/stations';
import type { SearchConditions, StationRole } from '../types';

const ROLE_LABELS: Record<StationRole, string> = {
  endpoints: '始発・終着駅を指定する',
  via_hard: '必須の駅を指定する',
  via_soft: '通したい駅を指定する',
  avoid: '通さない駅を指定する',
};

interface Props {
  conditions: SearchConditions;
  activeRole: StationRole | 'filter_station';
  loading: boolean;
  hasResults: boolean;
  error: string;
  onConditionsChange: (conditions: SearchConditions) => void;
  onRoleChange: (role: StationRole) => void;
  onRemoveStation: (role: StationRole, station: string) => void;
  onSearch: () => void;
  onReset: () => void;
}

export function SearchPanel(props: Props) {
  const [fareOpen, setFareOpen] = useState(!props.hasResults);
  const [stationOpen, setStationOpen] = useState(true);
  const { conditions } = props;
  const fares = FARES[conditions.ticketKind][conditions.period];
  const selectedStationCount = Object.values(conditions.selections).reduce((total, stations) => total + stations.length, 0);
  const update = (patch: Partial<SearchConditions>) => props.onConditionsChange({ ...conditions, ...patch });

  useEffect(() => {
    setFareOpen(!props.hasResults);
    setStationOpen(true);
  }, [props.hasResults]);

  return (
    <div className="search-panel">
      <section className="search-builder">
        <div className="section-heading"><h2>検索</h2><button className="text-button" onClick={props.onReset}>リセット</button></div>
        <details className="search-accordion" open={fareOpen} onToggle={(event) => setFareOpen(event.currentTarget.open)}>
          <summary><span>定期券の種類・区間</span><small>{TICKET_LABELS[conditions.ticketKind]}・{PERIOD_LABELS[conditions.period]}・{conditions.minZone}〜{conditions.maxZone}区</small></summary>
          <div className="search-accordion-body">
            <div className="field-row">
              <label>定期券種別<select value={conditions.ticketKind} onChange={(event) => update({ ticketKind: event.target.value as SearchConditions['ticketKind'] })}>{Object.entries(TICKET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>期間<select value={conditions.period} onChange={(event) => update({ period: event.target.value as SearchConditions['period'] })}>{Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <div className="field-row">
              <label>区間下限<select value={conditions.minZone} onChange={(event) => update({ minZone: Number(event.target.value) })}>{fares.map((fare, index) => <option key={fare} value={index + 1}>{index + 1}区 ({formatYen(fare)})</option>)}</select></label>
              <label>区間上限<select value={conditions.maxZone} onChange={(event) => update({ maxZone: Number(event.target.value) })}>{fares.map((fare, index) => <option key={fare} value={index + 1}>{index + 1}区 ({formatYen(fare)})</option>)}</select></label>
            </div>
          </div>
        </details>
        <details className="search-accordion" open={stationOpen} onToggle={(event) => setStationOpen(event.currentTarget.open)}>
          <summary><span>定期を通したい駅</span><small>{selectedStationCount}駅を指定中</small></summary>
          <div className="search-accordion-body">
            <div className="role-tabs">
              {(Object.keys(ROLE_LABELS) as StationRole[]).map((role) => <button key={role} className={`${role} ${props.activeRole === role ? 'active' : ''}`} onClick={() => props.onRoleChange(role)}>{ROLE_LABELS[role]} <span>{conditions.selections[role].length}</span></button>)}
            </div>
            <div className="selection-summary">
              {(Object.keys(ROLE_LABELS) as StationRole[]).map((role) => conditions.selections[role].map((station) => <button key={`${role}-${station}`} className={`station-pill ${role}`} onClick={() => props.onRemoveStation(role, station)} title="選択解除">{getStationLabel(station)}<span>×</span></button>))}
              {selectedStationCount === 0 && <p className="empty-copy">地図の駅をタップして通したい駅を指定</p>}
            </div>
          </div>
        </details>
        {props.error && <p className="error-message" role="alert">{props.error}</p>}
        <button className="primary-button search-button" disabled={props.loading} onClick={props.onSearch}>{props.loading ? '経路を検索中…' : '検索'}</button>
      </section>
    </div>
  );
}
