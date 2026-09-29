import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { getSearchJob, getSearchJobResults, startSearchJob, stopSearchJob } from './api/solver';
import { Onboarding } from './components/Onboarding';
import { RouteCard } from './components/RouteCard';
import { ResultFilterPanel } from './components/ResultFilterPanel';
import { SearchPanel } from './components/SearchPanel';
import { SubwayMap } from './components/SubwayMap';
import { usePersistentConditions } from './hooks/usePersistentConditions';
import type { MapSelectionMode, RouteResult, SearchMeta, SortKey, StationRole } from './types';
import type { ResultFilters } from './utils/results';
import './styles/app-v2.css';

const ONBOARDING_KEY = 'nagoya-subway-onboarding-v1';
const RESULTS_PAGE_SIZE = 20;
const MINIMUM_PANEL_WIDTH = 340;
const MAXIMUM_PANEL_WIDTH = 720;
const PREFERRED_MAP_WIDTH = 560;
const maximumPanelWidth = (viewportWidth: number) => Math.max(
  MINIMUM_PANEL_WIDTH,
  Math.min(MAXIMUM_PANEL_WIDTH, viewportWidth - PREFERRED_MAP_WIDTH),
);
const emptyMeta: SearchMeta = {
  complete: true,
  timedOut: false,
  stopped: false,
  hasMore: false,
  returnedCount: 0,
  candidateCount: 0,
  modelsSeen: 0,
  discoveredCount: 0,
  elapsedSeconds: 0,
};

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
type PreviewPosition = 'search-preview' | 'result-preview';
type SheetPosition = 'collapsed' | PreviewPosition | 'open';
type SheetDrag = {
  pointerId: number;
  startY: number;
  startTranslate: number;
  currentTranslate: number;
  moved: boolean;
};

export default function App() {
  const { conditions, setConditions, resetConditions } = usePersistentConditions();
  const [activeRole, setActiveRole] = useState<MapSelectionMode>('via_soft');
  const [results, setResults] = useState<RouteResult[]>([]);
  const [meta, setMeta] = useState<SearchMeta>(emptyMeta);
  const [activeResultId, setActiveResultId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<SearchMeta>(emptyMeta);
  const activeJobId = useRef<string | undefined>(undefined);
  const [resultJobId, setResultJobId] = useState<string>();
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recommended');
  const [filters, setFilters] = useState<ResultFilters>({ minSatisfied: 0, minZone: 1, maxZone: 5, minStations: 2, maxStations: 50, stationIds: [], stationQuery: '' });
  const [visibleResultCount, setVisibleResultCount] = useState(RESULTS_PAGE_SIZE);
  const [panelWidth, setPanelWidth] = useState(() => maximumPanelWidth(window.innerWidth));
  const preferredPanelWidth = useRef(MAXIMUM_PANEL_WIDTH);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [sheetPosition, setSheetPosition] = useState<SheetPosition>('search-preview');
  const lastPreviewPosition = useRef<PreviewPosition>('search-preview');
  const sheetRef = useRef<HTMLElement>(null);
  const sheetDrag = useRef<SheetDrag | undefined>(undefined);
  const ignoreHandleClick = useRef(false);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem(ONBOARDING_KEY) !== 'seen');

  const activeRoute = results.find((result) => result.id === activeResultId);
  const positiveStationCount = new Set([
    ...conditions.selections.endpoints,
    ...conditions.selections.via_hard,
    ...conditions.selections.via_soft,
  ]).size;

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const searchButton = sheet?.querySelector<HTMLElement>('.search-button');
    const searchPanel = sheet?.querySelector<HTMLElement>('.search-panel');
    if (!sheet || !searchButton || !searchPanel) return;

    const updatePreviewHeight = () => {
      const height = searchButton.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + sheet.scrollTop + 14;
      sheet.style.setProperty('--search-preview-height', `${Math.ceil(height)}px`);
    };
    updatePreviewHeight();
    const observer = new ResizeObserver(updatePreviewHeight);
    observer.observe(searchPanel);
    window.addEventListener('resize', updatePreviewHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePreviewHeight);
    };
  }, []);

  useEffect(() => {
    const fitPanelToViewport = () => {
      setPanelWidth(Math.min(preferredPanelWidth.current, maximumPanelWidth(window.innerWidth)));
    };
    window.addEventListener('resize', fitPanelToViewport);
    return () => window.removeEventListener('resize', fitPanelToViewport);
  }, []);

  useEffect(() => {
    if (!resultJobId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await getSearchJobResults(resultJobId, filters, sortKey, visibleResultCount);
        if (cancelled) return;
        setResults(response.results);
        setMeta(response.search);
        setActiveResultId((current) => response.results.some((result) => result.id === current) ? current : response.results[0]?.id);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '経路の更新に失敗しました');
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filters, resultJobId, sortKey, visibleResultCount]);

  const changeFilters = (next: ResultFilters) => {
    setVisibleResultCount(RESULTS_PAGE_SIZE);
    setFilters(next);
  };

  const resizePanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const nextWidth = Math.max(MINIMUM_PANEL_WIDTH, Math.min(maximumPanelWidth(window.innerWidth), event.clientX));
    preferredPanelWidth.current = nextWidth;
    setPanelWidth(nextWidth);
  };

  const showSheetPreview = (position: PreviewPosition) => {
    lastPreviewPosition.current = position;
    setSheetPosition(position);
  };

  const returnToSheetTop = () => {
    sheetRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    showSheetPreview('search-preview');
  };

  const cycleSheetPosition = () => {
    setSheetPosition((current) => {
      if (current === 'collapsed') return 'open';
      if (current === 'open') return lastPreviewPosition.current;
      return 'collapsed';
    });
  };

  const getSheetSnapPoints = () => {
    const sheet = sheetRef.current;
    if (!sheet) return [];
    const height = sheet.getBoundingClientRect().height;
    const preview = lastPreviewPosition.current;
    const searchHeight = Number.parseFloat(getComputedStyle(sheet).getPropertyValue('--search-preview-height')) || 560;
    const previewHeight = preview === 'result-preview'
      ? 275
      : Math.min(searchHeight, window.innerHeight - 92);
    return [
      { position: 'open' as const, translate: 0 },
      { position: preview, translate: Math.max(0, height - previewHeight) },
      { position: 'collapsed' as const, translate: Math.max(0, height - 54) },
    ];
  };

  const startSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!window.matchMedia('(max-width: 760px)').matches || !sheetRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const transform = getComputedStyle(sheetRef.current).transform;
    const currentTranslate = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
    sheetRef.current.style.transition = 'none';
    sheetDrag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTranslate: currentTranslate,
      currentTranslate,
      moved: false,
    };
  };

  const moveSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sheetDrag.current;
    const sheet = sheetRef.current;
    if (!drag || !sheet || drag.pointerId !== event.pointerId) return;
    const delta = event.clientY - drag.startY;
    if (Math.abs(delta) > 4) drag.moved = true;
    const maximum = Math.max(0, sheet.getBoundingClientRect().height - 54);
    drag.currentTranslate = Math.min(maximum, Math.max(0, drag.startTranslate + delta));
    sheet.style.transform = `translateY(${drag.currentTranslate}px)`;
  };

  const finishSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sheetDrag.current;
    const sheet = sheetRef.current;
    if (!drag || !sheet || drag.pointerId !== event.pointerId) return;
    ignoreHandleClick.current = drag.moved;
    sheetDrag.current = undefined;

    if (drag.moved) {
      const nearest = getSheetSnapPoints().reduce((best, point) => (
        Math.abs(point.translate - drag.currentTranslate) < Math.abs(best.translate - drag.currentTranslate) ? point : best
      ));
      setSheetPosition(nearest.position);
    }

    window.requestAnimationFrame(() => {
      sheet.style.transition = '';
      sheet.style.transform = '';
    });
  };

  const handleSheetClick = () => {
    if (ignoreHandleClick.current) {
      ignoreHandleClick.current = false;
      return;
    }
    cycleSheetPosition();
  };

  const sheetHandleLabel = sheetPosition === 'collapsed'
    ? 'パネルを全開にする'
    : sheetPosition === 'open'
      ? 'パネルを中間表示にする'
      : 'パネルを最小化する';

  const changeConditions = (next: typeof conditions) => {
    let normalized = next;
    if (next.minZone > next.maxZone) normalized = { ...next, minZone: next.maxZone };
    setConditions(normalized);
  };

  const toggleStation = (station: string) => {
    if (activeRole === 'filter_station') {
      changeFilters({
        ...filters,
        stationIds: filters.stationIds.includes(station)
          ? filters.stationIds.filter((item) => item !== station)
          : [...filters.stationIds, station],
      });
      return;
    }
    const selections = Object.fromEntries(
      Object.entries(conditions.selections).map(([role, stations]) => [role, stations.filter((item) => item !== station)]),
    ) as typeof conditions.selections;
    const alreadySelected = conditions.selections[activeRole].includes(station);
    if (!alreadySelected) {
      selections[activeRole] = activeRole === 'endpoints'
        ? [...selections[activeRole].slice(-1), station]
        : [...selections[activeRole], station];
    }
    changeConditions({ ...conditions, selections });
  };

  const removeStation = (role: StationRole, station: string) => {
    changeConditions({
      ...conditions,
      selections: { ...conditions.selections, [role]: conditions.selections[role].filter((item) => item !== station) },
    });
  };

  const handleSearch = async () => {
    if (positiveStationCount < 2) {
      setError('始発・終着，必須，希望駅の中から，異なる駅を2駅以上選んでください');
      setSheetPosition('open');
      return;
    }
    setLoading(true);
    setStopping(false);
    setProgress({ ...emptyMeta, complete: false });
    setResultJobId(undefined);
    setError('');
    try {
      const jobId = await startSearchJob(conditions);
      activeJobId.current = jobId;
      let job = await getSearchJob(jobId);
      while (job.status === 'running') {
        setProgress(job.response.search);
        await wait(250);
        job = await getSearchJob(jobId);
      }
      if (job.status === 'error') throw new Error(job.error || '経路の検索に失敗しました');
      setProgress(job.response.search);
      setResults(job.response.results);
      setMeta(job.response.search);
      setActiveResultId(job.response.results[0]?.id);
      setResultJobId(jobId);
      setActiveRole('filter_station');
      setVisibleResultCount(RESULTS_PAGE_SIZE);
      setFilters({
        minSatisfied: 0,
        minZone: conditions.minZone,
        maxZone: conditions.maxZone,
        minStations: 2,
        maxStations: 50,
        stationIds: [],
        stationQuery: '',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '検索中にエラーが発生しました');
    } finally {
      activeJobId.current = undefined;
      setLoading(false);
      setStopping(false);
    }
  };

  const handleStopSearch = async () => {
    if (!activeJobId.current || stopping) return;
    setStopping(true);
    try {
      await stopSearchJob(activeJobId.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '検索を中断できませんでした');
      setStopping(false);
    }
  };

  const handleReset = () => {
    resetConditions();
    setResults([]);
    setMeta(emptyMeta);
    setActiveResultId(undefined);
    setResultJobId(undefined);
    setError('');
    setActiveRole('via_soft');
    returnToSheetTop();
  };

  const closeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'seen');
    setShowOnboarding(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div><span className="brand-mark">N</span><div><strong>なごや地下鉄定期ナビ</strong><small>行きたい駅から探すベストな経路</small></div></div>
        <button className="help-button" onClick={() => setShowOnboarding(true)}>使い方</button>
      </header>
      <main style={{ '--panel-width': `${panelWidth}px` } as CSSProperties}>
        <SubwayMap
          selections={conditions.selections}
          filterStationIds={filters.stationIds}
          activeRole={activeRole}
          activeRoute={activeRoute}
          onStationClick={toggleStation}
          overlay={resultJobId ? (
            <ResultFilterPanel
              filters={filters}
              preferredCount={conditions.selections.via_soft.length}
              onFiltersChange={changeFilters}
            />
          ) : undefined}
        />
        <div
          className="panel-resizer"
          role="separator"
          aria-label="操作パネルの幅を変更"
          aria-orientation="vertical"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={resizePanel}
        />
        <aside
          ref={sheetRef}
          className={`workspace-panel ${sheetPosition}`}
          onScroll={(event) => setShowBackToTop(event.currentTarget.scrollTop > 100)}
        >
          <div className="sheet-topbar">
            <button
              className="sheet-handle"
              onClick={handleSheetClick}
              onPointerDown={startSheetDrag}
              onPointerMove={moveSheetDrag}
              onPointerUp={finishSheetDrag}
              onPointerCancel={finishSheetDrag}
              aria-label={sheetHandleLabel}
              title={sheetHandleLabel}
            ><span /></button>
            <button className="sheet-top-button" onClick={returnToSheetTop}>上に戻る</button>
          </div>
          <SearchPanel
            conditions={conditions}
            activeRole={activeRole}
            loading={loading}
            hasResults={Boolean(resultJobId)}
            error={error}
            onConditionsChange={changeConditions}
            onRoleChange={setActiveRole}
            onRemoveStation={removeStation}
            onSearch={handleSearch}
            onReset={handleReset}
          />
          {resultJobId && (
            <div className="result-summary-bar">
              <label>並べ替え
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                  <option value="recommended">おすすめ順</option>
                  <option value="satisfaction">希望達成数</option>
                  <option value="zone">区間が小さい順</option>
                  <option value="stations">駅数が多い順</option>
                </select>
              </label>
              <p><strong>全{meta.candidateCount.toLocaleString()}件</strong><span>{results.length}件を表示中</span></p>
            </div>
          )}
          <div className="route-list">
            {results.map((result) => (
              <RouteCard
                key={result.id}
                result={result}
                preferredStations={conditions.selections.via_soft}
                ticketKind={conditions.ticketKind}
                period={conditions.period}
                selected={result.id === activeResultId}
                onSelect={() => {
                  const isSelected = result.id === activeResultId;
                  setActiveResultId(isSelected ? undefined : result.id);
                  if (!isSelected) showSheetPreview('result-preview');
                }}
              />
            ))}
            {!loading && resultJobId && results.length === 0 && <p className="empty-results">条件を満たす経路が見つかりませんでした</p>}
            {!loading && results.length < meta.candidateCount && (
              <button className="load-more-button" onClick={() => setVisibleResultCount((count) => count + RESULTS_PAGE_SIZE)}>
                次の{Math.min(RESULTS_PAGE_SIZE, meta.candidateCount - results.length)}件を表示
              </button>
            )}
          </div>
          {showBackToTop && <button className="back-to-top-button" onClick={returnToSheetTop} aria-label="パネルの先頭へ戻る"><strong>↑</strong> 上に戻る</button>}
          <footer className="publication-info">
            <strong>このサービスについて</strong>
            <p>
              個人制作の非公式サービスであり，名古屋市交通局とは関係ありません．表示する経路・料金は参考情報であり，
              定期券の発売・購入可否を保証しません．購入前に公式情報または駅窓口で確認してください．
            </p>
            <nav aria-label="名古屋市交通局の公式情報">
              <a href="https://www.kotsu.city.nagoya.jp/" target="_blank" rel="noreferrer">交通局公式サイト</a>
              <a href="https://map.kotsu.city.nagoya.jp/rp/subway/trp0000172.htm" target="_blank" rel="noreferrer">地下鉄料金・定期券料金</a>
              <a href="https://www.kotsu.city.nagoya.jp/rp/ticket/trp0000283.htm" target="_blank" rel="noreferrer">定期券の購入方法</a>
              <a href="https://www.kotsu.city.nagoya.jp/rp/subway/routemap.html" target="_blank" rel="noreferrer">公式路線図</a>
            </nav>
            <details>
              <summary>データ利用・クレジット</summary>
              <p>
                選択した検索条件はブラウザ内に保存され，検索時に経路計算APIへ送信されます．
                経路探索には<a href="https://potassco.org/clingo/" target="_blank" rel="noreferrer">clingo</a>，
                画面には<a href="https://react.dev/" target="_blank" rel="noreferrer">React</a>を使用しています．
              </p>
              <p>情報更新日：2026年9月30日</p>
            </details>
            <div className="publication-contact">
              <strong>お問い合わせ</strong>
              <p>
                不具合や掲載情報の修正は，
                <a href="https://github.com/MakiMiyashita/NagoyaSubway-CommuterPass-Tools/issues" target="_blank" rel="noreferrer">GitHub Issues</a>
                からお知らせください．定期券の購入可否など，個別の交通案内には回答できません．
              </p>
            </div>
            <p className="copyright">© 2026 NagoyaSubway-CommuterPass-Tools</p>
          </footer>
        </aside>
      </main>
      {loading && (
        <div className="search-progress-backdrop" role="dialog" aria-modal="true" aria-labelledby="search-progress-title">
          <div className="search-progress-card">
            <div className="search-animation" aria-hidden="true"><span /><span /><span /></div>
            <p className="eyebrow">ROUTE EXPLORATION</p>
            <h2 id="search-progress-title">経路を検索中</h2>
            <p className="discovery-count"><strong>{progress.candidateCount.toLocaleString()}</strong>件の経路が見つかりました</p>
            <p className="search-progress-detail">{progress.modelsSeen.toLocaleString()}通りを検証済み・{progress.elapsedSeconds.toFixed(1)}秒</p>
            {progress.elapsedSeconds < 6 ? (
              <p className="stop-guidance">全経路の検索には時間がかかる場合があります</p>
            ) : (
              <button className="stop-search-button" disabled={stopping} onClick={handleStopSearch}>
                {stopping ? '検索を中断しています…' : '検索を中断'}
              </button>
            )}
          </div>
        </div>
      )}
      {showOnboarding && <Onboarding onClose={closeOnboarding} />}
    </div>
  );
}
