import { useLayoutStore } from '../../store/layoutStore';
import { clampZoom, formatMillimeters, MAX_ZOOM, MIN_ZOOM, roomBounds } from '../../utils/coordinates';
import { Icon } from '../icons/Icon';

type EditorStatusBarProps = { onFit: () => void; onFocusSelected: () => void; hasSelection: boolean; onRetry: () => void };

export function EditorStatusBar({ onFit, onFocusSelected, hasSelection, onRetry }: EditorStatusBarProps) {
  const zoom = useLayoutStore((state) => state.zoom);
  const setZoom = useLayoutStore((state) => state.setZoom);
  const project = useLayoutStore((state) => state.project);
  const settings = project.settings;
  const lastSavedAt = useLayoutStore((state) => state.lastSavedAt);
  const saveStatus = useLayoutStore((state) => state.saveStatus);
  const bounds = roomBounds(project.room.vertices);
  const savedLabel = lastSavedAt
    ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(lastSavedAt))
    : '저장 대기';
  const saveLabel = saveStatus === 'saving' || saveStatus === 'server-saving'
    ? '저장 중…'
    : saveStatus === 'server-saved'
      ? '서버 저장 완료'
      : saveStatus === 'conflict'
        ? '서버 버전 충돌'
        : saveStatus === 'offline'
          ? '오프라인 · 로컬 저장됨'
    : saveStatus === 'failed'
      ? '저장 실패'
      : `로컬 저장 ${savedLabel}`;
  const compactSaveLabel = saveStatus === 'saving' || saveStatus === 'server-saving'
    ? '저장 중…'
    : saveStatus === 'server-saved'
      ? '서버 저장됨'
      : saveStatus === 'conflict'
        ? '충돌'
        : saveStatus === 'offline'
          ? '오프라인'
    : saveStatus === 'failed'
      ? '저장 실패'
      : '저장됨';

  return (
    <footer className="status-bar">
      <div className="status-group">
        <button className="icon-button icon-button--small" onClick={() => setZoom(clampZoom(zoom / 1.15))} title="화면 축소" aria-label="화면 축소"><Icon name="minus" size={16} /></button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <input className="zoom-slider" type="range" min={MIN_ZOOM * 100} max={MAX_ZOOM * 100} step={5} value={Math.round(zoom * 100)} onChange={(event) => setZoom(clampZoom(Number(event.target.value) / 100))} aria-label="화면 배율" aria-valuetext={`${Math.round(zoom * 100)}%`} />
        <button className="icon-button icon-button--small" onClick={() => setZoom(clampZoom(zoom * 1.15))} title="화면 확대" aria-label="화면 확대"><Icon name="plus" size={16} /></button>
        <button className="status-button" onClick={onFit} title="전체 공간을 화면에 맞춤"><Icon name="fit" size={15} />화면 맞춤</button>
        <button className="status-button" onClick={onFocusSelected} disabled={!hasSelection} title="선택 객체를 화면 가운데로 이동"><Icon name="fit" size={15} />선택 맞춤</button>
      </div>
      <div className="status-group status-group--center">
        <span className="status-info"><strong>{project.projectName}</strong></span>
        <span className="status-divider" aria-hidden="true">·</span>
        <span className="status-info">{formatMillimeters(bounds.width, settings.unit)} × {formatMillimeters(bounds.height, settings.unit)}</span>
        <span className="status-divider" aria-hidden="true">·</span>
        <span className="status-info">객체 {project.objects.length}개</span>
      </div>
      <div className="status-group status-group--right">
        <div className="status-control" aria-label="고정 격자 크기">
          <Icon name="grid" size={15} />
          <span>격자</span>
          <strong>{formatMillimeters(settings.gridSize, settings.unit)}</strong>
        </div>
        <span className={`status-info status-snap ${settings.snapEnabled ? 'is-on' : 'is-off'}`}><i aria-hidden="true" />격자 <strong>{settings.snapEnabled ? '켜짐' : '꺼짐'}</strong></span>
        <span className={`status-info status-snap ${settings.objectSnapEnabled ? 'is-on' : 'is-off'}`}><i aria-hidden="true" />객체 <strong>{settings.objectSnapEnabled ? '켜짐' : '꺼짐'}</strong></span>
        <span className={`status-info status-snap ${settings.orthogonalSnapEnabled ? 'is-on' : 'is-off'}`}><i aria-hidden="true" />직각 <strong>{settings.orthogonalSnapEnabled ? '켜짐' : '꺼짐'}</strong></span>
        {(saveStatus === 'failed' || saveStatus === 'offline') && <button className="status-button" onClick={onRetry}>저장 재시도</button>}
        <span className={`save-state is-${saveStatus}`} role="status" aria-live="polite" aria-atomic="true" aria-label={saveLabel}><i aria-hidden="true" /><span className="save-state__full">{saveLabel}</span><span className="save-state__compact">{compactSaveLabel}</span></span>
      </div>
    </footer>
  );
}
